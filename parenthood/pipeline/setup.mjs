#!/usr/bin/env node
// One-command setup (run it in your own terminal - it asks for secrets and never prints them):
//   node parenthood/pipeline/setup.mjs
// 1. choose (or generate) the family password (7+ characters, case-sensitive)
// 2. encrypt the private profile, members and seed digests into the `parenthood-data` branch and push it
// 3. store the GitHub secrets the daily jobs need (passphrase, Gmail, Claude token) via `gh secret set`
// Re-runnable: with an existing data branch it verifies the passphrase and only adds what's missing.
//   --reseed   republish the seed digests from pipeline/private/seed (after editing them)
//   --gmail    only (re)enter the Gmail address and app password; the login is tested before it is saved
//   --claude   only (re)enter the Claude token from `claude setup-token`; it is tested before it is saved
// Test flags: --data-dir <dir> (plain folder, no git) --passphrase-file <f> --no-push --no-secrets
//             --no-login (with --claude: don't run `claude setup-token`, just ask for a token)
import fs from 'node:fs';
import os from 'node:os';
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

/** Log in to Gmail's SMTP server with these credentials. Returns null if Gmail accepted them, else a reason. */
async function checkGmail(user, pass) {
  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    return { untested: 'nodemailer is not installed (run npm install in parenthood/pipeline)' };
  }
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  try {
    await transport.verify();
    return null;
  } catch (e) {
    if (e.code === 'EAUTH') return { rejected: true };
    return { untested: e.code || e.message };
  } finally {
    transport.close();
  }
}

async function askGmailAppPassword(user, setSecret) {
  say(`\nGmail app password: sign in to Google as ${user}, open https://myaccount.google.com/apppasswords,`);
  say('create one named "parenthood", and paste the 16-character code here (spaces are fine). Press Enter to skip.');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const app = (await ask('Gmail app password: ', { hidden: true })).replace(/\s+/g, '');
    if (!app) {
      say('Skipped: the Gmail secrets were not changed.');
      return;
    }
    if (!/^[a-z0-9]{16}$/i.test(app)) {
      say(`That was ${app.length} characters; a Google app password is exactly 16 (letters or digits). Try again.`);
      continue;
    }
    const problem = await checkGmail(user, app);
    if (problem?.rejected) {
      say(`Gmail rejected ${user} with that app password. Make sure you created it while signed in as ${user}`);
      say('(the account menu at the top right of that page) and copied all 16 characters. Try again.');
      continue;
    }
    if (problem?.untested) say(`(Could not test the login from here: ${problem.untested}. Saving it anyway.)`);
    else say('✓ Gmail accepted the login.');
    setSecret('GMAIL_USER', user);
    setSecret('GMAIL_APP_PASSWORD', app);
    return;
  }
  say('The Gmail secrets were not changed. Rerun with --gmail once you have a new app password.');
}

/** Hidden input that may span lines (a long token can wrap when copied from a terminal); an empty line ends it. */
function askPasted(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(question);
      else if (s === '\r\n' || s === '\n') rl.output.write(s);
      else rl.output.write('*'.repeat(s.length));
    };
    const parts = [];
    rl.setPrompt(question);
    rl.prompt();
    rl.on('line', (line) => {
      if (!line.trim()) rl.close();
      else parts.push(line.trim());
    });
    rl.on('close', () => resolve(parts.join('').replace(/\s+/g, '')));
  });
}

