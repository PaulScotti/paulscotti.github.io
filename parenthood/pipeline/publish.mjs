#!/usr/bin/env node
// Publish a validated digest: digests/{date}, overview/{year}, ledger/{date}, meta/backlog, inbox statuses,
// plus optional translations for user-entered items. Usage: node publish.mjs <digest.json> [--translations f] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initDb, FieldValue, getLedger } from './lib/db.mjs';
import { validateDigest, readingText } from './lib/validate-core.mjs';
import { countWords } from './lib/text.mjs';
import { loadCurriculum, parseArgs, log } from './lib/env.mjs';

export function overviewEntry(d) {
  return {
    date: d.date, day: d.day, track: d.track, unit: d.unit,
    title: { en: d.en.title, ko: d.ko.title },
    takeaway: { en: d.en.takeaway, ko: d.ko.takeaway },
    glossary: (d.glossary || []).map((g) => ({ en: g.en, ko: g.ko, noteEn: g.noteEn || '', noteKo: g.noteKo || '' })),
  };
}

export function ledgerEntry(d) {
  return {
    date: d.date, day: d.day, unit: d.unit, track: d.track, depth: d.depth,
    title: d.en.title, takeaway: d.en.takeaway, nuggets: d.nuggets, keywords: d.keywords,
    buildsOn: d.buildsOn, sources: d.sources.map((s) => s.url),
    sections: d.en.sections.map((s) => s.heading),
  };
}

export async function publishDigest(db, digest, { generator = {}, translations = [] } = {}) {
  const date = digest.date;
  const year = date.slice(0, 4);
  const digestRef = db.doc(`digests/${date}`);
  const overviewRef = db.doc(`overview/${year}`);
  const backlogRef = db.doc('meta/backlog');

  const result = await db.runTransaction(async (t) => {
    const [existing, overview, backlog, earlierSnap] = await Promise.all([
      t.get(digestRef), t.get(overviewRef), t.get(backlogRef),
      t.get(db.collection('ledger').where('date', '<', date)),
    ]);
    const day = existing.exists ? existing.data().day : earlierSnap.size + 1;
    const doc = {
      ...digest,
      day,
      minutes: Math.max(2, Math.round(countWords(readingText(digest.en)) / 200)),
      generator,
      createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existing.exists && existing.data().emailedAt) doc.emailedAt = existing.data().emailedAt;
    t.set(digestRef, doc);

    const days = (overview.exists ? overview.data().days || [] : []).filter((x) => x.date !== date);
    days.push(overviewEntry({ ...digest, day }));
    days.sort((a, b) => (a.date < b.date ? 1 : -1));
    t.set(overviewRef, { year: Number(year), days, updatedAt: FieldValue.serverTimestamp() });

    t.set(db.doc(`ledger/${date}`), ledgerEntry({ ...digest, day }));

    if ((digest.unitProposals || []).length) {
      const proposals = backlog.exists ? backlog.data().proposals || [] : [];
      for (const p of digest.unitProposals) {
        if (p?.id && !proposals.some((x) => x.id === p.id)) proposals.push({ ...p, pri: p.pri || 2, proposedOn: date });
      }
      t.set(backlogRef, { proposals }, { merge: true });
    }
    for (const id of digest.addresses || []) {
      t.set(db.doc(`inbox/${id}`), { status: 'covered', coveredBy: date }, { merge: true });
    }
    return { day };
  });

  let translated = 0;
  for (const tr of translations) {
    if (!tr?.collection || !tr?.id || !['inbox', 'questions'].includes(tr.collection)) continue;
    const ref = db.doc(`${tr.collection}/${tr.id}`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    if (tr.collection === 'inbox') await ref.set({ text_en: tr.en, text_ko: tr.ko }, { merge: true });
    else await ref.set({ text: { ...(snap.data().text || {}), en: snap.data().text?.en || tr.en, ko: snap.data().text?.ko || tr.ko } }, { merge: true });
    translated++;
  }
  await db.doc('meta/status').set({ lastPublished: date, lastPublishedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ...result, translated };
}

async function main() {
  const args = parseArgs();
  const file = args._[0];
  if (!file) {
    console.error('usage: node publish.mjs <digest.json> [--translations file] [--force]');
    process.exit(2);
  }
  const digest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const db = initDb();
  const ledger = await getLedger(db);
  const { errors, warnings } = validateDigest(digest, { ledger: ledger.filter((e) => e.date !== digest.date), curriculum: loadCurriculum() });
  if (errors.length && !args.force) {
    errors.forEach((e) => console.log(`ERROR ${e}`));
    console.log('Refusing to publish an invalid digest (use --force to override).');
    process.exit(1);
  }
  if (warnings.length) log(`${warnings.length} warning(s)`);
  const trFile = args.translations || path.join(path.dirname(path.resolve(file)), 'translations.json');
  const translations = fs.existsSync(trFile) ? JSON.parse(fs.readFileSync(trFile, 'utf8')) : [];
  const res = await publishDigest(db, digest, { generator: { tool: 'manual' }, translations });
  log(`Published ${digest.date} as Day ${res.day}${res.translated ? `; ${res.translated} translation(s)` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
