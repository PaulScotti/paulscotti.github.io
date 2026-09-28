#!/usr/bin/env node
// One-command setup (run it in your own terminal - it asks for secrets and never prints them):
//   node parenthood/pipeline/setup.mjs
// 1. choose (or generate) the family password (7+ characters, case-sensitive)
// 2. encrypt the private profile, members and seed digests into the `parenthood-data` branch and push it
// 3. store the GitHub secrets the daily jobs need (passphrase, Gmail, Claude token) via `gh secret set`
// Re-runnable: with an existing data branch it verifies the passphrase and only adds what's missing.
// Test flags: --data-dir <dir> (plain folder, no git) --passphrase-file <f> --no-push --no-secrets --reseed
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync, spawnSync } from 'node:child_process';
import { Store, EMPTY_PRIVATE, publicIndexFields } from './lib/store.mjs';
import { generatePassphrase, normalizePassphrase } from './lib/crypto.mjs';
import { validateDigest } from './lib/validate-core.mjs';
import { publishDigest } from './publish.mjs';
import { loadCurriculum, parseArgs, readJSON, PRIVATE_DIR, SITE_DIR } from './lib/env.mjs';

const args = parseArgs();
const REPO_ROOT = path.resolve(SITE_DIR, '..');
const BRANCH = 'parenthood-data';
const say = (s = '') => console.log(s);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(question);
        else if (s === '\r\n' || s === '\n') rl.output.write(s);
        else rl.output.write('*'.repeat(s.length));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---- 0. preflight -------------------------------------------------------------------------------------------
const members = readJSON(path.join(PRIVATE_DIR, 'members.json'));
const profile = readJSON(path.join(PRIVATE_DIR, 'profile.json'));
let repoSlug = '';
if (!args['data-dir']) {
  const url = git(REPO_ROOT, 'remote', 'get-url', 'origin');
  repoSlug = (url.match(/github\.com[:/](.+?)(\.git)?$/) || [])[1] || '';
  if (!args['no-secrets'] && spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) {
    say('GitHub CLI is not signed in. Run `gh auth login` first, then rerun this script.');
    process.exit(1);
  }
}

say('\nParenthood setup\n================\n');

// ---- 1. data checkout --------------------------------------------------------------------------------------
const dataDir = path.resolve(args['data-dir'] || path.join(SITE_DIR, '.data'));
if (!args['data-dir']) {
  const remote = git(REPO_ROOT, 'remote', 'get-url', 'origin');
  const branchExists = git(REPO_ROOT, 'ls-remote', '--heads', 'origin', BRANCH).length > 0;
  if (fs.existsSync(path.join(dataDir, '.git'))) {
    if (branchExists) git(dataDir, 'pull', '--ff-only', '--quiet', 'origin', BRANCH);
  } else if (branchExists) {
    execFileSync('git', ['clone', '--quiet', '--branch', BRANCH, '--single-branch', remote, dataDir], { stdio: 'inherit' });
  } else {
    fs.mkdirSync(dataDir, { recursive: true });
    git(dataDir, 'init', '--quiet');
    git(dataDir, 'checkout', '--quiet', '-b', BRANCH);
    git(dataDir, 'remote', 'add', 'origin', remote);
  }
} else {
  fs.mkdirSync(dataDir, { recursive: true });
}
const existing = fs.existsSync(path.join(dataDir, 'private.enc'));

// ---- 2. password -------------------------------------------------------------------------------------------
let passphrase = args['passphrase-file'] ? fs.readFileSync(args['passphrase-file'], 'utf8').trim() : '';
if (!passphrase) {
  if (existing) {
    passphrase = await ask('Enter your existing family password: ', { hidden: true });
  } else {
    say('Choose the family password you two will type once on each phone (Keychain can save it).');
    say('At least 7 characters and case-sensitive. Random-looking beats a word or a date, e.g. mixing');
    say('upper and lower case with a number (the encrypted files are public, so it should be hard to guess).');
    passphrase = await ask('Password (press Enter to generate one): ', { hidden: true });
    if (!passphrase) {
      passphrase = generatePassphrase();
      say(`\n  Your password:   ${passphrase}\n`);
      say('  Save it in your password manager and share it with Yoolim in person or by a private message.');
      const again = await ask('  Type it once to confirm: ');
      if (normalizePassphrase(again) !== normalizePassphrase(passphrase)) {
        say('That did not match (it is case-sensitive). Nothing was changed - rerun the script.');
        process.exit(1);
      }
    } else if (normalizePassphrase(passphrase).length < 7) {
      say('Please use at least 7 characters. Nothing was changed.');
      process.exit(1);
    } else {
      const again = await ask('Type it again: ', { hidden: true });
      if (normalizePassphrase(again) !== normalizePassphrase(passphrase)) {
        say('That did not match (it is case-sensitive). Nothing was changed - rerun the script.');
        process.exit(1);
      }
    }
  }
}

