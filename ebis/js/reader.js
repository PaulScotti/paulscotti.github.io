// The reader. One chapter at a time, one long page scrolled like the web — never flipped.
// A position is [chapter, block, character], so it survives any change of device, type size
// or theme.

import * as store from './store.js';
import * as notes from './notes.js';
import { blocks as leafBlocks, blockSizes } from './convert.js';
import { settings, update, onUpdate } from './settings.js';
import { $, template, escape, openSheet, popover, peek, unpeek, lightbox, closeLayers, layerOpen, toast } from './ui.js';

const view = $('reader'), page = $('page'), flow = $('flow'), gloss = $('gloss');
const COLORS = ['ochre', 'rubric', 'lapis'];
const FACES = ['1em Libron', 'italic 1em Libron', 'bold 1em Libron', 'italic bold 1em Libron'];
let deviceName = matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer';
navigator.userAgentData?.getHighEntropyValues(['model']).then(d => { if (d.model) deviceName = d.model; });

let book = null;            // { id, record, data: book.json, urls, starts: first character of each chapter }
let chapter = 0;
let anchor = [0, 0];        // the reader's place: what a new layout must keep on screen
let blocks = [], offsets = [];
let heads = [];             // contents entries in this chapter, with the block each starts at
let cpm = +localStorage.getItem('ebis.cpm') || 1100; // reading speed, characters per minute
let lastRead = { at: 0, char: 0 }, wake = null, wakeTimer = 0;
const parsed = new Map();   // chapter index → parsed section, for search and link previews

let opening = 0; // only the latest open (or leaving) counts when loads finish out of order

export async function open(id) {
  const record = store.get('book', id);
  if (!record) throw new Error('That book is no longer in your library.');
  const ticket = ++opening;
  view.hidden = false;
  if (book?.id !== id) {
    flow.replaceChildren();
    const { book: data, urls } = await store.open(id, p => { $('folio-r').textContent = `${Math.round(p * 100)}%`; });
    if (ticket !== opening) return;
    const starts = data.sizes.reduce((a, n) => [...a, a.at(-1) + n], [0]);
    book = { id, record, data, urls, starts, total: starts.at(-1) };
    parsed.clear();
    flow.lang = data.lang || 'en';
  }
  addTab(id);
  await Promise.all(FACES.map(f => document.fonts.load(f)));
  if (ticket !== opening) return;
  const pos = store.get('pos', id);
  render(pos?.c ?? 0, pos ? { loc: [pos.b, pos.o] } : 'start');
  showUI(!pos);
}

export function hide() {
  opening++;
  view.hidden = true;
  closeLayers(true);
  releaseWake();
}

// Laying out a chapter.

function render(c, target, fade) {
  chapter = Math.max(0, Math.min(c, book.data.chapters.length - 1));
  flow.innerHTML = book.data.chapters[chapter];
  flow.querySelectorAll('img[data-k]').forEach(picture);
  // Doorways to the chapters before and after. They hold buttons, never paragraphs, so they
  // don't count as reading blocks and positions stay put.
  if (chapter > 0) flow.prepend(chapterLink(chapter - 1, 'Previous'));
  if (chapter < book.data.chapters.length - 1) flow.append(chapterLink(chapter + 1, 'Next'));
  blocks = leafBlocks(flow);
  offsets = [];
  blocks.reduce((sum, el) => (offsets.push(sum), sum + (el.textContent.length || 1)), 0);
  measure();
  fitFormulas();
  drawNotes();
  heads = book.data.toc.filter(t => book.data.ids[t.id] === chapter).map(t => {
    const el = flow.querySelector(`[id="${CSS.escape(t.id)}"]`);
    return { entry: t, b: el ? blockAt(el) : 0 };
  });
  const el = target?.id ? flow.querySelector(`[id="${CSS.escape(target.id)}"]`) : null;
  if (target === 'end') page.scrollTop = page.scrollHeight;
  else if (el) scrollRect(el.getBoundingClientRect());
  else if (target?.loc) scrollLoc(target.loc);
  else page.scrollTop = 0; // 'start', or nothing named
  anchor = target?.loc ?? (el ? [blockAt(el), 0] : locator());
  refresh();
  remember(anchor);
  paintMarks();
  prepareNotes();
  if (fade) flow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
}

// A picture cut from a PDF page is as wide as it was beside the page's text.
function picture(img) {
  img.src = book.urls[img.dataset.k];
  if (img.dataset.em) img.style.setProperty('--w', `${img.dataset.em}em`);
}

