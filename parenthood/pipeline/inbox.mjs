#!/usr/bin/env node
// "Tell the digest" by email: fetch notes the couple sent to <mailbox>+digest@gmail.com (including replies to the
// nightly email) over Gmail IMAP, read-only, and add them to the encrypted private inbox for the next digest.
// Only messages from the two members that Gmail authenticated (DKIM/DMARC pass, or sent from this account) count.
// Usage: node inbox.mjs --data <dir>   (needs GMAIL_USER, GMAIL_APP_PASSWORD, PARENTHOOD_PASSPHRASE)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Store, replyAddress } from './lib/store.mjs';
import { parseArgs, log, SITE_DIR } from './lib/env.mjs';

/** Keep only what the person wrote: drop quoted history and signatures. */
export function stripQuoted(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    const l = line.trim();
    if (/^On .{0,200}wrote:$/i.test(l) || /^\d{4}년 .{0,200}작성:$/.test(l) || /님이 작성:$/.test(l)
      || /^-{2,}\s*Original Message\s*-{2,}$/i.test(l) || /^From: .+/.test(l) || l === '--') break;
    if (l.startsWith('>')) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

export function isAuthenticated(headers, labels) {
  if (labels && [...labels].some((l) => /\\Sent/i.test(l))) return true; // sent from this very account
  const ar = [].concat(headers.get('authentication-results') || []).join(' ').toLowerCase();
  return /dmarc=pass/.test(ar) || /dkim=pass[^;]*header\.(i|d)=@?gmail\.com/.test(ar);
}

export async function fetchInbox(store, { user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD } = {}) {
  if (!user || !pass) return { added: 0, skipped: 'no Gmail credentials' };
  const priv = store.readPrivate();
  const members = new Map((priv.members || []).map((m) => [m.email.toLowerCase(), m.key]));
  const to = replyAddress(priv.mailbox || user);
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  let added = 0;
  try {
    const boxes = await client.list();
    const all = boxes.find((b) => b.specialUse === '\\All')?.path || 'INBOX';
    const lock = await client.getMailboxLock(all, { readOnly: true });
    try {
      const lastUid = priv.mail?.lastUid || 0;
      const uids = (await client.search({ to, uid: `${lastUid + 1}:*` }, { uid: true })) || [];
      let maxUid = lastUid;
      for await (const msg of client.fetch(uids.filter((u) => u > lastUid), { source: true, labels: true, uid: true }, { uid: true })) {
        maxUid = Math.max(maxUid, msg.uid);
        const mail = await simpleParser(msg.source);
        const from = (mail.from?.value?.[0]?.address || '').toLowerCase();
        if (!members.has(from) || !isAuthenticated(mail.headers, msg.labels)) continue;
        const text = stripQuoted(mail.text || '');
        const subject = (mail.subject || '').replace(/^(re|fwd?):\s*/gi, '').trim();
        if (!text && !subject) continue;
        const id = `mail-${msg.uid}`;
        if ((priv.inbox ||= []).some((n) => n.id === id)) continue;
        priv.inbox.push({ id, from: members.get(from), date: (mail.date || new Date()).toISOString().slice(0, 10), subject: subject.slice(0, 200), text, status: 'open' });
        added++;
      }
      priv.mail = { ...(priv.mail || {}), lastUid: maxUid, checkedAt: new Date().toISOString() };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  store.writePrivate(priv);
  return { added };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs();
  const store = Store.open(path.resolve(args.data || path.join(SITE_DIR, '.data')), process.env.PARENTHOOD_PASSPHRASE);
  const res = await fetchInbox(store);
  log(res.skipped ? `Inbox skipped: ${res.skipped}` : `Inbox: ${res.added} new note(s).`);
}
