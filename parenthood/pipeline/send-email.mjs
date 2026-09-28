#!/usr/bin/env node
// Nightly email: each member gets the day's one-sentence takeaway in their language + a link to read the digest,
// plus, on some days, one short question for them (digest.ask; shown only here, never on the site).
// Replies go to <mailbox>+digest@…, where the next morning's run picks them up as notes for the digest.
// Usage: node send-email.mjs --data <dir> [--date D] [--at 20:30] [--dry-run] [--force] [--only <member key>]
//   --at HH:MM  wait until this Pacific time. GitHub's scheduled runs can start hours late, so the workflow starts
//               several runs in the afternoon; whichever starts first waits here until exactly HH:MM.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import nodemailer from 'nodemailer';
import { Store, replyAddress } from './lib/store.mjs';
import { parseArgs, log, SITE_URL, WORK_ROOT } from './lib/env.mjs';
import { todayPT, ptWallTimeToEpoch } from './lib/dates.mjs';

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function strip(md = '') {
  return String(md).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim();
}

export function renderEmail({ digest, lang, link, name, who }) {
  const e = digest[lang];
  const ko = lang === 'ko';
  const d = new Date(`${digest.date}T12:00:00Z`);
  const dateLabel = ko
    ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]}요일`
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const t = ko
    ? { day: `${digest.day}일차`, gist: '오늘의 핵심', read: '오늘의 다이제스트 읽기 · 3분', foot: '매일 밤 8시 30분(태평양 시간)에 보내 드립니다. 이 메일에 답장하시면 새 소식이나 궁금한 주제가 다음 다이제스트에 반영됩니다.', from: '부모 되기 다이제스트', ask: '여쭙고 싶은 점', askHint: '이 메일에 한 줄로 답장해 주시면 됩니다.' }
    : { day: `Day ${digest.day}`, gist: 'The gist', read: 'Read today\'s digest · 3 min', foot: 'Sent nightly at 8:30pm Pacific. Reply to this email with news, a worry or a topic, and the next digests will take it in.', from: 'Parenthood Digest', ask: 'A quick question', askHint: 'Just reply to this email; a line is enough.' };
  const ask = digest.ask && (digest.ask.to === 'both' || digest.ask.to === who) ? strip(digest.ask[lang] || '') : '';
  const subject = `${t.day} · ${strip(e.title)}`;
  const greeting = name ? (ko ? `${name} 님, 좋은 저녁입니다` : `Good evening, ${name}`) : '';
  const font = ko
    ? "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',Pretendard,Helvetica,Arial,sans-serif"
    : "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const mono = "'SF Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(strip(e.takeaway))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:28px 16px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${font};${ko ? 'word-break:keep-all;' : ''}">
<tr><td style="padding:0 0 18px;border-bottom:1px solid #e5e9e6;">
  <span style="font:700 13px/20px 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:.02em;color:#0a0a0a;">PARENTHOOD</span>
  <span style="font:500 11px/20px ${mono};color:#2d593e;background:#eef3ef;border:1px solid #cfd9d1;padding:2px 6px;margin-left:8px;">${esc(t.day.toUpperCase())}</span>
</td></tr>
<tr><td style="padding:22px 0 0;font:400 12px/18px ${mono};color:#6c756f;">${esc(dateLabel)}${greeting ? ` · ${esc(greeting)}` : ''}</td></tr>
<tr><td style="padding:6px 0 0;font:400 21px/29px ${font};color:#0a0a0a;">${esc(strip(e.title))}</td></tr>
<tr><td style="padding:22px 0 0;">
  <div style="border-left:2px solid #2d593e;padding:2px 0 2px 14px;">
    <div style="font:500 11px/16px ${mono};letter-spacing:.06em;text-transform:uppercase;color:#2d593e;">${esc(t.gist)}</div>
    <div style="padding-top:6px;font:400 17px/27px ${font};color:#19201c;">${esc(strip(e.takeaway))}</div>
  </div>
</td></tr>
${ask ? `<tr><td style="padding:22px 0 0;">
  <div style="border:1px solid #cddfeb;background:#edf4f9;padding:12px 14px 13px;">
    <div style="font:500 11px/16px ${mono};letter-spacing:.06em;text-transform:uppercase;color:#286b98;">${esc(t.ask)}</div>
    <div style="padding-top:6px;font:400 16px/25px ${font};color:#19201c;">${esc(ask)}</div>
    <div style="padding-top:6px;font:400 12px/18px ${mono};color:#6c756f;">${esc(t.askHint)}</div>
  </div>
</td></tr>
` : ''}<tr><td style="padding:26px 0 0;">
  <a href="${esc(link)}" style="display:inline-block;font:500 13px/20px ${mono};color:#ffffff;background:#2d593e;text-decoration:none;padding:11px 16px;">${esc(t.read)} &rarr;</a>
</td></tr>
<tr><td style="padding:34px 0 0;border-bottom:1px solid #e5e9e6;"></td></tr>
<tr><td style="padding:12px 0 0;font:400 11px/18px ${mono};color:#7d8580;">${esc(t.foot)} <a href="${esc(SITE_URL)}" style="color:#7d8580;">paulscotti.com/parenthood</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${t.day} · ${dateLabel}`,
    strip(e.title),
    '',
    `${t.gist}: ${strip(e.takeaway)}`,
    '',
    ...(ask ? [`${t.ask}: ${ask}`, `(${t.askHint})`, ''] : []),
    `${t.read}: ${link}`,
    '',
    t.foot,
  ].join('\n');
  return { subject, html, text, fromName: t.from };
}