function chapterLink(c, dir) {
  const title = book.data.toc.find(t => book.data.ids[t.id] === c)?.title || `Chapter ${c + 1}`;
  const nav = document.createElement('nav');
  nav.className = `chap ${dir.toLowerCase()}`;
  const button = document.createElement('button');
  button.textContent = dir === 'Next' ? `Next: ${title}` : `Previous: ${title}`;
  button.onclick = () => render(c, dir === 'Next' ? 'start' : 'end', true);
  nav.append(button);
  return nav;
}

// The column of text, and where there's room, a column of margin notes beside it: the text moves
// left, and narrows a little, to make room. (Where there isn't, see drawNotes.)
function measure() {
  const W = page.clientWidth, fs = settings.size;
  const mx = Math.round(Math.min(Math.max(W * 0.06, 16), 48) * settings.margin);
  let c = Math.floor(Math.min(W - 2 * mx, fs * 32)), x = (W - c) / 2;
  const small = Math.max(13, Math.round(fs * 0.74)), gap = Math.round(fs * 0.9), side = gap + 16 + small * 16 + mx; // to the bracket, to the note, the note, the margin
  const beside = settings.notes && W - side - mx >= fs * 24;
  if (beside) {
    c = Math.min(c, W - side - mx);
    x = Math.min(x, W - side - c);
  }
  view.classList.toggle('beside', beside);
  const bracket = x + c + (beside ? gap : Math.round(Math.min(fs * 0.45, mx * 0.35)));
  const vars = {
    '--fs': `${fs}px`, '--lh': settings.leading, '--flow-w': `${c}px`, '--flow-x': `${x}px`, '--page-h': `${page.clientHeight}px`,
    '--note-fs': `${beside ? small : Math.round(fs * 0.82)}px`, '--note-w': `${small * 16}px`, '--bracket-x': `${bracket}px`, '--note-x': `${bracket + 16}px`,
    '--align': settings.justify ? 'justify' : 'start', '--hyphens': settings.justify ? 'auto' : 'manual',
    '--indent': settings.indent ? '1.4em' : '0', '--para-gap': settings.indent ? '0' : '.7em',
  };
  for (const [k, v] of Object.entries(vars)) view.style.setProperty(k, v);
}

const blockAt = el => { const i = blocks.findIndex(b => b === el || b.contains(el) || el.contains(b)); return i < 0 ? 0 : i; };

// [node, offset] for character o of a block, and the inverse.
function caret(el, o) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n; (n = walker.nextNode()); last = n) {
    if (o < n.length) return [n, o];
    o -= n.length;
  }
  return last ? [last, last.length] : [el, 0];
}
function pointOf(node, offset) {
  const b = blocks.findIndex(el => el.contains(node));
  if (b < 0) return null;
  const r = document.createRange();
  r.setStart(blocks[b], 0);
  r.setEnd(node, offset);
  return [b, r.toString().length];
}
function charRect(el, o) {
  const [node, off] = caret(el, o);
  if (node.nodeType !== 3) return el.getClientRects()[0];
  const r = document.createRange();
  r.setStart(node, off);
  r.setEnd(node, Math.min(off + 1, node.length));
  return r.getClientRects()[0] || el.getClientRects()[0];
}

// Scrolling.

// The first character on screen.
function locator() {
  const top = page.getBoundingClientRect().top + 6;
  const shows = el => { const r = el.getClientRects(); return r.length && r[r.length - 1].bottom > top; };
  let lo = 0, hi = blocks.length - 1, b = Math.max(0, hi);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (shows(blocks[mid])) b = mid, hi = mid - 1;
    else lo = mid + 1;
  }
  const el = blocks[b];
  if (!el) return [0, 0];
  const start = el.getClientRects()[0];
  if (!start || start.top >= top) return [b, 0];
  let o = 0;
  for (let l = 0, h = el.textContent.length - 1; l <= h;) {
    const mid = (l + h) >> 1;
    const r = charRect(el, mid);
    if (r && r.bottom > top) o = mid, h = mid - 1;
    else l = mid + 1;
  }
  return [b, o];
}

function scrollRect(rect) {
  if (!rect) return;
  page.scrollTop += rect.top - page.getBoundingClientRect().top - 14;
}
function scrollLoc([b, o]) {
  const el = blocks[Math.min(b, blocks.length - 1)];
  if (el) scrollRect((o > 0 ? charRect(el, o) : el.getClientRects()[0]) || el.getBoundingClientRect());
}

