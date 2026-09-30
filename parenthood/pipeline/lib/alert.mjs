// Alerts to the site owner when an unattended run fails in a way only a person can fix (e.g. the Claude token was
// rejected), sent at most once per date and reason. gen-status.json in the data checkout (plain, non-sensitive, written
// only by the generate job) remembers the last failure, so the 8:30pm "no digest" email can say why and how to fix it.
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

const FILE = 'gen-status.json';

export const FIXES = {
  'claude-token': {
    what: 'Claude rejected the token saved in GitHub (CLAUDE_CODE_OAUTH_TOKEN), so the digest could not be written.',
    fix: [
      'On your Mac, in Terminal, in the paulscotti.github.io folder, run: node parenthood/pipeline/setup.mjs --claude',
      'It runs `claude setup-token` (sign in in the browser), then asks you to paste the token it printed, tests it, and saves it.',
      'Then GitHub → Actions → parenthood-generate → Run workflow (or wait for the next scheduled run).',
    ],
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

/** Record why generation failed for a date (reason is a key of FIXES, or another short code). */
export function recordFailure(dir, date, reason) {
  const s = readGenStatus(dir);
  writeGenStatus(dir, { ...s, lastFailure: { date, reason, at: new Date().toISOString() } });
}

/** Plain-text explanation and fix for a recorded failure on this date, or '' if none is known. */
export function failureNote(dir, date) {
  const f = readGenStatus(dir).lastFailure;
  const known = f?.date === date && FIXES[f.reason];
  return known ? `${known.what}\n\nTo fix it:\n${known.fix.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '';
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
  const alerted = Object.fromEntries(Object.entries({ ...(s.alerted || {}), [date]: reason }).slice(-14));
  writeGenStatus(store.dir, { ...readGenStatus(store.dir), alerted });
  return true;
}
