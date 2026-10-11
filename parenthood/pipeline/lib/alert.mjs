// Alerts to the site owner when an unattended run fails: right away when only a person can fix it (the Claude token
// was rejected), otherwise once a second attempt for the same day has failed, so there is still time before 8:30pm.
// At most one email per date and reason. gen-status.json in the data checkout (plain, non-sensitive, written only by
// the generate job) remembers failures, so the 8:30pm "no digest" email can say why and how to fix it.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const FILE = 'gen-status.json';
const RETRY = 'To retry now: GitHub → Actions → parenthood-generate → Run workflow. Later scheduled runs also retry; if none succeeds by 8:30pm, tonight\'s email is skipped.';

export const FIXES = {
  'claude-token': {
    what: 'Claude rejected the token saved in GitHub (CLAUDE_CODE_OAUTH_TOKEN), so the digest could not be written.',
    fix: [
      'On your Mac, in Terminal, in the paulscotti.github.io folder, run: node parenthood/pipeline/setup.mjs --claude',
      'It runs `claude setup-token` (sign in in the browser), then asks you to paste the token it printed, tests it, and saves it.',
      'Then GitHub → Actions → parenthood-generate → Run workflow (or wait for the next scheduled run).',
    ],
  },
  invalid: {
    what: 'Two attempts at today\'s digest kept failing its checks, even after the repair rounds.',
    fix: ['Open the run log (link below) to see which check failed.', RETRY],
  },
  claude: {
    what: 'Claude stopped with an error before finishing today\'s digest, on two attempts.',
    fix: ['Open the run log (link below); an overloaded or unavailable model usually clears up on its own.', RETRY],
  },
  crash: {
    what: 'The digest job itself crashed on two attempts today.',
    fix: ['Open the run log (link below) for the error, or ask Claude Code to look at it.', RETRY],
  },
};

export function readGenStatus(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
  } catch {
    return {};
  }
}

function writeGenStatus(dir, s) {
  fs.writeFileSync(path.join(dir, FILE), `${JSON.stringify(s, null, 2)}\n`);
}

const lastDates = (obj, n = 14) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-n));

/** Record why generation failed for a date; returns how many attempts for that date have failed so far. */
export function recordFailure(dir, date, reason, { runUrl } = {}) {
  const s = readGenStatus(dir);
  const attempts = lastDates({ ...(s.attempts || {}), [date]: (s.attempts?.[date] || 0) + 1 });
  writeGenStatus(dir, { ...s, attempts, lastFailure: { date, reason, at: new Date().toISOString(), ...(runUrl ? { runUrl } : {}) } });
  return attempts[date];
}

/** Plain-text explanation and fix for a recorded failure on this date, or '' if none is known. */
export function failureNote(dir, date) {
  const f = readGenStatus(dir).lastFailure;
  const known = f?.date === date && FIXES[f.reason];
  if (!known) return '';
  const steps = known.fix.map((l, i) => `${i + 1}. ${l}`).join('\n');
  return `${known.what}\n\nTo fix it:\n${steps}${f.runUrl ? `\n\nRun log: ${f.runUrl}` : ''}`;
}

/** Email the admin about a failure once per date and reason. Returns true if an email was sent. */
export async function alertOnce(store, date, reason) {
  const fix = FIXES[reason];
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const s = readGenStatus(store.dir);
  if (!fix || !user || !pass || s.alerted?.[date] === reason) return false;
  const members = store.readPrivate().members || [];
  const admin = members.find((m) => m.key === 'paul') || members[0];
  if (!admin?.email) return false;
  const text = `The digest for ${date} was not written.\n\n${failureNote(store.dir, date) || fix.what}`;
  const html = text.split('\n\n').map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  await transport.sendMail({ from: `"Parenthood" <${user}>`, to: admin.email, subject: `Parenthood digest: action needed for ${date}`, text, html });
  writeGenStatus(store.dir, { ...readGenStatus(store.dir), alerted: lastDates({ ...(s.alerted || {}), [date]: reason }) });
  return true;
}