// Where the reader rests, kept fresh whenever scrolling stops.
let restTimer = 0;
page.addEventListener('scroll', () => {
  clearTimeout(restTimer);
  restTimer = setTimeout(rested, 140);
}, { passive: true });
function rested() {
  if (!book || view.hidden) return;
  anchor = locator();
  refresh();
  remember(anchor);
  prepareNotes();
}

const fraction = ([b, o]) => (book.starts[chapter] + (offsets[b] || 0) + o) / book.total;
// The contents entry the reader is in: the last one at or before the place.
const entry = () => heads.filter(h => h.b <= anchor[0]).at(-1)?.entry ?? book.data.toc.filter(t => book.data.ids[t.id] < chapter).at(-1);

function remember([b, o]) {
  // Reading speed, learned from ordinary pauses between scrolls (a fast jump is not reading).
  const now = Date.now(), char = book.starts[chapter] + (offsets[b] || 0) + o;
  const read = char - lastRead.char, minutes = (now - lastRead.at) / 60000;
  if (read > 200 && read < 6000 && minutes > Math.max(0.07, read / 2400) && minutes < 10) {
    cpm = Math.round(cpm * 0.9 + (read / minutes) * 0.1);
    localStorage.setItem('ebis.cpm', cpm);
  }
  lastRead = { at: now, char };
  const pos = store.get('pos', book.id);
  if (pos && pos.c === chapter && pos.b === b && pos.o === o) return;
  store.put('pos', book.id, { c: chapter, b, o, pct: fraction([b, o]), device: deviceName, at: now }, false);
  keepAwake();
}

