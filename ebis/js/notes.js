// Margin notes: beside each stretch of the text, what it means, in a line or two, as a knowledgeable
// friend would note it. Claude writes them, through the worker, from passages of a few pages in
// numbered pieces of a sentence or few, read with the text around them: it brackets runs of pieces
// that make one point and notes each. A book's passages are noted one at a time, in order, each
// knowing what the margin has said before it, so the notes build on one another.
// They're records, so they sync like highlights. They're written ahead of the reader: as much as
// an article (the start of a book) when it's added, and while reading, the next stretch on.

import * as store from './store.js';
import { blocks } from './convert.js';
import { settings } from './settings.js';
import { toast } from './ui.js';

const PASSAGE = 8000; // characters of prose sent at once: a few pages
const PIECE = 350;    // the least a bracket holds, unless a paragraph is shorter: a couple of sentences
const AHEAD = 24000;  // how far past the reader's place notes are kept written: some twenty minutes of reading
export const FIRST = 60000; // how much is noted as soon as it's added: all of most articles and papers
const AT_ONCE = 3;    // passages being noted at the same time
const RETRY = 3 * 60000; // a passage that couldn't be noted waits this long to be tried again
const CONTEXT = 120000; // characters of the text around a passage that Claude reads with it: its chapter, and what comes before
const V = 3; // how notes are written now; notes written otherwise are written again
const SOFAR = 30; // notes of what the margin has said before a passage that Claude reads with it
const PROSE = 'p, li, dt, dd';
const APART = 'figure, table, aside, pre'; // captions, tables, footnotes, code: words beside the text's own

const books = new Map(); // id → { passages, texts } of each chapter, worked out once
const queues = new Map(); // id → passages waiting to be noted, the book asked for last first
const busy = new Map(), failed = new Map(), told = new Set(); // busy: key → passage being noted now
const watchers = new Set();

// The reader shows where notes are still being written, or waiting to be.
export const onWriting = fn => watchers.add(fn);
export const writing = (id, c) => [...busy.values(), ...(queues.get(id) ?? []).map(q => q.p)]
  .filter(p => p.id === id && p.c === c && !written(p.key));
const written = key => store.get('notes', key)?.v === V;

// A chapter in passages: { key, c, b, b1 (its blocks), size, text (what the model notes), said
// (where each numbered piece is) }. Each starts a new section where it can, and is told the
// sections it begins inside of. The chapter's whole text is kept too, for context.
export function passages(id, data, c) {
  const book = books.get(id) ?? books.set(id, { passages: [], texts: [] }).get(id);
  if (book.passages[c]) return book.passages[c];
  const section = new DOMParser().parseFromString(data.chapters[c], 'text/html').body.firstElementChild;
  const out = [], trail = [], all = [];
  let p = null;
  blocks(section).forEach((el, b) => {
    const text = el.textContent, level = +el.localName.match(/^h([234])$/)?.[1] || 0;
    const plain = level ? `${'#'.repeat(level - 1)} ${clean(text)}` : el.matches('.eq') ? `Formula: ${el.querySelector('math')?.getAttribute('alttext') || clean(text)}` : clean(text);
    if (plain) all.push(plain);
    if (!p || p.weight >= PASSAGE || (level && p.weight >= PASSAGE * 0.6)) {
      const within = trail.slice(0, level ? level - 2 : trail.length).filter(Boolean);
      p = { key: `${id}.${c}.${out.length}`, id, c, b, size: 0, weight: 0, lines: within.map((t, i) => `${'#'.repeat(i + 1)} ${t}`), said: [] };
      out.push(p);
    }
    p.b1 = b + 1;
    p.size += text.length || 1;
    if (level) {
      trail.length = level - 2;
      trail[level - 2] = clean(text);
      p.lines.push('', plain);
    } else if (el.matches('.eq')) {
      p.lines.push('', plain);
    } else if (el.matches(PROSE) && !el.closest(APART) && text.trim()) {
      const line = pieces(sentences(text, data.lang)).map(([s, e]) => {
        p.said.push({ b, o: s, e });
        return `[${p.said.length}] ${clean(text.slice(s, e))}`;
      });
      p.lines.push('', `${el.localName === 'li' ? '• ' : ''}${line.join(' ')}`);
      p.weight += text.length;
    }
  });
  for (const p of out) p.text = p.lines.join('\n').trim(), delete p.lines, delete p.weight;
  book.texts[c] = all.join('\n\n');
  return (book.passages[c] = out);
}
const clean = text => text.replace(/\s+/g, ' ').trim();