let store;
try {
  store = Store.open(dataDir, passphrase, { create: true });
} catch (e) {
  say(e.message);
  process.exit(1);
}

// ---- 3. private state, index, seed digests ------------------------------------------------------------------
const gmailDefault = (members.find((m) => m.key === 'paul') || members[0]).email;
const priv = { ...EMPTY_PRIVATE(), ...store.readPrivate() };
priv.profile = profile;
priv.members = members.map((m) => ({ ...m, email: m.email.toLowerCase() }));
priv.mailbox ||= gmailDefault;
const withSecrets = !args['data-dir'] && !args['no-secrets'];
if (withSecrets) {
  say('\nThe nightly emails are sent from a Gmail account, and replies to them come back to it as notes.');
  priv.mailbox = (await ask(`Gmail address to send from [${priv.mailbox}]: `)) || priv.mailbox;
}
store.writePrivate(priv);

const curriculum = loadCurriculum();
const seedDir = path.join(PRIVATE_DIR, 'seed');
const seeds = fs.existsSync(seedDir) ? fs.readdirSync(seedDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
let published = 0;
for (const f of seeds) {
  const digest = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
  if (store.hasDigest(digest.date) && !args.reseed) continue;
  const ledger = store.readPrivate().ledger.filter((e) => e.date !== digest.date);
  const { errors } = validateDigest(digest, { ledger, curriculum });
  if (errors.length) {
    errors.forEach((e) => say(`  ERROR ${f}: ${e}`));
    process.exit(1);
  }
  publishDigest(store, digest, { generator: { tool: 'seed' } });
  published++;
}
store.writeIndex({ ...store.readIndex(), ...publicIndexFields(store.readPrivate()) });
say(`✓ Encrypted data ready (${published} new digest${published === 1 ? '' : 's'}; ${store.readIndex().days.length} total).`);

// ---- 4. push the data branch ----------------------------------------------------------------------------------
if (!args['data-dir'] && !args['no-push']) {
  git(dataDir, 'add', '-A');
  const dirty = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: dataDir }).status !== 0;
  if (dirty) {
    git(dataDir, '-c', 'user.name=parenthood-setup', '-c', 'user.email=parenthood@users.noreply.github.com', 'commit', '--quiet', '-m', 'Update parenthood data');
    execFileSync('git', ['push', '--quiet', '-u', 'origin', BRANCH], { cwd: dataDir, stdio: 'inherit' });
    say(`✓ Pushed the encrypted data to the "${BRANCH}" branch.`);
  } else {
    say('✓ Data branch already up to date.');
  }
}

// ---- 5. GitHub secrets ------------------------------------------------------------------------------------------
if (withSecrets) {
  const setSecret = (name, value) => {
    const r = spawnSync('gh', ['secret', 'set', name, '--repo', repoSlug], { input: value, stdio: ['pipe', 'ignore', 'inherit'] });
    if (r.status !== 0) throw new Error(`gh secret set ${name} failed`);
    say(`✓ Saved GitHub secret ${name}`);
  };
  say('\nNow the secrets for the daily jobs (stored encrypted in GitHub; press Enter to skip any and add it later).');
  setSecret('PARENTHOOD_PASSPHRASE', normalizePassphrase(passphrase));
  setSecret('GMAIL_USER', priv.mailbox);
  say('\nGmail app password: open https://myaccount.google.com/apppasswords, create one named "parenthood",');
  say('and paste the 16 letters here (spaces are fine).');
  const app = (await ask('Gmail app password: ', { hidden: true })).replace(/\s+/g, '');
  if (app) setSecret('GMAIL_APP_PASSWORD', app);
  say('\nClaude token: in another terminal tab run `claude setup-token`, sign in, and paste the token it prints.');
  const token = await ask('Claude token (sk-ant-oat…): ', { hidden: true });
  if (token) setSecret('CLAUDE_CODE_OAUTH_TOKEN', token);
}

say('\nDone. Open https://www.paulscotti.com/parenthood/ on each phone, enter the password, and pick who is reading.');
if (withSecrets) {
  say('To test the nightly email now: GitHub → Actions → parenthood-email → Run workflow.');
}
process.exit(0);
