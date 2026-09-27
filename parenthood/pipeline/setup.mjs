#!/usr/bin/env node
// One-time (re-runnable) setup for a Firebase project:
//   1. write the public web config to ../js/config.js           (--config <file with the firebaseConfig snippet>)
//   2. render + deploy Firestore security rules with the two member emails (from private/members.json)
//   3. upsert members, private profile, initial journey state
//   4. publish any seed digests in private/seed/*.json (validated first)
// Usage:
//   node setup.mjs --key ~/Downloads/<project>-firebase-adminsdk.json --config firebase-config.txt --self-host-auth
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node setup.mjs --emulator      (local testing)
import fs from 'node:fs';
import path from 'node:path';
import { initDb, useKeyFile, FieldValue, getLedger } from './lib/db.mjs';
import { validateDigest } from './lib/validate-core.mjs';
import { publishDigest } from './publish.mjs';
import { loadCurriculum, parseArgs, log, readJSON, PRIVATE_DIR, SITE_DIR } from './lib/env.mjs';

const args = parseArgs();
const emulator = Boolean(args.emulator || process.env.FIRESTORE_EMULATOR_HOST);
if (args.key) useKeyFile(args.key);

const members = readJSON(path.join(PRIVATE_DIR, 'members.json'));
const profile = readJSON(path.join(PRIVATE_DIR, 'profile.json'));

// ---- 1. web config (+ optional same-origin auth helper) --------------------------------------------------
function parseConfig(raw) {
  const cfg = {};
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    const m = raw.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) cfg[k] = m[1];
  }
  return cfg;
}
const configFile = path.join(SITE_DIR, 'js', 'config.js');
let cfg = parseConfig(fs.readFileSync(configFile, 'utf8'));
let configChanged = false;
if (args.config) {
  cfg = parseConfig(fs.readFileSync(args.config, 'utf8'));
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) throw new Error('Could not find apiKey/projectId/appId in --config file');
  cfg.authDomain ||= `${cfg.projectId}.firebaseapp.com`;
  configChanged = true;
}
if (args['self-host-auth']) {
  // Serve Firebase's sign-in helper from this site's own domain, so redirect sign-in is first-party and works on
  // phones, in-app browsers and home-screen shortcuts. Needs the OAuth client redirect URI (see SETUP.md).
  if (!cfg.projectId) throw new Error('Run with --config first (or together) so the project id is known');
  const repoRoot = path.resolve(SITE_DIR, '..');
  const base = `https://${cfg.projectId}.firebaseapp.com`;
  const files = [
    ['/__/auth/handler', '__/auth/handler.html'], ['/__/auth/handler.js', '__/auth/handler.js'],
    ['/__/auth/experiments.js', '__/auth/experiments.js'], ['/__/auth/iframe', '__/auth/iframe.html'],
    ['/__/auth/iframe.js', '__/auth/iframe.js'], ['/__/firebase/init.json', '__/firebase/init.json'],
  ];
  for (const [src, dest] of files) {
    const res = await fetch(base + src);
    if (!res.ok) throw new Error(`Could not download ${base + src} (${res.status})`);
    const out = path.join(repoRoot, dest);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  }
  const siteHost = new URL(process.env.PARENTHOOD_SITE_URL || 'https://www.paulscotti.com/parenthood/').host;
  cfg.authDomain = siteHost;
  configChanged = true;
  log(`Self-hosted the Firebase auth helper at https://${siteHost}/__/auth/ (commit the repo-root __/ folder).`);
  console.log(`  → Add this Authorized redirect URI to the OAuth client "Web client (auto created by Google Service)":\n     https://${siteHost}/__/auth/handler`);
}
if (configChanged) {
  const js = `// Firebase web config for the private site, written by pipeline/setup.mjs. These values are public by design
// (they identify the project); access to data is enforced by Firestore security rules.
export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
`;
  fs.writeFileSync(configFile, js);
  log(`Wrote js/config.js for project ${cfg.projectId} (authDomain ${cfg.authDomain})`);
}

// ---- 2. security rules --------------------------------------------------------------------------------------
const emails = members.map((m) => m.email.toLowerCase());
const rules = fs.readFileSync(path.join(SITE_DIR, 'firestore.rules'), 'utf8')
  .replaceAll('__MEMBER_EMAILS__', JSON.stringify(emails).replace(/"/g, "'"));
fs.writeFileSync(path.join(PRIVATE_DIR, 'firestore.rules'), rules);
const db = initDb();
if (emulator) {
  log('Emulator: rules written to pipeline/private/firestore.rules (the emulator loads them from firebase.json).');
} else if (!args['skip-rules']) {
  const { getSecurityRules } = await import('firebase-admin/security-rules');
  await getSecurityRules().releaseFirestoreRulesetFromSource(rules);
  log('Deployed Firestore security rules.');
}

// ---- 3. members, profile, state ------------------------------------------------------------------------------
for (const m of members) {
  await db.doc(`members/${m.email.toLowerCase()}`).set({ key: m.key, lang: m.lang, name: m.name }, { merge: true });
}
await db.doc('private/profile').set(profile);
const stateRef = db.doc('state/couple');
if (!(await stateRef.get()).exists) {
  await stateRef.set({ stage: 'ttc', updatedBy: 'setup', updatedAt: FieldValue.serverTimestamp() });
}
log(`Upserted ${members.length} members, the private profile, and the journey state.`);

// ---- 4. seed digests ------------------------------------------------------------------------------------------
const seedDir = path.join(PRIVATE_DIR, 'seed');
const seeds = fs.existsSync(seedDir) ? fs.readdirSync(seedDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const curriculum = loadCurriculum();
for (const f of seeds) {
  const digest = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
  const exists = (await db.doc(`digests/${digest.date}`).get()).exists;
  if (exists && !args['reseed']) { log(`Seed ${digest.date} already published; skipping (use --reseed to overwrite).`); continue; }
  const ledger = (await getLedger(db)).filter((e) => e.date !== digest.date);
  const { errors } = validateDigest(digest, { ledger, curriculum });
  if (errors.length) {
    errors.forEach((e) => console.log(`ERROR ${f}: ${e}`));
    throw new Error(`Seed ${f} is invalid`);
  }
  const res = await publishDigest(db, digest, { generator: { tool: 'seed' } });
  log(`Published seed ${digest.date} as Day ${res.day}.`);
}

log('Setup complete.');
if (!emulator) {
  console.log(`
Next steps (see parenthood/SETUP.md):
  gh secret set FIREBASE_SERVICE_ACCOUNT < <your key file>
  gh secret set CLAUDE_CODE_OAUTH_TOKEN          # from: claude setup-token
  gh secret set GMAIL_APP_PASSWORD               # from: https://myaccount.google.com/apppasswords
  gh variable set GMAIL_USER --body <your gmail address>
`);
}
process.exit(0);