function refresh() {
  const [b, o] = anchor, pct = fraction(anchor);
  const charsLeft = book.data.sizes[chapter] - (offsets[b] || 0) - o;
  const minutes = Math.max(1, Math.round(charsLeft / cpm));
  $('folio-l').textContent = settings.folio === 'time'
    ? `${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`} left in chapter`
    : `Chapter ${chapter + 1} of ${book.data.chapters.length}`;
  $('folio-r').textContent = `${Math.floor(pct * 100)}%`;
  const head = entry()?.title || book.record.title;
  $('run-l').textContent = book.record.title;
  $('run-r').textContent = head;
  $('scrub').value = Math.round(pct * 1000);
  $('scrub-label').textContent = head;
}

// Touch, mouse and keys. The scroll itself is the browser's own; taps act, they don't turn.

let touch = null;
page.addEventListener('pointerdown', e => {
  if (e.isPrimary && e.button < 1) touch = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
});
page.addEventListener('pointerup', e => {
  const t = touch;
  touch = null;
  if (!t || e.pointerId !== t.id) return;
  if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8 && e.timeStamp - t.t < 450) tap(e);
});
page.addEventListener('pointercancel', () => { touch = null; });
flow.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); });

function tap(e) {
  if (!getSelection().isCollapsed) return getSelection().removeAllRanges();
  if (popoverEl.classList.contains('peek')) unpeek(); // a peek never swallows a tap
  if (layerOpen()) return closeLayers();
  if (e.target.closest('.chap')) return; // a chapter doorway acts on its own
  const link = e.target.closest('a[href]');
  if (link) return follow(link);
  const mark = markAt(e.clientX, e.clientY);
  if (mark) return editMark(mark);
  if (e.target.localName === 'img') return lightbox(e.target);
  showUI(!view.classList.contains('ui'));
}

addEventListener('keydown', e => {
  if (view.hidden || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
  if (layerOpen()) return e.key === 'Escape' && closeLayers();
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) turn(1);
  else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) turn(-1);
  else if (k === 'Escape') view.classList.contains('ui') ? showUI(false) : leave();
  else if (e.altKey && /^Digit[1-9]$/.test(e.code)) switchTab(+e.code.slice(5) - 1);
  else return;
  e.preventDefault();
});

// A screenful down or up; past the end of a chapter, on to the next one (and back). (While a
// book opens, the page is empty and at no chapter's end.)
const atEnd = () => !!flow.firstElementChild && page.scrollTop + page.clientHeight >= page.scrollHeight - 8;
function turn(dir) {
  const atStart = page.scrollTop <= 4;
  if (dir > 0 && atEnd()) {
    if (chapter < book.data.chapters.length - 1) render(chapter + 1, 'start', true);
  } else if (dir < 0 && atStart) {
    if (chapter > 0) render(chapter - 1, 'end', true);
  } else {
    page.scrollBy({ top: dir * (page.clientHeight * 0.92 - (now.hidden ? 0 : now.offsetHeight)), behavior: 'smooth' }); // what the note at the foot hides is still to read
  }
}

// Scrolling on past the end of a chapter goes on to the next, as the keys do. Only a scroll that
// begins at the end pulls (not the momentum that brought the reader there): a wheel turned on
// past it, or a swipe up. What is left of that scroll is spent on a page held still, so the next
// chapter opens at its start.
let pull = 0, pulling = false, wheelAt = 0, swipe = null, still = 0;
page.addEventListener('wheel', e => {
  if (e.timeStamp - wheelAt > 250) { // a new scroll
    pulling = atEnd();
    if (!pulling) pull = 0;
  }
  wheelAt = e.timeStamp;
  if (page.style.overflowY) return hold();
  if (!pulling || e.ctrlKey) return; // a pinch is a zoom
  pull = e.deltaY > 0 ? pull + e.deltaY : 0;
  if (pull > 120) onward();
}, { passive: true });
page.addEventListener('touchstart', e => { swipe = e.touches.length === 1 && atEnd() ? e.touches[0].clientY : null; }, { passive: true });
page.addEventListener('touchend', e => {
  if (swipe !== null && swipe - e.changedTouches[0].clientY > 80 && getSelection().isCollapsed) onward();
  swipe = null;
}, { passive: true });
function onward() {
  pull = 0;
  if (chapter === book.data.chapters.length - 1) return;
  render(chapter + 1, 'start', true);
  page.style.overflowY = 'hidden';
  hold();
}
function hold() { // till the scroll has been still a moment
  clearTimeout(still);
  still = setTimeout(() => { page.style.overflowY = ''; }, 300);
}

new ResizeObserver(() => relayout()).observe(page);
document.fonts.addEventListener('loadingdone', () => relayout());
onUpdate(changes => {
  if ('folio' in changes) return book && refresh();
  relayout();
  if (changes.notes && book && !view.hidden) prepareNotes();
});

// Lay the chapter out again (new size or settings) keeping the reader's place on screen.
function relayout() {
  if (!book || view.hidden) return;
  measure();
  fitFormulas();
  drawNotes();
  scrollLoc(anchor);
}

// A displayed formula wider than the page is set smaller to fit, down to three quarters of the
// text's size; past that it scrolls sideways. (All are measured first, then all are set.)
function fitFormulas() {
  const maths = [...flow.querySelectorAll('.eq > math')];
  for (const m of maths) m.style.fontSize = '';
  const sizes = maths.map(m => [m.clientWidth / m.scrollWidth, parseFloat(getComputedStyle(m).fontSize)]);
  maths.forEach((m, i) => { const [fit, size] = sizes[i]; if (fit < 1) m.style.fontSize = `${Math.max(0.75, fit) * size}px`; });
}

// Keep the screen awake while reading, for a few minutes after each rest.
async function keepAwake() {
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(releaseWake, 5 * 60000);
  if (!wake && navigator.wakeLock && document.visibilityState === 'visible') {
    wake = await navigator.wakeLock.request('screen').catch(() => null);
    wake?.addEventListener('release', () => { wake = null; });
  }
}
function releaseWake() { wake?.release(); wake = null; }

notes.onWriting(p => p.id === book?.id && p.c === chapter && !view.hidden && drawNotes());

// Positions from the other device, and notes as they're written.
store.onChange(({ kind, id, remote }) => {
  if (!book || view.hidden) return;
  if (kind === 'notes') {
    const written = store.get('notes', id);
    return written?.book === book.id && written.c === chapter && drawNotes();
  }
  if (!remote) return;
  if (kind === 'mark') paintMarks();
  if (kind === 'tabs') drawTabs();
  if (kind !== 'pos' || id !== book.id) return;
  const pos = store.get('pos', id);
  const back = { c: chapter, loc: anchor };
  if (pos.c === chapter && pos.b === back.loc[0] && Math.abs(pos.o - back.loc[1]) < 50) return;
  render(pos.c, { loc: [pos.b, pos.o] }, true);
  toast(`Moved to where you left off${pos.device ? ` on your ${pos.device}` : ''}.`, ['Stay here', () => render(back.c, { loc: back.loc }, true)]);
});

// The chrome: bars, contents, search, type, tabs.

function showUI(on) {
  view.classList.toggle('ui', on);
  if (on) drawTabs();
}

$('r-back').onclick = leave;
function leave() { location.hash = '#/'; }

$('folio').onclick = () => update({ folio: settings.folio === 'pages' ? 'time' : 'pages' });

$('scrub').oninput = e => {
  const { c } = spot(e.target.value / 1000);
  $('scrub-label').textContent = book.data.toc.filter(t => book.data.ids[t.id] <= c).at(-1)?.title || book.record.title;
};
$('scrub').onchange = e => {
  const { c, loc } = spot(e.target.value / 1000);
  render(c, { loc }, c !== chapter);
};
// The chapter, block and character at a fraction of the whole book.
function spot(f) {
  const target = f * book.total;
  const c = Math.max(0, book.starts.findLastIndex(s => s <= target && s < book.total));
  const sizes = blockSizes(section(c));
  let within = target - book.starts[c], b = 0;
  while (b < sizes.length - 1 && within >= sizes[b]) within -= sizes[b++];
  return { c, loc: [b, Math.min(Math.floor(within), sizes[b] - 1)] };
}

$('r-toc').onclick = () => {
  const list = document.createElement('ol');
  list.className = 'list';
  const here = entry();
  for (const t of book.data.toc) {
    const li = document.createElement('li');
    li.innerHTML = `<button class="lvl${Math.min(t.level + 1, 3)}">${escape(t.title)}</button>`;
    if (t === here) li.firstChild.setAttribute('aria-current', 'true');
    li.firstChild.onclick = () => { closeLayers(); showUI(false); jump(t.id); };
    list.append(li);
  }
  const marks = store.all('mark').filter(m => m.book === book.id).sort((a, b) => a.c - b.c || a.b - b.b || a.o - b.o);
  const body = document.createDocumentFragment();
  body.append(list);
  if (marks.length) {
    const label = document.createElement('h3');
    label.className = 'label quiet';
    label.textContent = 'Highlights';
    const ml = document.createElement('ol');
    ml.className = 'list';
    for (const m of marks) {
      const li = document.createElement('li');
      li.innerHTML = `<button><span><span class="quote">${escape(m.text)}</span>${m.note ? `<span class="note">${escape(m.note)}</span>` : ''}</span></button>`;
      li.firstChild.onclick = () => { closeLayers(); showUI(false); render(m.c, { loc: [m.b, m.o] }, true); };
      ml.append(li);
    }
    body.append(label, ml);
  }
  openSheet('Contents', body);
  list.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
};

function jump(id, from) {
  const c = book.data.ids[id];
  if (c == null) return;
  const back = { c: chapter, loc: anchor };
  render(c, { id }, c !== chapter);
  if (from) toast('', ['Return to your place', () => render(back.c, { loc: back.loc }, true)]);
}

$('r-find').onclick = () => {
  const box = document.createElement('div');
  box.innerHTML = '<form class="url find"><input type="search" placeholder="Find in this book" aria-label="Find in this book" enterkeyhint="search"></form><ol class="list"></ol>';
  const [form, list] = box.children;
  const input = form.firstChild;
  let timer = 0;
  const run = () => {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren();
    if (q.length < 2) return;
    for (const r of search(q).slice(0, 200)) {
      const li = document.createElement('li');
      const t = r.text, from = Math.max(0, r.o - 60), to = r.o + q.length;
      const before = from ? `…${t.slice(from, r.o).replace(/^\S*\s/, '')}` : t.slice(0, r.o);
      li.innerHTML = `<button><span class="snip">${escape(before)}<mark>${escape(t.slice(r.o, to))}</mark>${escape(t.slice(to, to + 80))}…</span></button>`;
      li.firstChild.onclick = () => { closeLayers(); showUI(false); render(r.c, { loc: [r.b, r.o] }, r.c !== chapter); found(r.b, r.o, q.length); };
      list.append(li);
    }
    if (!list.children.length) list.innerHTML = '<li class="quiet" style="padding:11px 22px">Nothing found.</li>';
  };
  form.onsubmit = e => { e.preventDefault(); run(); };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
  openSheet('Search', box);
  input.focus();
};

function section(c) {
  if (!parsed.has(c)) parsed.set(c, new DOMParser().parseFromString(book.data.chapters[c], 'text/html').body.firstElementChild);
  return parsed.get(c);
}
function search(q) {
  const out = [];
  book.data.chapters.forEach((_, c) => leafBlocks(section(c)).forEach((el, b) => {
    const text = el.textContent, low = text.toLowerCase();
    for (let o = low.indexOf(q); o >= 0; o = low.indexOf(q, o + q.length)) out.push({ c, b, o, text });
  }));
  return out;
}
function found(b, o, n) {
  const r = document.createRange();
  r.setStart(...caret(blocks[b], o));
  r.setEnd(...caret(blocks[b], o + n));
  CSS.highlights.set('found', new Highlight(r));
  setTimeout(() => CSS.highlights.delete('found'), 4000);
}

$('r-type').onclick = () => {
  openSheet('Type & theme', template('t-type'));
  const root = $('sheet-body'), size = root.querySelector('[name="size"]');
  const show = () => {
    size.value = settings.size;
    root.querySelectorAll('.swatches button').forEach(b => b.setAttribute('aria-checked', b.dataset.theme === settings.theme));
    root.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-checked', +b.value === settings[b.parentNode.dataset.name]));
    root.querySelectorAll('.toggle input').forEach(input => { input.checked = settings[input.name]; });
  };
  const set = changes => { update(changes); show(); };
  size.oninput = () => set({ size: +size.value });
  root.querySelectorAll('.step').forEach(b => b.onclick = () => set({ size: Math.max(14, Math.min(32, settings.size + +b.dataset.step)) }));
  root.querySelectorAll('.swatches button').forEach(b => b.onclick = () => set({ theme: b.dataset.theme }));
  root.querySelectorAll('.seg button').forEach(b => b.onclick = () => set({ [b.parentNode.dataset.name]: +b.value }));
  root.querySelectorAll('.toggle input').forEach(input => input.onchange = () => set({ [input.name]: input.checked }));
  show();
};

// Open books are tabs, shared between devices.

const tabs = () => (store.get('tabs', 'open')?.ids || []).filter(id => store.get('book', id));
function addTab(id) {
  const ids = tabs();
  if (!ids.includes(id)) store.put('tabs', 'open', { ids: [...ids, id] });
  drawTabs();
}
export function closeTab(id) {
  const ids = tabs();
  const rest = ids.filter(x => x !== id);
  store.put('tabs', 'open', { ids: rest });
  store.close(id);
  const reading = !view.hidden && book?.id === id;
  if (book?.id === id) book = null;
  if (reading) location.replace(rest.length ? `#/read/${rest[Math.min(ids.indexOf(id), rest.length - 1)]}` : '#/');
  else drawTabs();
}
function switchTab(i) {
  const id = tabs()[i];
  if (id && id !== book?.id) location.replace(`#/read/${id}`);
}
function drawTabs() {
  const ids = tabs();
  $('tab-count').textContent = ids.length;
  $('tabs').replaceChildren(...ids.map(id => {
    const b = document.createElement('button');
    b.innerHTML = `<span>${escape(store.get('book', id).title)}</span><span class="x" role="button" aria-label="Close"><svg><use href="#i-close"/></svg></span>`;
    if (id === book?.id) b.setAttribute('aria-current', 'true');
    b.onclick = e => e.target.closest('.x') ? closeTab(id) : switchTab(ids.indexOf(id));
    return b;
  }));
}
$('r-tabs').onclick = () => {
  const list = document.createElement('ol');
  list.className = 'list';
  for (const id of tabs()) {
    const r = store.get('book', id), pos = store.get('pos', id);
    const li = document.createElement('li');
    li.innerHTML = `<button${id === book?.id ? ' aria-current="true"' : ''}><span>${escape(r.title)}</span><span class="n">${Math.floor((pos?.pct || 0) * 100)}%</span>` +
      '<span class="x" role="button" aria-label="Close"><svg><use href="#i-close"/></svg></span></button>';
    li.firstChild.onclick = e => {
      if (!e.target.closest('.x')) return closeLayers(), switchTab(tabs().indexOf(id));
      const reading = id === book?.id;
      closeTab(id);
      if (reading) closeLayers(true); // closing the open book has already moved the reader on
      else li.remove();
    };
    list.append(li);
  }
  const li = document.createElement('li');
  li.innerHTML = '<button class="quiet">Library</button>';
  li.firstChild.onclick = () => { closeLayers(); leave(); };
  list.append(li);
  openSheet('Open books', list);
};