function gmailRejected() {
  log('Gmail rejected the login (username and app password not accepted), so nothing was sent.');
  log('Fix: on your Mac run `node parenthood/pipeline/setup.mjs --gmail`. It asks for a new app password from');
  log('https://myaccount.google.com/apppasswords, tests the login, and only then saves it.');
  process.exit(1);
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);
  if (!process.env.PARENTHOOD_PASSPHRASE) {
    log('PARENTHOOD_PASSPHRASE is not set yet - skipping.');
    process.exit(0);
  }
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!dryRun && (!user || !pass)) {
    log('GMAIL_USER / GMAIL_APP_PASSWORD not configured - skipping (see parenthood/SETUP.md).');
    process.exit(0);
  }
  const date = args.date || todayPT();

  // Check the Gmail login before any waiting, so bad credentials fail in the afternoon runs, not at 8:30pm.
  const transport = dryRun ? null : nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  if (transport) {
    try {
      await transport.verify();
    } catch (e) {
      if (e.code === 'EAUTH') gmailRejected();
      log(`Could not check the Gmail login now (${e.code || e.message}); will try again when sending.`);
    }
  }

  if (args.at && !dryRun) {
    const [hh, mm] = String(args.at).split(':').map(Number);
    const wait = ptWallTimeToEpoch(date, hh, mm) - Date.now();
    if (wait > 340 * 60_000) { // GitHub jobs are capped at 6 hours; a later run will pick it up
      log(`Too early for ${args.at} PT (${Math.round(wait / 60000)} min away); a later run will send.`);
      process.exit(0);
    }
    if (wait > 0) {
      log(`Waiting ${Math.round(wait / 1000)} s until ${args.at} PT…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  const dataDir = path.resolve(args.data || 'data');
  if (args.pull) {
    // The checkout may be hours old after waiting; pick up a digest generated since then.
    try { execFileSync('git', ['pull', '-q', '--ff-only'], { cwd: dataDir, stdio: 'ignore' }); } catch { log('Could not refresh the data checkout; using what we have.'); }
  }
  const store = Store.open(dataDir, process.env.PARENTHOOD_PASSPHRASE);
  const priv = store.readPrivate();
  const members = (priv.members || []).filter((m) => !args.only || m.key === args.only);
  if (!members.length) {
    log('No members configured.');
    process.exit(1);
  }
  const status = store.readStatus();
  const replyTo = replyAddress(priv.mailbox || user);

  const send = async (to, subject, html, text, fromName) => {
    if (dryRun) {
      const dir = path.join(WORK_ROOT, 'email-preview');
      fs.mkdirSync(dir, { recursive: true });
      const base = path.join(dir, `${date}-${to.split('@')[0]}`);
      fs.writeFileSync(`${base}.html`, html);
      fs.writeFileSync(`${base}.txt`, `Subject: ${subject}\nReply-To: ${replyTo}\n\n${text}`);
      log(`dry-run: wrote ${base}.html`);
      return;
    }
    try {
      await transport.sendMail({ from: `"${fromName}" <${user}>`, to, replyTo: replyTo || undefined, subject, html, text });
    } catch (e) {
      if (e.code === 'EAUTH') gmailRejected();
      throw e;
    }
  };

  if (!store.hasDigest(date)) {
    const admin = members.find((m) => m.key === 'paul') || members.find((m) => m.lang === 'en') || members[0];
    if (status.alertedFor !== date) {
      await send(admin.email, `Parenthood digest: no digest for ${date}`,
        `<p>The digest for ${date} was not generated, so tonight's email was skipped.</p><p>Check the <b>parenthood-generate</b> workflow in GitHub Actions, or run it manually.</p>`,
        `The digest for ${date} was not generated, so tonight's email was skipped. Check the parenthood-generate workflow in GitHub Actions.`,
        'Parenthood');
      if (!dryRun) store.writeStatus({ ...status, alertedFor: date });
    }
    log(`No digest for ${date}; alerted admin.`);
    process.exit(1);
  }
  if (status.emailed?.[date] && !args.force && !dryRun) {
    log(`Email for ${date} already sent.`);
    process.exit(0);
  }

  const digest = store.readDigest(date);
  const link = `${SITE_URL}#/d/${date}`;
  for (const m of members) {
    const lang = m.lang === 'ko' ? 'ko' : 'en';
    const mail = renderEmail({ digest, lang, link, name: m.name?.[lang], who: m.key });
    await send(m.email, mail.subject, mail.html, mail.text, mail.fromName);
  }
  if (!dryRun) store.writeStatus({ ...status, emailed: { ...(status.emailed || {}), [date]: new Date().toISOString() } });
  log(`${dryRun ? 'Rendered' : 'Sent'} ${members.length} email(s) for Day ${digest.day} (${date}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
