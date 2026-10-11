#!/usr/bin/env node
// Publish a validated digest into the encrypted data store: d/<date>.enc, index.enc (day list the site shows),
// private.enc (ledger, backlog, inbox statuses, stage updates) and status.json. Committing/pushing the data branch
// is done by the caller (GitHub workflow or setup script).
// Usage: node publish.mjs <digest.json> --data <data dir> [--force]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store, publicIndexFields } from './lib/store.mjs';
import { validateDigest, readingText } from './lib/validate-core.mjs';
import { countWords } from './lib/text.mjs';
import { loadCurriculum, parseArgs, log } from './lib/env.mjs';
import { isDateStr } from './lib/dates.mjs';

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
    ask: d.ask ? { to: d.ask.to, en: d.ask.en } : undefined, // so later days know what was asked by email
  };
}

const FACT_KEY = /^[a-z0-9][a-z0-9.-]{1,40}$/;

/** Validate facts the writer wants to remember from their notes: { set: { key: fact }, remove: [key] }. */
export function cleanFactsUpdate(u) {
  if (!u || typeof u !== 'object') return null;
  const set = {};
  for (const [k, v] of Object.entries(u.set && typeof u.set === 'object' ? u.set : {}).slice(0, 10)) {
    const key = String(k).toLowerCase().trim();
    if (FACT_KEY.test(key) && typeof v === 'string' && v.trim()) set[key] = v.trim().slice(0, 300);
  }
  const remove = (Array.isArray(u.remove) ? u.remove : []).map((k) => String(k).toLowerCase().trim()).filter((k) => FACT_KEY.test(k)).slice(0, 10);
  return Object.keys(set).length || remove.length ? { set, remove } : null;
}

/** Apply a facts update; each fact keeps the date it was last set. At most 80 facts, newest kept. */
export function mergeFacts(facts = {}, update, date) {
  const out = { ...facts };
  for (const k of update?.remove || []) delete out[k];
  for (const [k, v] of Object.entries(update?.set || {})) out[k] = { value: v, date };
  return Object.fromEntries(Object.entries(out).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1)).slice(0, 80));
}

/** Fold the Korean editor's lessons into rules keyed by pattern, counting how often each recurs. */
export function mergeKoRules(rules = {}, lessons = [], date) {
  const out = { ...rules };
  for (const l of lessons) {
    const key = String(l?.key || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    if (!key || !l.rule) continue;
    const prev = out[key];
    out[key] = { key, rule: String(l.rule).slice(0, 240), before: String(l.before || '').slice(0, 160), after: String(l.after || '').slice(0, 160),
      count: (prev?.count || 0) + 1, first: prev?.first || date, last: date };
  }
  const kept = Object.values(out).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1)).slice(0, 80);
  return Object.fromEntries(kept.map((r) => [r.key, r]));
}

/** Validate a stage update proposed from the couple's notes (e.g. a positive test or a birth). */
export function cleanStateUpdate(u) {
  if (!u || typeof u !== 'object' || !['ttc', 'pregnant', 'born'].includes(u.stage)) return null;
  const out = { stage: u.stage };
  for (const k of ['lmp', 'due', 'birth']) if (isDateStr(u[k])) out[k] = u[k];
  if (typeof u.note === 'string') out.note = u.note.slice(0, 300);
  return out;
}

export function publishDigest(store, digest, { generator = {}, stateUpdate = null, koLessons = [], factsUpdate = null } = {}) {
  const priv = store.readPrivate();
  const date = digest.date;
  const ledger = (priv.ledger || []).filter((e) => e.date !== date);
  const existing = store.hasDigest(date) ? store.readDigest(date) : null;
  const day = existing?.day || ledger.filter((e) => e.date < date).length + 1;
  const doc = {
    ...digest,
    day,
    minutes: Math.max(2, Math.round(countWords(readingText(digest.en)) / 200)),
    generator,
    publishedAt: new Date().toISOString(),
  };
  store.writeDigest(date, doc);

  ledger.push(ledgerEntry(doc));
  ledger.sort((a, b) => (a.date < b.date ? -1 : 1));
  priv.ledger = ledger;
  for (const p of digest.unitProposals || []) {
    if (p?.id && !(priv.backlog || []).some((x) => x.id === p.id)) (priv.backlog ||= []).push({ ...p, pri: p.pri || 2, proposedOn: date });
  }
  for (const id of digest.addresses || []) {
    const note = (priv.inbox || []).find((n) => n.id === id);
    if (note) Object.assign(note, { status: 'covered', coveredBy: date });
  }
  // Lessons from the Korean review, counted by pattern; recurring ones become house rules (context/ko-lessons.json).
  if (koLessons.length) priv.koRules = mergeKoRules(priv.koRules, koLessons, date);
  // Lasting facts from their notes (results, decisions, dates), shown to the writer every day (context/facts.json).
  const facts = cleanFactsUpdate(factsUpdate);
  if (facts) priv.facts = mergeFacts(priv.facts, facts, date);
  const update = cleanStateUpdate(stateUpdate);
  if (update) priv.state = { ...update, updatedAt: new Date().toISOString(), updatedBy: 'digest-inbox' };
  store.writePrivate(priv);

  const index = store.readIndex();
  const days = (index.days || []).filter((x) => x.date !== date);
  days.push(overviewEntry(doc));
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  store.writeIndex({ ...index, ...publicIndexFields(priv), days });

  // status.json is written only by the email job, so publishing and emailing never touch the same file.
  return { day, stageUpdated: Boolean(update) };
}

async function main() {
  const args = parseArgs();
  const file = args._[0];
  if (!file || !args.data) {
    console.error('usage: node publish.mjs <digest.json> --data <data dir> [--force]');
    process.exit(2);
  }
  const digest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const store = Store.open(path.resolve(args.data), process.env.PARENTHOOD_PASSPHRASE);
  const ledger = store.readPrivate().ledger.filter((e) => e.date !== digest.date);
  const { errors, warnings } = validateDigest(digest, { ledger, curriculum: loadCurriculum() });
  if (errors.length && !args.force) {
    errors.forEach((e) => console.log(`ERROR ${e}`));
    console.log('Refusing to publish an invalid digest (use --force to override).');
    process.exit(1);
  }
  if (warnings.length) log(`${warnings.length} warning(s)`);
  const res = publishDigest(store, digest, { generator: { tool: 'manual' } });
  log(`Published ${digest.date} as Day ${res.day}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