// Margin notes: a bracket beside each run of text a note sums up, and the note beside the bracket,
// staying in view while its run is. Where there's no room for a column of them, the note of the
// run being read (the one a third of the way down the screen) shows at the foot of the page
// instead, and its bracket darkens. A passage whose notes are being written says so.
let runs = [], shown = null;
function drawNotes() {
  const beside = view.classList.contains('beside');
  gloss.replaceChildren();
  CSS.highlights.delete('run');
  const coming = notes.writing(book.id, chapter).map(({ said }) => ({ ...said[0], b2: said.at(-1).b, o2: said.at(-1).e, t: 'Writing notes…', coming: true }));
  const list = settings.notes ? [...notes.of(book.id, chapter), ...coming].filter(n => blocks[n.b] && blocks[n.b2]).sort((x, y) => x.b - y.b || x.o - y.o) : [];
  const els = beside ? list.map(n => {
    const el = Object.assign(document.createElement('div'), { className: n.coming ? 'note coming' : 'note', textContent: n.t });
    if (!n.coming) {
      el.onmouseenter = () => CSS.highlights.set('run', new Highlight(rangeOf(n)));
      el.onmouseleave = () => CSS.highlights.delete('run');
    }
    const side = Object.assign(document.createElement('div'), { className: 'side' }); // as tall as the run, for the note to stay in
    side.append(el);
    gloss.append(side);
    return el;
  }) : [];
  const origin = page.getBoundingClientRect().top - page.scrollTop;
  runs = list.map((n, i) => {
    const r = rangeOf(n).getBoundingClientRect();
    return { top: r.top - origin, bottom: r.bottom - origin, t: n.t, coming: n.coming, height: els[i]?.offsetHeight };
  });
  let free = 0; // where the column of notes is clear from
  runs.forEach((run, i) => {
    if (!run.coming) {
      const end = Math.min(run.bottom, (runs[i + 1]?.top ?? Infinity) - 5);
      run.bracket = Object.assign(document.createElement('i'), { className: 'bracket' });
      run.bracket.style.cssText = `top:${run.top}px;height:${Math.max(end - run.top, 10)}px`;
      gloss.append(run.bracket);
    }
    if (!beside) return;
    const top = Math.max(run.top, free);
    els[i].parentNode.style.cssText = `top:${top}px;height:${Math.max(run.bottom - top, run.height)}px`;
    free = top + run.height + 12;
  });
  showNow(true);
}
const now = $('now');
function showNow(redrawn) {
  const y = page.scrollTop + page.clientHeight / 3;
  const run = view.classList.contains('beside') ? null : runs.findLast(r => r.top <= y);
  const reading = run && y <= run.bottom + page.clientHeight / 3 ? run : null; // (a heading or figure after a run doesn't take its note away)
  if (reading === shown && !redrawn) return;
  shown?.bracket?.classList.remove('on');
  reading?.bracket?.classList.add('on');
  shown = reading;
  if (!reading) return void (now.hidden = true);
  now.classList.toggle('coming', !!reading.coming);
  if (!now.hidden && now.textContent === reading.t) return;
  now.textContent = reading.t;
  now.hidden = false;
  now.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}
