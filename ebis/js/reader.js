// The reader. One chapter at a time is laid out in CSS columns, a page per screen
// (two on a wide one). A position is [chapter, block, character], so it survives any
// change of device, type size or theme.

import * as store from './store.js';
import { blocks as leafBlocks, blockSizes } from './convert.js';
import { settings, update, onUpdate } from './settings.js';
import { $, template, escape, openSheet, popover, lightbox, closeLayers, layerOpen, toast } from './ui.js';

const view = $('reader'), page = $('page'), flow = $('flow');
const COLORS = ['ochre', 'rubric', 'lapis'];
const FACES = ['1em Libron', 'italic 1em Libron', 'bold 1em Libron', 'italic bold 1em Libron'];
let deviceName = matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer';
navigator.userAgentData?.getHighEntropyValues(['model']).then(d => { if (d.model) deviceName = d.model; });

let book = null;            // { id, record, data: book.json, urls, starts: first character of each chapter }
let chapter = 0, at = 0;    // chapter index and page within it
let anchor = [0, 0];        // the reader's place: what a new layout must keep on screen
let geo = null;             // the page geometry
let blocks = [], offsets = [];
let heads = [];             // contents entries in this chapter, with the block each starts at
let cpm = +localStorage.getItem('ebis.cpm') || 1100; // reading speed, characters per minute
let lastTurn = { at: 0, char: 0 }, wake = null, wakeTimer = 0;
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
  flow.innerHTML = book.data.chapters[chapter] + '<i class="end"></i>';
  for (const img of flow.querySelectorAll('img[data-k]')) img.src = book.urls[img.dataset.k];
  blocks = leafBlocks(flow);
  offsets = [];
  blocks.reduce((sum, el) => (offsets.push(sum), sum + (el.textContent.length || 1)), 0);
  measure();
  heads = book.data.toc.filter(t => book.data.ids[t.id] === chapter).map(t => {
    const el = flow.querySelector(`[id="${CSS.escape(t.id)}"]`);
    return { entry: t, b: el ? blockAt(el) : 0 };
  });
  const p = target === 'end' ? geo.pages - 1
    : target === 'start' ? 0
    : target.id ? pageOfElement(flow.querySelector(`[id="${CSS.escape(target.id)}"]`))
    : pageOf(target.loc);
  go(p, false, target.loc);
  paintMarks();
  if (fade) flow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
}

function measure() {
  const W = page.clientWidth, H = page.clientHeight, fs = settings.size;
  const mx = Math.round(Math.min(Math.max(W * 0.06, 16), 48) * settings.margin);
  const cols = settings.spread && W / 2 - 2 * mx >= fs * 22 ? 2 : 1;
  const colStride = Math.floor(W / cols);
  const c = Math.floor(Math.min(colStride - 2 * mx, fs * 34));
  const gap = colStride - c;
  const x0 = Math.round((W - colStride * cols + gap) / 2);
  const vars = {
    '--fs': `${fs}px`, '--lh': settings.leading, '--cols': cols, '--gap': `${gap}px`, '--x0': `${x0}px`,
    '--flow-w': `${cols * c + (cols - 1) * gap}px`, '--page-h': `${H}px`,
    '--align': settings.justify ? 'justify' : 'start', '--hyphens': settings.justify ? 'auto' : 'manual',
    '--indent': settings.indent ? '1.4em' : '0', '--para-gap': settings.indent ? '0' : '.7em',
  };
  for (const [k, v] of Object.entries(vars)) view.style.setProperty(k, v);
  view.dataset.cols = cols;
  geo = { W, H, cols, c, gap, stride: colStride * cols };
  geo.pages = Math.floor(columnOf(flow.querySelector('.end').getBoundingClientRect()) / cols) + 1;
}

const columnOf = rect => Math.floor((rect.left - flow.getBoundingClientRect().left + 1) / (geo.c + geo.gap));
const pageOfRect = rect => rect ? Math.floor(columnOf(rect) / geo.cols) : 0;
const pageOfElement = el => el ? pageOfRect(el.getClientRects()[0] || el.getBoundingClientRect()) : 0;
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
function pageOf([b, o] = [0, 0]) {
  const el = blocks[Math.min(b, blocks.length - 1)];
  return el ? pageOfRect(o > 0 ? charRect(el, o) : el.getClientRects()[0]) : 0;
}