// What Claude reads around a passage: its chapter whole, after as much of the chapters before it as
// fits. The same for every passage of a chapter, so it's read from Claude's cache after the first.
export function context(id, data, c) {
  let text = '';
  for (let k = c; k >= 0 && text.length < CONTEXT; k--) {
    passages(id, data, k);
    text = `${books.get(id).texts[k]}\n\n${text}`;
  }
  return text.slice(-CONTEXT).trim();
}
// [start, end] of each sentence. A segmenter also breaks after abbreviations and initials ("Mr.
// Darcy", "A. Beirami", "et al. (2024)", "Fig. 3"), so a sentence goes on past one of those (or a
// stray "1."), and into what follows in lower case or with a number.
const ABBREVIATION = /(?:^|[\s(.])(?:\p{L}|Mrs?|Ms|Dr|St|Prof|Rev|Sr|Jr|Gen|Col|Capt|Lt|Hon|vs|al|etc|cf|Figs?|Eqs?|No|Vol|pp|ca|approx|Ch|Sec)\.["”’)]*$/u;
const segmenters = new Map();
function sentences(text, lang = 'en') {
  if (!segmenters.has(lang)) {
    let seg;
    try { seg = new Intl.Segmenter(lang, { granularity: 'sentence' }); } catch { seg = new Intl.Segmenter('en', { granularity: 'sentence' }); }
    segmenters.set(lang, seg);
  }
  const out = [];
  for (const { index, segment } of segmenters.get(lang).segment(text)) {
    const s = index + segment.search(/\S|$/), e = index + segment.trimEnd().length, last = out.at(-1);
    if (e <= s) continue;
    if (last && (/^[("“‘'[]*[\p{Ll}\d]/u.test(text.slice(s, e)) || ABBREVIATION.test(text.slice(...last)) || last[1] - last[0] < 4)) last[1] = e;
    else out.push([s, e]);
  }
  return out;
}

// A paragraph's sentences gathered into pieces of a couple at least, a short one at its end
// joining the piece before.
function pieces(spans) {
  const out = [];
  for (const [s, e] of spans) {
    if (out.length && out.at(-1)[1] - out.at(-1)[0] < PIECE) out.at(-1)[1] = e;
    else out.push([s, e]);
  }
  if (out.length > 1 && out.at(-1)[1] - out.at(-1)[0] < PIECE) out.at(-2)[1] = out.pop()[1];
  return out;
}

// Notes for the passage at the reader's place and those after it, as far as reach.
export function prepare(id, data, place = store.get('pos', id) ?? { c: 0, b: 0 }, reach = AHEAD) {
  if (!settings.notes) return;
  const wanted = [];
  for (let c = place.c, left = reach; c < data.chapters.length && left > 0; c++) {
    for (const p of passages(id, data, c)) {
      if (c === place.c && p.b1 <= place.b) continue;
      if (left <= 0) break;
      left -= p.size;
      if (p.said.length && !written(p.key) && !busy.has(p.key) && Date.now() - (failed.get(p.key) ?? 0) > RETRY) wanted.push(p);
    }
  }
  // These go first; what was asked for before (the start of a book just added) still follows.
  const rest = (queues.get(id) ?? []).filter(q => !wanted.includes(q.p));
  queues.delete(id);
  queues.set(id, [...wanted.map(p => ({ p, data })), ...rest]);
  pump();
  if (wanted.length) watchers.forEach(fn => fn({ id, c: place.c }));
}

// One passage of a book at a time (several books at once), so each is noted after those before it.
function pump() {
  if (!settings.notes) return; // (turned off meanwhile: what's waiting waits)
  for (const [id, queue] of [...queues].reverse()) {
    while (busy.size < AT_ONCE && queue.length && ![...busy.values()].some(p => p.id === id)) {
      const next = queue.shift();
      if (!written(next.p.key) && store.get('book', id)) write(next);
    }
    if (!queue.length) queues.delete(id);
  }
}

async function write({ p, data }) {
  busy.set(p.key, p);
  watchers.forEach(fn => fn(p));
  await store.sync(); // another device may have noted it already
  const notes = !written(p.key) && await store.annotate({ title: data.title, author: data.author, context: context(p.id, data, p.c), sofar: sofar(p), text: p.text }).then(r => {
    if (!Array.isArray(r.notes)) throw new Error('Claude sent no notes.');
    return r.notes;
  }).catch(e => {
    failed.set(p.key, Date.now());
    if (!/can’t reach/.test(e.message) && !told.has(e.message)) told.add(e.message), toast(`Margin notes couldn’t be written. ${e.message}`);
  });
  busy.delete(p.key);
  if (notes && store.get('book', p.id)) store.put('notes', p.key, { book: p.id, c: p.c, v: V, notes: runs(p, notes) }); // (unless it was removed meanwhile)
  watchers.forEach(fn => fn(p));
  pump();
}

// What the margin has said before a passage, in order: the last of the notes before it.
const sofar = p => store.all('notes').filter(n => n.book === p.id && n.v === V && n.c <= p.c)
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  .flatMap(n => n.notes.filter(x => n.c < p.c || x.b < p.b).map(x => x.t)).slice(-SOFAR);

// The model's runs of numbered pieces, as places in the chapter: in order, apart, each with its note.
function runs(p, notes) {
  const out = [];
  let last = 0;
  for (let { from, to, note } of notes.sort((a, b) => a.from - b.from)) {
    from = Math.max(from, last + 1);
    if (to < from || to > p.said.length || !note?.trim()) continue;
    const [s, e] = [p.said[from - 1], p.said[to - 1]];
    out.push({ b: s.b, o: s.o, b2: e.b, o2: e.e, t: note.trim() });
    last = to;
  }
  return out;
}

// A chapter's notes, in reading order.
export const of = (id, c) => store.all('notes').filter(n => n.book === id && n.c === c && n.v === V)
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).flatMap(n => n.notes);