let nowFrame = 0;
page.addEventListener('scroll', () => { cancelAnimationFrame(nowFrame); nowFrame = requestAnimationFrame(showNow); }, { passive: true });
const prepareNotes = () => notes.prepare(book.id, book.data, { c: chapter, b: anchor[0] });

// Links, images and highlights.

// A tapped link first shows where it leads: the note itself, or the address of a web page.
function follow(a) {
  const href = a.getAttribute('href');
  if (!href.startsWith('#')) {
    const where = document.createElement('p');
    where.className = 'quiet';
    where.textContent = decodeURI(href.replace(/^https?:\/\/(www\.)?/, ''));
    return popover(where, [['Open link', () => window.open(href, '_blank', 'noopener')]]);
  }
  const id = decodeURIComponent(href.slice(1));
  const c = book.data.ids[id];
  if (c == null) return;
  const note = noteFor(id, c);
  if (!note) return jump(id, true);
  popover(note, [['Go to', () => jump(id, true)]]);
}

// The content of a note: the block its id names — or, when that's only the note's marker
// ("1"), what follows, since a converted footnote splits the number from its text.
function noteFor(id, c) {
  const target = (c === chapter ? flow : section(c)).querySelector(`[id="${CSS.escape(id)}"]`);
  if (!target || target.localName === 'section' || /^h[234]$/.test(target.localName)) return null;
  const markerOnly = el => /^\d{1,3}\.?$/.test(el.textContent.trim()) && el.querySelector('a');
  let block = target.closest('aside, li, p, dd, figure, blockquote') || target;
  while (markerOnly(block) && block.nextElementSibling) block = block.nextElementSibling;
  const note = document.createElement('div');
  note.className = 'flow';
  note.lang = flow.lang;
  note.append(block.cloneNode(true));
  for (let el = block.nextElementSibling; el && note.textContent.trim().length < 12 && !markerOnly(el); el = el.nextElementSibling) {
    note.append(el.cloneNode(true));
  }
  note.querySelectorAll('img[data-k]').forEach(picture);
  return note.textContent.trim() || note.querySelector('img') ? note : null;
}