// The first character on the current page.
function locator() {
  const first = at * geo.cols;
  const endsAfter = el => { const r = el.getClientRects(); return r.length && columnOf(r[r.length - 1]) >= first; };
  let lo = 0, hi = blocks.length - 1, b = Math.max(0, blocks.length - 1);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (endsAfter(blocks[mid])) b = mid, hi = mid - 1;
    else lo = mid + 1;
  }
  const el = blocks[b];
  const start = el?.getClientRects()[0];
  if (!start || columnOf(start) >= first) return [b, 0];
  let o = 0;
  for (let l = 0, h = el.textContent.length - 1; l <= h;) {
    const mid = (l + h) >> 1;
    if (columnOf(charRect(el, mid)) >= first) o = mid, h = mid - 1;
    else l = mid + 1;
  }
  return [b, o];
}

const fraction = ([b, o]) => (book.starts[chapter] + (offsets[b] || 0) + o) / book.total;
// The contents entry the reader is in: the last one at or before the place.
const entry = () => heads.filter(h => h.b <= anchor[0]).at(-1)?.entry ?? book.data.toc.filter(t => book.data.ids[t.id] < chapter).at(-1);

// Turning pages.

// Show page p. The place it records is the exact one being shown when known (a search
// result, a synced position), otherwise the page's first character.
function go(p, animate, place) {
  at = Math.max(0, Math.min(p, geo.pages - 1));
  flow.classList.toggle('turning', !!animate && settings.slide);
  flow.style.transform = `translateX(${-at * geo.stride}px)`;
  anchor = place ?? locator();
  refresh();
  remember(anchor);
}

function next() {
  if (at < geo.pages - 1) go(at + 1, true);
  else if (chapter < book.data.chapters.length - 1) render(chapter + 1, 'start', true);
  else go(at, true);
}
function prev() {
  if (at > 0) go(at - 1, true);
  else if (chapter > 0) render(chapter - 1, 'end', true);
  else go(at, true);
}

function remember([b, o]) {
  // Reading speed, learned from ordinary page turns.
  const now = Date.now(), char = book.starts[chapter] + (offsets[b] || 0) + o;
  const read = char - lastTurn.char, minutes = (now - lastTurn.at) / 60000;
  if (read > 200 && read < 6000 && minutes > 0.07 && minutes < 10) {
    cpm = Math.round(cpm * 0.9 + (read / minutes) * 0.1);
    localStorage.setItem('ebis.cpm', cpm);
  }
  lastTurn = { at: now, char };
  const pos = store.get('pos', book.id);
  if (pos && pos.c === chapter && pos.b === b && pos.o === o) return;
  store.put('pos', book.id, { c: chapter, b, o, pct: fraction([b, o]), device: deviceName, at: now }, false);
  keepAwake();
}

