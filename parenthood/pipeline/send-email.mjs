#!/usr/bin/env node
// Nightly email: each member gets the day's one-sentence takeaway in their language + a link to read the digest.
// Usage: node send-email.mjs [--date D] [--at 21:30] [--dry-run] [--force] [--only email]
//   --at HH:MM  wait until this Pacific time (GitHub cron fires early/late; this makes delivery precise).
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { initDb, hasCredentials, getMembers, FieldValue } from './lib/db.mjs';
import { parseArgs, log, SITE_URL, WORK_ROOT } from './lib/env.mjs';
import { todayPT, ptWallTimeToEpoch } from './lib/dates.mjs';

const args = parseArgs();
const dryRun = Boolean(args['dry-run']);
if (!hasCredentials()) {
  log('No Firebase credentials configured yet - skipping.');
  process.exit(0);
}
if (!dryRun && (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD)) {
  log('GMAIL_USER / GMAIL_APP_PASSWORD not configured - skipping (see parenthood/SETUP.md).');
  process.exit(0);
}

const date = args.date || todayPT();

// ---- precise timing -----------------------------------------------------------------------------------------
if (args.at && !dryRun) {
  const [hh, mm] = String(args.at).split(':').map(Number);
  const target = ptWallTimeToEpoch(date, hh, mm);
  const wait = target - Date.now();
  if (wait > 50 * 60_000) {
    log(`Too early for ${args.at} PT (${Math.round(wait / 60000)} min away); a later run will send.`);
    process.exit(0);
  }
  if (wait > 0) {
    log(`Waiting ${Math.round(wait / 1000)} s until ${args.at} PT…`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

const db = initDb();
const ref = db.doc(`digests/${date}`);
const snap = await ref.get();
const members = (await getMembers(db)).filter((m) => !args.only || m.email === args.only);
if (!members.length) {
  log('No members configured.');
  process.exit(1);
}

const transport = dryRun ? null : nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

async function send(to, subject, html, text, fromName) {
  if (dryRun) {
    const dir = path.join(WORK_ROOT, 'email-preview');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `${date}-${to.split('@')[0]}`);
    fs.writeFileSync(`${base}.html`, html);
    fs.writeFileSync(`${base}.txt`, `Subject: ${subject}\n\n${text}`);
    log(`dry-run: wrote ${base}.html`);
    return;
  }
  await transport.sendMail({ from: `"${fromName}" <${process.env.GMAIL_USER}>`, to, subject, html, text });
}

if (!snap.exists) {
  // Tell the admin (first English-reading member) once; no email to anyone else.
  const status = (await db.doc('meta/status').get()).data() || {};
  const admin = members.find((m) => m.key === 'paul') || members.find((m) => m.lang === 'en') || members[0];
  if (status.alertedFor !== date) {
    await send(admin.email, `Parenthood digest: no digest for ${date}`,
      `<p>The digest for ${date} was not generated, so tonight's email was skipped.</p><p>Check the <b>parenthood-generate</b> workflow in GitHub Actions, or run it manually.</p>`,
      `The digest for ${date} was not generated, so tonight's email was skipped. Check the parenthood-generate workflow in GitHub Actions.`,
      'Parenthood');
    if (!dryRun) await db.doc('meta/status').set({ alertedFor: date }, { merge: true });
  }
  log(`No digest for ${date}; alerted admin.`);
  process.exit(1);
}

const digest = snap.data();
if (digest.emailedAt && !args.force && !dryRun) {
  log(`Email for ${date} already sent.`);
  process.exit(0);
}

const link = `${SITE_URL}#/d/${date}`;
let sent = 0;
for (const m of members) {
  const lang = m.lang === 'ko' ? 'ko' : 'en';
  const mail = renderEmail({ digest, lang, link, name: m.name?.[lang] });
  await send(m.email, mail.subject, mail.html, mail.text, mail.fromName);
  sent++;
}
if (!dryRun) await ref.set({ emailedAt: FieldValue.serverTimestamp() }, { merge: true });
if (!dryRun) await db.doc('meta/status').set({ lastEmailed: date }, { merge: true });
log(`${dryRun ? 'Rendered' : 'Sent'} ${sent} email(s) for Day ${digest.day} (${date}).`);

// ---- template -----------------------------------------------------------------------------------------------
function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function strip(md = '') {
  return String(md).replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/\s+/g, ' ').trim();
}

export function renderEmail({ digest, lang, link, name }) {
  const e = digest[lang];
  const ko = lang === 'ko';
  const d = new Date(`${digest.date}T12:00:00Z`);
  const dateLabel = ko
    ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]}요일`
    : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const t = ko
    ? { day: `${digest.day}일차`, gist: '오늘의 핵심', read: '오늘의 다이제스트 읽기 · 3분', talk: '오늘 밤 함께 이야기해 보세요', foot: '매일 밤 9시 30분(태평양 시간)에 보내 드립니다.', from: '부모 되기 다이제스트' }
    : { day: `Day ${digest.day}`, gist: 'The gist', read: 'Read today\'s digest · 3 min', talk: 'Talk about tonight', foot: 'Sent nightly at 9:30pm Pacific.', from: 'Parenthood Digest' };
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
<tr><td style="padding:26px 0 0;">
  <a href="${esc(link)}" style="display:inline-block;font:500 13px/20px ${mono};color:#ffffff;background:#2d593e;text-decoration:none;padding:11px 16px;">${esc(t.read)} &rarr;</a>
</td></tr>
${e.talk ? `<tr><td style="padding:28px 0 0;">
  <div style="font:500 11px/16px ${mono};letter-spacing:.06em;text-transform:uppercase;color:#6c756f;">${esc(t.talk)}</div>
  <div style="padding-top:6px;font:400 15px/25px ${font};color:#5e5e5e;">${esc(strip(e.talk))}</div>
</td></tr>` : ''}
<tr><td style="padding:34px 0 0;border-bottom:1px solid #e5e9e6;"></td></tr>
<tr><td style="padding:12px 0 0;font:400 11px/18px ${mono};color:#7d8580;">${esc(t.foot)} <a href="${esc(SITE_URL)}" style="color:#7d8580;">paulscotti.com/parenthood</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${t.day} · ${dateLabel}`,
    strip(e.title),
    '',
    `${t.gist}: ${strip(e.takeaway)}`,
    '',
    `${t.read}: ${link}`,
    e.talk ? `\n${t.talk}: ${strip(e.talk)}` : '',
    '',
    t.foot,
  ].join('\n');
  return { subject, html, text, fromName: t.from };
}