/** Ask Claude for one word using only this token (a throwaway config dir, so this Mac's own login can't stand in). */
function checkClaudeToken(token) {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'parenthood-claude-'));
  const r = spawnSync('claude', ['-p', 'Reply with the single word OK.', '--model', 'opus', '--output-format', 'json', '--max-turns', '1'], {
    // No retries: the CLI otherwise retries a rejected token 11 times with backoff, which takes minutes.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8',
      CLAUDE_CODE_OAUTH_TOKEN: token, CLAUDE_CONFIG_DIR: cfg, CLAUDE_CODE_MAX_RETRIES: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' },
    encoding: 'utf8', timeout: 120_000,
  });
  fs.rmSync(cfg, { recursive: true, force: true });
  if (r.error) return { untested: r.error.code === 'ENOENT' ? 'the claude command is not installed on this Mac' : r.error.message };
  try {
    const json = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    return json.is_error ? { rejected: String(json.result || json.subtype || '').replace(/\s+/g, ' ').slice(0, 200) } : null;
  } catch {
    return { untested: (r.stderr || r.stdout || 'no output').replace(/\s+/g, ' ').trim().slice(0, 200) };
  }
}

async function askClaudeToken(setSecret) {
  const haveCli = spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
  if (haveCli && !args['no-login']) {
    say('\nRunning `claude setup-token`: sign in in the browser window it opens; it then prints a long-lived token.');
    spawnSync('claude', ['setup-token'], { stdio: 'inherit' });
    say('\nCopy the whole token it printed (it starts with sk-ant-oat and may wrap onto two lines).');
  } else {
    say('\nTo get a Claude token, run `claude setup-token` in another Terminal tab, sign in, and copy the whole token it');
    say('prints (it starts with sk-ant-oat and may wrap onto two lines).');
  }
  say('Paste it here, then press Enter on an empty line. Press Enter right away to skip.');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const token = await askPasted('Claude token: ');
    if (!token) {
      say('Skipped: the Claude token was not changed.');
      return;
    }
    if (!/^sk-ant-oat[0-9a-z]*-[A-Za-z0-9_-]{40,}$/.test(token)) {
      say(`That doesn't look like a whole token (${token.length} characters; it should start with sk-ant-oat). Try again.`);
      continue;
    }
    say(`Got ${token.length} characters; asking Claude to confirm it works…`);
    const problem = checkClaudeToken(token);
    if (problem?.rejected) {
      say(`Claude rejected it: ${problem.rejected}`);
      say('Run `claude setup-token` again and copy the entire token. Try again.');
      continue;
    }
    if (problem?.untested) say(`(Could not test it here: ${problem.untested}. Saving it anyway.)`);
    else say('✓ Claude accepted the token.');
    setSecret('CLAUDE_CODE_OAUTH_TOKEN', token);
    return;
  }
  say('The Claude token was not changed. Rerun with --claude when you have a new one.');
}

function secretSetter(repoSlug) {
  return (name, value) => {
    const r = spawnSync('gh', ['secret', 'set', name, '--repo', repoSlug], { input: value, stdio: ['pipe', 'ignore', 'inherit'] });
    if (r.status !== 0) throw new Error(`gh secret set ${name} failed`);
    say(`✓ Saved GitHub secret ${name}`);
  };
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

// --claude needs neither the family password nor the data branch: just the token and GitHub.
if (args.claude) {
  if (!repoSlug) {
    say('--claude needs the GitHub repo (it is not available with --data-dir).');
    process.exit(1);
  }
  await askClaudeToken(secretSetter(repoSlug));
  say('\nDone. Rerun today\'s digest: GitHub → Actions → parenthood-generate → Run workflow.');
  process.exit(0);
}

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
  const setSecret = secretSetter(repoSlug);
  if (!args.gmail) {
    say('\nNow the secrets for the daily jobs (stored encrypted in GitHub; press Enter to skip any and add it later).');
    setSecret('PARENTHOOD_PASSPHRASE', normalizePassphrase(passphrase));
  }
  await askGmailAppPassword(priv.mailbox, setSecret);
  if (!args.gmail) await askClaudeToken(setSecret);
}

say('\nDone. Open https://www.paulscotti.com/parenthood/ on each phone, enter the password, and pick who is reading.');
if (withSecrets) {
  say('To test the nightly email now: GitHub → Actions → parenthood-email → Run workflow.');
}
process.exit(0);