function refresh() {
  const [b, o] = anchor, pct = fraction(anchor);
  const left = geo.pages - 1 - at;
  const charsLeft = book.data.sizes[chapter] - (offsets[b] || 0) - o;
  const minutes = Math.max(1, Math.round(charsLeft / cpm));
  $('folio-l').textContent = settings.folio === 'time'
    ? `${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`} left in chapter`
    : left ? `${left} ${left > 1 ? 'pages' : 'page'} left in chapter` : 'Last page in chapter';
  $('folio-r').textContent = `${Math.floor(pct * 100)}%`;
  const head = entry()?.title || book.record.title;
  $('run-l').textContent = book.record.title;
  $('run-r').textContent = head;
  $('scrub').value = Math.round(pct * 1000);
  $('scrub-label').textContent = head;
}

// Touch, mouse, keys and wheel.

let touch = null;
page.addEventListener('pointerdown', e => {
  if (e.isPrimary && e.button < 1) touch = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, mouse: e.pointerType === 'mouse', dx: 0 };
});
page.addEventListener('pointermove', e => {
  if (!touch || touch.mouse || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (!touch.drag) {
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2 || !getSelection().isCollapsed) return;
    touch.drag = true;
    page.setPointerCapture(e.pointerId);
    flow.classList.remove('turning');
  }
  const stuck = (dx > 0 && at === 0 && chapter === 0) || (dx < 0 && at === geo.pages - 1 && chapter === book.data.chapters.length - 1);
  touch.dx = dx;
  flow.style.transform = `translateX(${-at * geo.stride + dx * (stuck ? 0.25 : 1)}px)`;
});
page.addEventListener('pointerup', e => {
  const t = touch;
  touch = null;
  if (!t || e.pointerId !== t.id) return;
  if (t.drag) {
    const speed = t.dx / Math.max(1, e.timeStamp - t.t);
    if (t.dx < -geo.W * 0.2 || speed < -0.35) next();
    else if (t.dx > geo.W * 0.2 || speed > 0.35) prev();
    else go(at, true);
  } else if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8 && e.timeStamp - t.t < 450) tap(e);
});
page.addEventListener('pointercancel', () => { if (touch?.drag) go(at, true); touch = null; });
flow.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); });

function tap(e) {
  if (!getSelection().isCollapsed) return getSelection().removeAllRanges();
  if (layerOpen()) return closeLayers();
  const link = e.target.closest('a[href]');
  if (link) return follow(link);
  const mark = markAt(e.clientX, e.clientY);
  if (mark) return editMark(mark);
  if (e.target.localName === 'img') return lightbox(e.target.src);
  if (view.classList.contains('ui')) return showUI(false);
  const x = e.clientX / innerWidth;
  if (x < 0.3) prev();
  else if (x > 0.7) next();
  else showUI(true);
}

// A wheel or trackpad gesture is a stream of events; each gesture turns one page.
let wheel = { sum: 0, last: 0, spent: false };
page.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.timeStamp - wheel.last > 200) wheel = { sum: 0, spent: false };
  wheel.last = e.timeStamp;
  if (wheel.spent) return;
  wheel.sum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(wheel.sum) > 30) wheel.spent = true, wheel.sum > 0 ? next() : prev();
}, { passive: false });

addEventListener('keydown', e => {
  if (view.hidden || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
  if (layerOpen()) return e.key === 'Escape' && closeLayers();
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) next();
  else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) prev();
  else if (k === 'Escape') view.classList.contains('ui') ? showUI(false) : leave();
  else if (e.altKey && /^Digit[1-9]$/.test(e.code)) switchTab(+e.code.slice(5) - 1);
  else return;
  e.preventDefault();
});

new ResizeObserver(() => relayout()).observe(page);
document.fonts.addEventListener('loadingdone', () => relayout());
onUpdate(changes => 'folio' in changes ? book && refresh() : relayout());

// Lay the chapter out again (new size or settings) keeping the reader's place on screen.
function relayout() {
  if (!book || view.hidden || !geo) return;
  measure();
  go(pageOf(anchor), false, anchor);
}

// Keep the screen awake while reading, for a few minutes after each page.
async function keepAwake() {
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(releaseWake, 5 * 60000);
  if (!wake && navigator.wakeLock && document.visibilityState === 'visible') {
    wake = await navigator.wakeLock.request('screen').catch(() => null);
    wake?.addEventListener('release', () => { wake = null; });
  }
}
function releaseWake() { wake?.release(); wake = null; }

// Positions from the other device.
store.onChange(({ kind, id, remote }) => {
  if (!book || view.hidden || !remote) return;
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
  const target = (c === chapter ? flow : section(c)).querySelector(`[id="${CSS.escape(id)}"]`);
  if (!target || target.localName === 'section' || /^h[234]$/.test(target.localName)) return jump(id, true);
  const note = document.createElement('div');
  note.className = 'flow';
  note.lang = flow.lang;
  note.append((target.closest('aside, li, p, dd, figure, blockquote') || target).cloneNode(true));
  for (const img of note.querySelectorAll('img[data-k]')) img.src = book.urls[img.dataset.k];
  popover(note, [['Go to', () => jump(id, true)]]);
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