// On a device with a mouse, resting on a note's number peeks at it beside the link.
const popoverEl = $('pop');
const hovering = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (hovering) {
  let peekTimer = 0, peekLink = null;
  const drop = () => { clearTimeout(peekTimer); peekLink = null; unpeek(); };
  flow.addEventListener('mouseover', e => {
    const a = e.target.closest?.('a[href^="#"]');
    if (a && a === peekLink && !popoverEl.hidden) return;
    clearTimeout(peekTimer);
    if (a) peekTimer = setTimeout(() => { peekLink = a; preview(a); }, 220);
    else if (!e.target.closest?.('#pop')) peekTimer = setTimeout(drop, 180);
  });
  flow.addEventListener('focusin', e => {
    const a = e.target.closest?.('a[href^="#"]');
    if (a) { peekLink = a; preview(a); }
  });
  flow.addEventListener('focusout', () => setTimeout(drop, 180));
  popoverEl.addEventListener('mouseover', () => clearTimeout(peekTimer));
  popoverEl.addEventListener('mouseleave', drop);
  page.addEventListener('scroll', drop, { passive: true });
}
function preview(a) {
  if (layerOpen() || !getSelection().isCollapsed) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(1));
  const c = book.data.ids[id];
  if (c == null) return;
  const note = noteFor(id, c);
  if (note) peek(note, a);
}

// Highlights are ranges painted with the CSS Custom Highlight API; the text itself is untouched.
const marks = () => store.all('mark').filter(m => m.book === book.id && m.c === chapter && blocks[m.b] && blocks[m.b2]);
function rangeOf(m) {
  const r = document.createRange();
  r.setStart(...caret(blocks[m.b], m.o));
  r.setEnd(...caret(blocks[m.b2], m.o2));
  return r;
}
function paintMarks() {
  for (const color of COLORS) CSS.highlights.set(color, new Highlight(...marks().filter(m => m.color === color).map(rangeOf)));
}
const markAt = (x, y) => marks().find(m => [...rangeOf(m).getClientRects()].some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));

function editMark(m) {
  const box = document.createElement('div');
  box.innerHTML = `<blockquote class="quote">${escape(m.text)}</blockquote><textarea placeholder="Add a note"></textarea>`;
  const note = box.querySelector('textarea');
  note.value = m.note || '';
  note.oninput = () => store.put('mark', m.id, { ...store.get('mark', m.id), note: note.value.trim() });
  popover(box, [['Done', () => {}], ['Remove', () => { store.remove('mark', m.id); paintMarks(); }]]);
  if (!m.note) note.focus();
}

const selbar = $('selbar');
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (view.hidden || sel.isCollapsed || !flow.contains(sel.anchorNode)) return void (selbar.hidden = true);
  const rects = sel.getRangeAt(0).getClientRects();
  const last = rects[rects.length - 1];
  if (!last) return;
  selbar.hidden = false;
  const below = matchMedia('(pointer: coarse)').matches;
  selbar.style.left = `${Math.min(Math.max(last.right - last.width / 2, 120), innerWidth - 120)}px`;
  selbar.style.top = below ? `${Math.min(last.bottom + 44, innerHeight - 60)}px` : `${Math.max(rects[0].top - 52, 8)}px`;
});
// The bar acts as soon as it is touched, while the selection still exists.
selbar.onpointerdown = e => {
  e.preventDefault();
  const button = e.target.closest('button');
  const sel = getSelection();
  if (!button || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (button.id === 'sel-copy') navigator.clipboard.writeText(sel.toString());
  else {
    const start = pointOf(range.startContainer, range.startOffset), end = pointOf(range.endContainer, range.endOffset);
    if (start && end) {
      const id = crypto.randomUUID().slice(0, 13);
      const m = { book: book.id, c: chapter, b: start[0], o: start[1], b2: end[0], o2: end[1], color: button.dataset.color || 'ochre', text: sel.toString().trim(), note: '' };
      store.put('mark', id, m);
      paintMarks();
      if (button.id === 'sel-note') setTimeout(() => editMark({ id, ...m }));
    }
  }
  sel.removeAllRanges();
  selbar.hidden = true;
};
