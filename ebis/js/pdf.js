// PDFs, reflowed. PDF.js gives positioned text and drawing operations. Lines are rebuilt into
// paragraphs from their spacing and indents, and running heads and page numbers (lines that
// repeat at the same place) are dropped. What is set to be looked at rather than read along —
// a figure with its labels, a table, a displayed formula — is cut from the rendered page whole,
// to be shown at the size of the text around it. The result is plain HTML; convert.js decides
// what is a heading.

import { AnnotationMode, getDocument, GlobalWorkerOptions, OPS, Util } from '../vendor/pdfjs/pdf.min.mjs';

const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
const PAINT = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
const FILL = new Set([OPS.fill, OPS.eoFill]);
const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const small = (size, stats) => size < stats.body * 0.92; // notes are set smaller than the text they annotate
const mode = values => {
  const n = new Map();
  for (const [v, w = 1] of values) n.set(v, (n.get(v) || 0) + w);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export async function pdfSource(file) {
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${BASE}cmaps/`, standardFontDataUrl: `${BASE}standard_fonts/`,
    wasmUrl: `${BASE}wasm/`, iccUrl: `${BASE}iccs/`, isEvalSupported: false, fontExtraProperties: true,
  }).promise.catch(e => { throw new Error(e.name === 'PasswordException' ? 'This PDF is locked with a password.' : 'This PDF looks damaged.'); });
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 8) { // a few at a time, so the worker never waits on us
    const batch = Array.from({ length: Math.min(8, pdf.numPages - n + 1) }, (_, i) => pdf.getPage(n + i).then(readPage));
    pages.push(...await Promise.all(batch));
  }

  // What the book is set in, and which lines are furniture rather than text.
  const body = mode(pages.flatMap(p => p.lines.map(l => [l.size, l.text.length])));
  const leading = mode(pages.flatMap(p => p.lines.slice(1).map((l, i) => [Math.round(l.y - p.lines[i].y), +(l.size === body)])).filter(([d]) => d > 0));
  const key = l => l.text.replace(/\d+/g, '#').trim();
  const banded = pages.flatMap(p => p.lines.filter(l => l.y < p.height * 0.09 || l.y > p.height * 0.91));
  const seen = new Map();
  for (const l of banded) seen.set(key(l), (seen.get(key(l)) || 0) + 1);
  const furniture = new Set(banded.filter(l => seen.get(key(l)) >= 3 || /^(page )?[\divxlc]+$/i.test(l.text.trim())));

  // The PDF's own outline gives the contents. Each entry points at a place on a page, and
  // chapters begin at the entries of the outline's first level that has more than one (but not
  // at a figure's or table's entry: one lies amid the text, often mid-sentence).
  const { info } = await pdf.getMetadata();
  const places = new Map(); // outline id → { page, x, y }
  const walk = async items => {
    const out = [];
    for (const item of items) {
      const place = await placeOf(pdf, item.dest);
      const id = place && `o${places.size}`;
      if (place) places.set(id, place);
      out.push({ label: item.title, href: id, subitems: await walk(item.items) });
    }
    return out;
  };
  const toc = await walk(await pdf.getOutline() || []);
  let level = toc;
  while (level.length === 1 && level[0].subitems.length) level = level[0].subitems;
  // The first chapter holds whatever precedes the first entry: a title page, an abstract. Entries
  // go in reading order: by page, then column, then down the page.
  const order = id => { const p = places.get(id); return [p.page, +(p.x > pages[p.page].width * 0.45), p.y ?? -Infinity]; };
  const bounds = [null, ...level.filter(t => t.href && !LABEL.test(t.label)).map(t => t.href).sort((a, b) => {
    const [p, q] = [order(a), order(b)];
    return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
  })];
  const starts = new Set(bounds);

  // Words this document hyphenates itself, so a line break at "single-subject" (or the "to-correct"
  // of "wrong-to-correct") keeps its hyphen.
  const compounds = new Set(pages.flatMap(p => p.lines.flatMap(l => (l.text.toLowerCase().match(/\p{L}+(-\p{L}+)+/gu) || [])
    .flatMap(w => w.split('-').slice(1).map((part, i) => `${w.split('-')[i]}-${part}`)))));
  // The columns it is set in: left edges at which many of its lines begin, page after page.
  const edges = new Map();
  for (const l of pages.flatMap(p => p.lines).filter(l => l.text.length > 30)) edges.set(Math.round(l.x0 / 4) * 4, (edges.get(Math.round(l.x0 / 4) * 4) || 0) + 1);
  const columns = [...edges].filter(([, k]) => k > [...edges.values()].reduce((a, b) => a + b, 0) * 0.1).map(([x]) => x);
  const stats = { body, leading, compounds, columns, span: measureOf(pages, body) || pages[0]?.width * 0.7 };
  const arranged = new Map(); // page → its lines, figures and outline places in reading order, worked out once
  const itemsOf = n => arranged.get(n) || arranged.set(n, arrange(pdf, n, pages[n], furniture, stats, places)).get(n);
  const sectionOf = new Map(); // outline id → the chapter it landed in
  const first = pages[0]?.lines || [];
  const biggest = Math.max(...first.map(l => l.size));
  return { // without a title in its metadata, a PDF's title is the largest type on its first page
    meta: { title: info.Title?.trim() || first.filter(l => l.size === biggest).map(l => l.text.trim()).join(' '), author: info.Author?.trim() || '' },
    cover: renderPage(await pdf.getPage(1), 420).then(c => c.convertToBlob({ type: 'image/webp', quality: 0.86 })),
    toc,
    sections: bounds.map((from, k) => ({
      async load() { // everything from this chapter's place to wherever another chapter begins
        const flow = new Flow(stats);
        let on = !from;
        pages: for (let n = from ? places.get(from).page : 0; n < pages.length; n++) {
          for (const item of await itemsOf(n)) {
            if (on && item.anchor !== from && starts.has(item.anchor)) break pages;
            on ||= item.anchor === from;
            if (!on) continue;
            if (item.anchor) sectionOf.set(item.anchor, k);
            flow.add(item);
          }
        }
        return { html: `<!doctype html><html><body>${flow.end()}</body></html>` };
      },
    })),
    resolve: href => sectionOf.has(href) ? `s${sectionOf.get(href)}-${href}` : null,
  };
}

// Where an outline entry points: its page, and the point on that page (from its top), when it says.
async function placeOf(pdf, dest) {
  const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
  if (!d) return null;
  const page = typeof d[0] === 'number' ? d[0] : await pdf.getPageIndex(d[0]).catch(() => null);
  if (page == null) return null;
  const [left, top] = { XYZ: [d[2], d[3]], FitH: [null, d[2]], FitBH: [null, d[2]], FitR: [d[2], d[5]] }[d[1]?.name] || [];
  if (top == null) return { page, x: null, y: null };
  const [x, y] = (await pdf.getPage(page + 1)).getViewport({ scale: 1 }).convertToViewportPoint(left ?? 0, top);
  return { page, x: left == null ? null : x, y };
}

// The text of a page as lines, in the order the PDF draws them (which is reading order). A
// formula's scripts are set smaller, a step above or below their line, sometimes one under
// the other (r with ⁽⁰⁾ over ᵢ) and sometimes drawn after the rest of it: each joins the line
// it belongs to. What can't be part of a line — a rotated run (an axis title), a glyph with
// no letters (a tall bracket) — is kept as a box, so a picture beside it can take it in.
async function readPage(page) {
  const vp = page.getViewport({ scale: 1 });
  const [, { items }] = await Promise.all([page.getOperatorList(), page.getTextContent()]); // the operators load the page's fonts, whose names say what their glyphs are
  const fonts = new Map();
  const font = id => fonts.get(id) || fonts.set(id, styleOf(page.commonObjs.has(id) ? page.commonObjs.get(id) : {})).get(id);
  const lines = [], marks = [];
  let line = null;
  for (const it of items) {
    if (!it.str?.trim() && !it.str?.includes(' ')) continue;
    const [a, b, c, d, x, y] = Util.transform(vp.transform, it.transform);
    const size = Math.round(Math.hypot(c, d) * 2) / 2, style = font(it.fontName);
    const str = unicode(it.str, style.name).replace(/[ﬀ-ﬆ]/g, ch => ch.normalize('NFKC'));
    const rotated = Math.abs(b) > Math.abs(a) * 0.2, blank = str.trim() && !/[^\s\0-\x1f\u{e000}-\u{f8ff}]/u.test(str); // a glyph with no character
    if ((rotated || blank || style.tall) && str.trim()) { // its box: a bracket hangs low, a rotated label runs up
      const [ux, uy] = [a / (Math.hypot(a, b) || 1), b / (Math.hypot(a, b) || 1)]; // the way it runs
      const [vx, vy] = [c / (Math.hypot(c, d) || 1) * size, d / (Math.hypot(c, d) || 1) * size]; // up, a glyph's height
      const ends = [[x, y], [x + ux * it.width, y + uy * it.width]];
      const corners = ends.flatMap(([px, py]) => [[px + vx, py + vy], [px - vx * 1.4, py - vy * 1.4]]);
      marks.push(Object.assign([Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])),
        Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))], { size }));
    }
    if (rotated || blank) continue;
    // An accent drawn as a glyph of its own often shares a run with what comes before it ("[ˆ" of
    // [â]); it is split off, to be set on its letter. A space is part of its line, however wide (a
    // loosely justified line's, or one between a table's cells): it says where the next word may
    // begin, though not how far the line's ink goes.
    let at = x;
    for (const part of str.length > 1 ? str.split(ACCENTS) : [str]) {
      if (!part) continue;
      const run = { str: part, x: at, y, w: it.width * part.length / str.length, size, style };
      at += run.w;
      const ink = !!run.str.trim();
      if (!line || !joins(line, run)) {
        if (!ink) continue;
        lines.push(line = { runs: [], x0: run.x, x1: run.x, end: run.x, y: run.y, size: run.size, page: page.pageNumber - 1 });
      } else if (run.size > line.size * 1.1 && ink) Object.assign(line, { y: run.y, size: run.size }); // the line so far was a raised mark
      line.runs.push(run);
      if (Math.abs(run.y - line.y) < run.size * 0.25) line.end = Math.max(line.end, run.x + run.w); // how far along its baseline it has come
      if (!ink) continue;
      line.x0 = Math.min(line.x0, run.x);
      line.x1 = Math.max(line.x1, run.x + run.w);
    }
  }
  const into = (host, l) => {
    host.runs.push(...l.runs);
    host.x0 = Math.min(host.x0, l.x0);
    host.x1 = Math.max(host.x1, l.x1);
    l.runs = [];
  };
  for (const l of lines) { // scripts drawn apart from their line (a few characters, not a line of words), and a script's own
    const host = l.runs.reduce((n, r) => n + r.str.trim().length, 0) <= 12 && lines.find(m => m !== l && m.runs.length && Math.abs(m.y - l.y) < m.size
      && Math.min(m.x1, l.x1) > Math.max(m.x0, l.x0) - m.size && l.runs.every(r => r.size < m.size * 0.85));
    if (host) into(host, l);
  }
  for (const l of lines) { // a line that a fraction in it broke in two goes on along its baseline
    const host = l.runs.length && lines.find(m => m !== l && m.runs.length && Math.abs(m.size - l.size) < 0.5 && Math.abs(m.y - l.y) < m.size * 0.25
      && l.x0 - m.x1 > -m.size * 0.5 && l.x0 - m.x1 < m.size * 1.2);
    if (host) into(host, l);
  }
  for (let k = 0; k < lines.length; k++) { // an equation's number at the margin is a line of its own
    const l = lines[k];
    l.runs.sort((a, b) => a.x - b.x || a.y - b.y);
    const inked = l.runs.filter(r => r.str.trim());
    const i = inked.findLastIndex((r, j) => j && r.x - (inked[j - 1].x + inked[j - 1].w) > l.size);
    const tail = inked.slice(i);
    if (i < 1 || !EQNO.test(tail.map(r => r.str).join('').trim())) continue;
    l.runs = l.runs.filter(r => r.x < tail[0].x);
    l.x1 = Math.max(...l.runs.filter(r => r.str.trim()).map(r => r.x + r.w));
    lines.splice(k + 1, 0, { runs: tail, x0: tail[0].x, x1: tail.at(-1).x + tail.at(-1).w, y: tail[0].y, size: tail[0].size, page: l.page });
  }
  for (const l of lines) {
    if (!l.runs.length) continue;
    for (let i = 1; i < l.runs.length; i++) { // scripts stacked on one symbol read subscript first, as TeX writes them (x_i^2)
      const [p, r] = [l.runs[i - 1], l.runs[i]];
      if (p.size < l.size * 0.9 && r.size < l.size * 0.9 && p.y < r.y - r.size * 0.5 && r.x < p.x + p.w * 0.5) [l.runs[i - 1], l.runs[i]] = [r, p];
    }
    for (const r of l.runs.filter(r => ACCENT[r.str.trim()])) { // an accent set over a letter (â, x̃, ȳ) is a glyph of its own; it joins its letter
      const mid = r.x + r.w / 2, base = l.runs.find(b => b !== r && !ACCENT[b.str.trim()] && b.str.trim() && mid >= b.x && mid <= b.x + b.w && b.y > r.y - r.size * 0.1);
      if (!base) continue;
      const i = Math.min(base.str.length - 1, Math.floor((mid - base.x) / (base.w / base.str.length)));
      base.str = base.str.slice(0, i + 1) + ACCENT[r.str.trim()] + base.str.slice(i + 1);
      r.str = '';
    }
    l.runs = l.runs.filter(r => r.str);
    // The line's own type is its largest, not its scripts' (however many words they hold), nor a
    // drop capital's (a single letter); small capitals set in two sizes have their capitals'.
    const chars = new Map();
    for (const r of l.runs) chars.set(r.size, (chars.get(r.size) || 0) + r.str.trim().length);
    const top = Math.max(...[...chars].filter(([, n]) => n > 1).map(([size]) => size));
    const main = l.runs.reduce((m, r) => (r.size === top) > (m.size === top) || ((r.size === top) === (m.size === top) && r.str.trim().length > m.str.trim().length) ? r : m);
    const caps = l.runs.filter(r => /\p{Lu}/u.test(r.str) && !r.style.math && r.size > main.size && r.size < main.size * 1.45 && Math.abs(r.y - main.y) < main.size * 0.2);
    l.runs = l.runs.filter(r => r.str.trim() || Math.abs(r.y - main.y) < main.size * 0.25); // a space off the baseline only trails a script
    Object.assign(l, { size: Math.max(main.size, ...caps.map(r => r.size)), y: main.y, text: l.runs.map(r => r.str).join('') });
    Object.assign(l, { math: mathShare(l), bold: l.runs.every(r => !r.str.trim() || r.style.bold), mono: l.runs.every(r => (r.style.mono && !r.style.math) || !r.str.trim()) }); // (TeX's math extension font calls itself fixed-pitch)
  }
  return { width: vp.width, height: vp.height, lines: lines.filter(l => l.text?.trim()), marks };
}

// Whether a run continues a line: along its baseline, just after it; as a script, smaller and a
// step above or below, anywhere along it; or, when the line so far is a raised mark (a note's
// number), as the text the mark belongs to.
const BIG = /^\s*[()[\]{}|‖⟨⟩⌊⌋⌈⌉√∑∏∐∫∮⋃⋂⋁⋀⨁⨂/\\]\s*$/;
const ACCENT = { 'ˆ': '\u0302', '˜': '\u0303', '¯': '\u0304', '˙': '\u0307', '¨': '\u0308', 'ˇ': '\u030c', '´': '\u0301', '`': '\u0300', '˘': '\u0306', '˚': '\u030a', '⃗': '\u20d7' };
const ACCENTS = new RegExp(`([${Object.keys(ACCENT).join('')}])`);
function joins(line, run) {
  const s = Math.max(line.size, run.size), dy = run.y - line.y;
  if (run.x > Math.max(line.x1, line.end) + s * 1.2 || run.x < line.x0 - s * 0.5) return false;
  if (Math.abs(dy) < s * 0.25) return run.x > line.end - s; // (a script may overhang what follows it)
  if (BIG.test(run.str) && Math.abs(dy) < s * 1.6 && run.x > line.x1 - s * 0.3) return true; // a tall bracket or sum, hung from a baseline of its own
  if (run.size < line.size * 0.9) return dy > -s * 0.75 && dy < s * 0.5;
  const mark = line.runs.reduce((n, r) => n + r.str.trim().length, 0) <= 3;
  return mark && line.size < run.size * 0.9 && run.x > line.x1 - s * 0.3 && dy > -s * 0.5 && dy < s * 0.75;
}

async function renderPage(page, width) {
  const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  // The print intent renders without waiting for animation frames, so it keeps going in a background tab.
  await page.render({ canvas, viewport: vp, intent: 'print', annotationMode: AnnotationMode.DISABLE }).promise;
  const out = new OffscreenCanvas(canvas.width, canvas.height);
  out.getContext('2d').drawImage(canvas, 0, 0);
  return out;
}

// What a page draws besides its text: pictures and shapes (a plot's lines and marks, a
// diagram's boxes), and rules, lines thinner than a stroke of type, which frame tables and
// algorithms. Each is only as large as the part of it that shows, within the clipping path and
// the bounds of the form it is drawn in. A shape as large as the page is its background, and
// one filled white is unseen.
async function drawings(page, data) {
  const { fnArray, argsArray } = await page.getOperatorList();
  let ctm = page.getViewport({ scale: 1 }).transform, fill = '#000000', clip = [0, 0, data.width, data.height], clipping = false;
  const stack = [], shapes = [], rules = [];
  const box = (rect, m) => {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    Util.axialAlignedBoundingBox(rect, m, b);
    return [Math.max(clip[0], b[0]), Math.max(clip[1], b[1]), Math.min(clip[2], b[2]), Math.min(clip[3], b[3])];
  };
  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) stack.push([ctm, fill, clip]);
    if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) [ctm, fill, clip] = stack.pop() || [ctm, fill, clip];
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      if (args[0]) ctm = Util.transform(ctm, args[0]);
      if (args[1]) clip = box(args[1], ctm);
    } else if (fn === OPS.clip || fn === OPS.eoClip) clipping = true; // the path that follows bounds what is drawn after it
    else if (fn === OPS.setFillRGBColor) fill = args[0];
    else if (PAINT.has(fn)) shapes.push(box([0, 0, 1, 1], ctm));
    else if (fn === OPS.constructPath && args[2]) {
      const b = box(args[2], ctm), w = b[2] - b[0], h = b[3] - b[1];
      if (clipping) clip = b, clipping = false;
      if (args[0] === OPS.endPath || (w > data.width * 0.85 && h > data.height * 0.85) || (FILL.has(args[0]) && /^#f[cdef]f[cdef]f[cdef]$/i.test(fill))) return;
      if (h < 1.5 && w > 6) rules.push(b);
      else shapes.push(b);
    }
  });
  return { shapes: shapes.filter(b => b[2] > b[0] && b[3] > b[1]), rules: rules.filter(b => b[2] > b[0]) };
}

const join = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const meets = (a, b, dx = 0, dy = dx) => a[0] < b[2] + dx && a[2] > b[0] - dx && a[1] < b[3] + dy && a[3] > b[1] - dy;
const boxOf = l => [l.x0, l.y - l.size * 0.85, l.x1, l.y + l.size * 0.25];
const area = b => (b[2] - b[0]) * (b[3] - b[1]);
function merge(boxes, gap) {
  let regions = boxes.map(b => [...b]);
  for (let merged = true; merged;) {
    merged = false;
    regions = regions.reduce((out, r) => {
      const hit = out.find(o => meets(r, o, gap));
      if (hit) hit.splice(0, 4, ...join(hit, r)), merged = true;
      else out.push(r);
      return out;
    }, []);
  }
  return regions;
}

// How much of a line is mathematics: of its letters and signs, those set in a math font or in a
// script's size (ℒ_lowlevel), or that are mathematical signs. Digits, brackets and punctuation
// belong to either.
const MATH_FONT = /cm(mi|sy|ex|bsy|mib)\d|cmmi|msam|msbm|eu[frs]m|rsfs|stmary|wasy|lmmath|latinmodern-?math|lm(mi|sy|ex)\d|mt(mi|sy|ex)|tx(mi|sy|ex)|px(mi|sy|ex)|newcm\w*math|stix\w*math|xits\w*math|cambria\W?math|asana|libertinusmath|symbol|mt\W?extra|mathematicalpi|esint|dsrom|bbold/i;
const MATH_SIGN = /[∑∏∫∮√∞∂∇±∓×÷≤≥≈≠≡∼≃≅∝∈∉∋⊂⊃⊆⊇∪∩∧∨⊕⊗⊙→←↔⇒⇐⇔↦∀∃∅ℝℕℤℚℂ⟨⟩⌊⌋⌈⌉‖∥⊥∠′∗⋅·=<>+−]/g;
function mathShare(l) {
  let words = 0, math = 0;
  for (const r of l.runs) {
    const script = r.style.math || (r.size < l.size * 0.85 && Math.abs(r.y - l.y) > l.size * 0.08); // (small capitals keep to the baseline)
    math += script ? r.str.replace(/[\s\d.,;:()[\]{}]/g, '').length : (r.str.match(MATH_SIGN) || []).length;
    words += script ? 0 : (r.str.match(/\p{L}/gu) || []).length;
  }
  return math + words ? math / (math + words) : 0;
}

const CAPTION = /^\s*(fig(ure|\.)?|table|tab\.|algorithm|listing|scheme|chart|plate|exhibit)\s*(S?\d+|[IVX]+)[A-Za-z]?\s*[.:|]/i;
const LABEL = /^\s*(fig(ure|\.)?|table|tab\.|algorithm|listing|scheme|chart|plate|exhibit)\s*(S?\d+|[IVX]+)[A-Za-z]?\b/i;
const EQNO = /^\(\s*[A-Z]?\d{1,3}(\.\d{1,3})?[a-z]?\s*\)$/; // an equation's number: (3), (2.1), (A.4), (5b)
const RELATION = /[=≤≥≈≜≡∈∉→←⇒⇔∼≃≅<>≠⊂⊆∝]/;
const BULLET = /^\s*[•◦▪▫▸►‣∙⁃]\s/; // a list's item, however much mathematics it holds
const LEADER = /\p{L}.*(\.\s?){4,}\s*[\divxlc]+\s*$/iu; // a line of contents: its title, dots, a page number

// A page's lines of text, its pictures and the outline's places on it, in reading order.
//
// The page's text is its full lines and the short lines that end their paragraphs, its
// headings, captions and code. Whatever else is set there belongs to something to be looked at:
// - a figure: what the page draws, gathered with the words set against it (labels, tick
//   numbers, legends, the panels beside it), as far as the text around it;
// - a table: the rows between rules as long as each other (booktabs draws three), or, without
//   rules, rows of three or more cells that line up; an algorithm, between its rules;
// - a displayed formula: what is set level with an equation's number at the margin, and lines
//   of mathematics set apart from the text, with their fraction bars, limits and brackets.
// Each is cut from the page as one picture; a figure or table keeps its caption with it.
async function arrange(pdf, n, data, furniture, stats, places) {
  const page = await pdf.getPage(n + 1);
  const { shapes, rules } = await drawings(page, data);
  const s = stats.body || 10, lead = stats.leading || s * 1.2; // (a scanned page has no text to measure)
  const text = data.lines.filter(l => !furniture.has(l));

  // A full line is as long as most of the page's lines of prose (a column's measure, or the page's).
  const span = measureOf([data], s) || stats.span;
  const full = l => l.x1 - l.x0 > span * 0.7 && l.math < 0.5 && l.size > s * 0.75 && cellsOf(l).length < 3 && !sparse(l); // (a table's row is not, nor labels side by side)
  // The page's columns (the document's, and any of its own), and the gutter between them that
  // only a picture may cross.
  const starts = new Map();
  for (const l of text.filter(full)) starts.set(Math.round(l.x0 / 4) * 4, (starts.get(Math.round(l.x0 / 4) * 4) || 0) + 1);
  const cols = [...new Set([...stats.columns, ...[...starts].filter(([, k]) => k >= 3).map(([x]) => x)])].sort((a, b) => a - b)
    .filter((x, i, xs) => !i || x - xs[i - 1] > span * 0.5);
  const gutter = cols.length > 1 ? cols[1] - s : Infinity;
  // A line of words (three or more, outside formulas) set edge to edge is text, however much of it
  // is mathematics; a displayed formula as wide is not.
  const wordsIn = l => l.runs.reduce((n, r) => n + (r.style.math || r.size < l.size * 0.9 ? 0 : (r.str.match(/\p{L}{2,}/gu) || []).length), 0);
  const justified = l => l.x1 - l.x0 > span * 0.85 && l.size > s * 0.75 && cols.some(c => Math.abs(l.x0 - c) < s * 0.6) && !sparse(l) && (l.math < 0.5 || wordsIn(l) > 2);
  const side = b => b[2] <= gutter + 2 ? 0 : b[0] >= gutter - 2 ? 1 : 2; // left column, right column, or both
  const sameSide = (a, b) => side(a) === 2 || side(b) === 2 || side(a) === side(b);

  // Drawn shapes in clusters; a cluster with passages of text in it (not a caption) is only their
  // background, a box around an example; and a picture is larger than a mark in the margin.
  const cap = l => CAPTION.test(l.text) || (LABEL.test(l.text) && l.runs.find(r => r.str.trim())?.style.bold); // "Table 1:", or a bold "Algorithm 1"
  const captionLines = new Set();
  text.forEach((l, i) => {
    const p = text[i - 1];
    if (cap(l) || (p && captionLines.has(p) && l.y > p.y && l.y - p.y < lead * 1.6 && Math.abs(l.size - p.size) < s * 0.15)) captionLines.add(l);
  });
  const prose = text.filter(l => full(l) && !captionLines.has(l) && (l.text.match(/(?<!\S)\p{Ll}{2,}/gu) || []).length > 3);
  const art = merge(shapes, s * 0.8).filter(b => b[2] - b[0] > s * 3 && b[3] - b[1] > s * 2 && area(b) > data.width * data.height * 0.003
    && prose.filter(l => meets(boxOf(l), b, -2)).length < 2);
  // (A shape that lies behind passages of text, a tint or a frame, is only their background.)

  // A page with drawings is drawn, to cut pictures from. Text an included drawing keeps outside
  // the part of it that shows (its own title, clipped away) is there to be found, not seen: it
  // goes. (Where another line lies over it, only the rest of it can tell.)
  const drawn = art.length ? await draw(page) : null;
  const shows = l => {
    const b = boxOf(l);
    let xs = [[b[0], b[2]]];
    for (const m of text) if (m !== l && meets(boxOf(m), b, -1)) xs = xs.flatMap(([a, c]) => [[a, Math.min(c, m.x0)], [Math.max(a, m.x1), c]]).filter(([a, c]) => c - a > 2);
    return !xs.length || xs.some(([a, c]) => inked(drawn, [a, b[1], c, b[3]]));
  };
  if (drawn) for (const l of text.filter(l => !shows(l))) text.splice(text.indexOf(l), 1);

  // Tables drawn with rules: rules as long as each other, one under another, with no caption or
  // passage of text between them, framing rows that aren't a passage either. A rule may be drawn
  // a cell at a time; rules within a drawing are a plot's grid. (A fraction's bar is as long as
  // its numerator, which no other bar is.)
  const passage = l => full(l) && (l.text.match(/(?<!\S)\p{Ll}{2,}/gu) || []).length > 3; // a line of sentences (its words in lower case), as a table's rows never are
  const heads = data.lines.filter(l => furniture.has(l)); // a running head's rule is the page's, not a table's
  const whole = [];
  for (const r of rules.filter(r => !art.some(b => meets(r, b, -2)) && !heads.some(l => Math.abs(l.y - r[1]) < l.size * 1.6)).sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const last = whole.at(-1);
    if (last && Math.abs(last[1] - r[1]) < 1 && r[0] - last[2] < s * 0.5) last.splice(0, 4, ...join(last, r));
    else whole.push([...r]);
  }
  const frames = [];
  for (const r of whole) {
    const frame = frames.find(f => Math.abs(r[0] - f[0]) < 3 && Math.abs(r[2] - f[2]) < 3 && sameSide(f, r)
      && !text.some(l => (cap(l) || passage(l)) && l.y > f[3] && l.y - l.size * 0.85 < r[1] && l.x1 > r[0] && l.x0 < r[2]));
    if (frame) frame.splice(0, 4, ...join(frame, r)), frame.ys.add(Math.round(r[1] / 2));
    else frames.push(Object.assign([...r], { ys: new Set([Math.round(r[1] / 2)]) }));
  }
  // Between a table's rules lie its rows; between a plot's gridlines, mostly nothing — the
  // lines of a drawing.
  const filled = b => {
    const ys = [...b.ys].map(y => y * 2).sort((p, q) => p - q);
    return ys.slice(1).filter((y, i) => text.some(l => l.y - l.size * 0.3 > ys[i] && l.y - l.size * 0.3 < y && l.x1 > b[0] && l.x0 < b[2])).length / (ys.length - 1);
  };
  const framed = frames.filter(b => b.ys.size > 1 && b[3] - b[1] > s * 1.5 && b[2] - b[0] > s * 8 && b[3] - b[1] < data.height * 0.8); // (fraction bars in line are a few ems long)
  const tabled = framed.filter(b => { // (rules around a title, as ICML sets one, frame no table: a table has rows of text-sized type)
    const inside = text.filter(l => meets(boxOf(l), b, 0, -1));
    const rows = new Set(inside.filter(l => l.size < s * 1.15).map(l => Math.round(l.y / s)));
    return filled(b) >= 0.75 && rows.size > 1 && inside.filter(l => l.math >= 0.5).length < inside.length / 2 // (its rows are words and figures, not a formula's lines)
      && ((inside[0] && cap(inside[0])) || inside.filter(passage).length < 5);
  }).map(b => [b[0], b[1] - 1, b[2], b[3] + 1]);
  art.push(...framed.filter(b => b.ys.size > 3 && filled(b) < 0.75).map(b => b.slice(0, 4)));
  // An algorithm is set between rules as wide as it: one over its caption, one under it, and one
  // closing it — with lines between that may look like a passage of text, and aren't.
  for (const c of text.filter(l => cap(l) && /^\s*algorithm/i.test(l.text))) {
    const across = r => r[0] < c.x0 + s && r[2] > c.x1 - s;
    let end = c; // the caption's last line, before any rule
    for (const l of text) if (l.y > end.y && l.y - end.y < lead * 1.5 && Math.abs(l.x0 - c.x0) < s * 3 && Math.abs(l.size - c.size) < s * 0.15
      && !whole.some(r => across(r) && r[1] > end.y && r[1] < l.y)) end = l;
    const below = whole.filter(r => across(r) && r[1] > end.y);
    const under = below[0] && below[0][1] - end.y < lead * 1.2 ? below[0] : null;
    const close = under && below.find(r => r !== under && Math.abs(r[0] - under[0]) < 3 && Math.abs(r[2] - under[2]) < 3);
    if (close) tabled.push([Math.min(close[0], c.x0), under[1] - 1, Math.max(close[2], c.x1), close[3] + 1]);
  }

  // A displayed formula numbered at the margin is whatever sits level with its number, however
  // wordy (Attention(Q, K, V) = softmax(…)V); one too long to share its line has the number
  // below its last line.
  const edge = l => cols.filter(c => c <= l.x0 + s).at(-1) ?? cols[0] ?? l.x0;
  const overlapY = (a, b) => Math.min(a.y + a.size * 0.25, b.y + b.size * 0.25) - Math.max(a.y - a.size * 0.85, b.y - b.size * 0.85);
  const numbered = new Map(); // a number → the lines of its formula
  for (const no of text.filter(l => EQNO.test(l.text.trim()) && l.x0 - edge(l) > span * 0.5)) {
    const own = l => l !== no && sameSide(boxOf(l), boxOf(no)) && !cap(l);
    const beside = text.filter(l => own(l) && l.x1 <= no.x0 + 1 && overlapY(l, no) > no.size * 0.4);
    const before = text.filter(l => own(l) && l.y < no.y && no.y - l.y < lead * 1.5).slice(-1);
    numbered.set(no, beside.length ? beside : before);
  }
  const inFormula = new Set([...numbered].flat(2));

  // The page's own text: full lines, headings, captions, code, and lines of several words stacked
  // at a line's distance (a narrow column in the margin). Words set within a drawing or between a
  // table's rules are part of it.
  const inside = l => inFormula.has(l) || [...art, ...tabled].some(b => meets(boxOf(l), b, -1));
  const sentence = l => wordsIn(l) >= 3 && l.math < 0.3 && l.size > s * 0.6 && !inside(l) && !art.some(b => meets(boxOf(l), b, s * 1.5, s * 1.3)); // (not a drawing's labels)
  const stacked = (l, m) => Math.abs(m.x0 - l.x0) < s * 1.2 && Math.abs(m.y - l.y) > l.size * 0.6 && Math.abs(m.y - l.y) < lead * 1.5;
  const kept = new Set();
  text.forEach((l, i) => {
    const p = text[i - 1], words = /\p{L}{2}/u.test(l.text) && l.math < 0.4;
    if (cap(l)) kept.add(l);
    else if (inside(l)) return;
    else if (full(l) || justified(l) || (l.mono && l.size > s * 0.7) || LEADER.test(l.text) || (words && (l.size > s * 1.12 || (l.bold && l.size >= s * 0.95)))) kept.add(l);
    else if (wordsIn(l) > 3 && l.math < 0.5 && l.size > s * 0.75 && cellsOf(l).length < 3 && !art.some(b => meets(boxOf(l), b, s * 1.5, s * 1.3))) kept.add(l); // a line of words, away from any drawing
    else if (sentence(l) && text.some(m => m !== l && sentence(m) && stacked(l, m))) kept.add(l);
    // A paragraph's last line: one of words, or — flush under a full line, at the text's leading,
    // where a displayed formula never is — whatever ends its sentence (“…, >=, and <=.”).
    else if (p && kept.has(p) && l.y > p.y && Math.abs(l.size - p.size) < s * 0.15 && (words
      ? l.y - p.y < lead * 1.6 && Math.abs(l.x0 - p.x0) < s * 1.5
      : full(p) && l.y - p.y < lead * 1.25 && l.x0 > p.x0 - s && l.x0 < p.x0 + s * 3)) kept.add(l); // (a hanging indent too)
  });
  // A line with words of its own among lines of text, at the text's leading, is text too, however
  // much mathematics it carries (a sentence with a fraction in it); a displayed formula stands
  // apart, a skip above and below.
  const prose0 = new Set(kept);
  for (const l of text) {
    if (kept.has(l) || inFormula.has(l) || wordsIn(l) < 2 || [...art, ...tabled].some(b => meets(boxOf(l), b, -1))) continue;
    if ([...prose0].some(m => !cap(m) && side(boxOf(m)) === side(boxOf(l)) && m.x1 > l.x0 && m.x0 < l.x1
      && Math.abs(m.y - l.y) > l.size * 0.5 && Math.abs(m.y - l.y) < lead * 1.45)) kept.add(l);
  }
  const loose = text.filter(l => !kept.has(l));
  const taken = new Set(); // what a picture has taken in
  const shown = formulas(loose.filter(l => !art.some(b => meets(boxOf(l), b, s * 1.5, s * 1.3))), { s, edge, side }); // (a drawing's labels are its own)
  for (const l of [...inFormula, ...shown]) taken.add(l);

  const seeds = [
    ...art.map(b => ({ b, kind: 'figure' })),
    ...tabled.map(b => ({ b, kind: 'table' })),
    ...grids(loose.filter(l => !taken.has(l)), s, side).map(b => ({ b, kind: 'table' })), // (a formula's parts, spaced out, are no table's cells)
    ...[...numbered].map(([no, ls]) => ({ b: ls.map(boxOf).reduce(join, boxOf(no)), kind: 'formula' })),
    ...shown.map(l => ({ b: boxOf(l), kind: 'formula' })),
  ];

  // Seeds that meet are one picture: a figure before a table before a formula.
  const RANK = { figure: 0, table: 1, formula: 2 };
  const regions = [];
  for (const r of seeds) {
    const hit = regions.find(o => meets(o.b, r.b, 1));
    if (hit) hit.b = hit.seed = join(hit.b, r.b), hit.kind = RANK[r.kind] < RANK[hit.kind] ? r.kind : hit.kind;
    else regions.push({ ...r, seed: r.b });
  }
  // Each takes in what is set against it: a figure, any loose words or marks within a line's
  // reach; a table, the cells level with its rows; a formula, the lines of mathematics, numbers
  // and brackets above and below it.
  // (A mark in a line of text is that line's: a radical in a sentence. Larger rotated type is a
  // stamp in the margin, or a watermark.)
  const parts = [...loose, ...data.marks.filter(m => m.size < s * 1.5 && !text.some(l => kept.has(l) && meets(boxOf(l), m, -1))).map(b => ({ mark: b }))];
  const parted = (a, b) => { // a line of text set between them
    const [t, u] = a[1] < b[1] ? [a, b] : [b, a];
    return text.some(l => kept.has(l) && l.y > t[3] - l.size * 0.25 && l.y - l.size * 0.85 < u[1] && l.x1 > Math.min(a[0], b[0]) && l.x0 < Math.max(a[2], b[2]));
  };
  const reach = (r, p) => {
    const b = p.mark || boxOf(p);
    if (!sameSide(r.b, b)) return false;
    if (r.kind === 'figure') return meets(b, r.b, s * 1.5, s * 1.3);
    if (r.kind === 'table') return p.mark ? meets(b, r.b, 2) : (b[1] + b[3]) / 2 > r.b[1] && (b[1] + b[3]) / 2 < r.b[3] && meets(b, r.b, s * 3, 0);
    if (parted(b, r.b)) return false; // (never across a line of text)
    if (p.mark || EQNO.test(p.text.trim())) return meets(b, r.b, span, lead * 1.1);
    return (p.math >= 0.15 || p.text.replace(/\s/g, '').length <= 3) && meets(b, r.b, span, s * 0.5);
  };
  // Figures side by side and level with each other are panels of one figure when they are close
  // (or, lined up along their tops, a column's gutter apart), unless each has a caption of its
  // own (beneath it, or within the lower half of what it draws); or when one caption beneath
  // spans them both. Figures one above another, a few lines apart with nothing set between
  // them, are rows of one figure.
  const below = r => text.filter(l => cap(l) && l.y > (r.b[1] + r.b[3]) / 2 && l.y - l.size - r.b[3] < lead * 2.5);
  const captioned = r => below(r).some(l => (l.x0 + l.x1) / 2 > r.b[0] && (l.x0 + l.x1) / 2 < r.b[2]);
  const panels = (a, b) => {
    if (a.kind !== 'figure' || b.kind !== 'figure' || Math.min(a.b[3], b.b[3]) - Math.max(a.b[1], b.b[1]) < Math.min(a.b[3] - a.b[1], b.b[3] - b.b[1]) * 0.5) return false;
    const [l, r] = a.b[0] < b.b[0] ? [a, b] : [b, a];
    const shared = below({ b: join(a.b, b.b) }).some(c => c.x0 < (l.b[0] + l.b[2]) / 2 && c.x1 > (r.b[0] + r.b[2]) / 2);
    return shared || (r.b[0] - l.b[2] < s * (Math.abs(a.b[1] - b.b[1]) < s ? 6 : 2.5) && !(captioned(a) && captioned(b)));
  };
  const rows = (a, b) => {
    if (a.kind !== 'figure' || b.kind !== 'figure' || !sameSide(a.b, b.b)) return false;
    const [t, u] = a.b[1] < b.b[1] ? [a, b] : [b, a];
    const x = [Math.max(t.b[0], u.b[0]), Math.min(t.b[2], u.b[2])];
    return x[1] - x[0] > Math.min(t.b[2] - t.b[0], u.b[2] - u.b[0]) * 0.5 && u.b[1] - t.b[3] < s * 3
      && !text.some(l => kept.has(l) && l.x1 > x[0] && l.x0 < x[1] && l.y > t.b[3] && l.y - l.size * 0.85 < u.b[1]);
  };
  for (let grew = true; grew;) {
    grew = false;
    for (const r of regions) for (const p of parts) {
      if (taken.has(p) || !reach(r, p)) continue;
      r.b = join(r.b, p.mark || boxOf(p));
      taken.add(p);
      grew = true;
    }
    for (let i = 0; i < regions.length; i++) for (let j = regions.length - 1; j > i; j--) {
      const [a, b] = [regions[i], regions[j]];
      const lines = a.kind === 'formula' && b.kind === 'formula' && sameSide(a.b, b.b) && meets(a.b, b.b, s * 3, s) && !parted(a.b, b.b); // lines of one display
      if (!meets(a.b, b.b, 1) && !lines && !panels(a, b) && !rows(a, b)) continue;
      regions[i].b = join(regions[i].b, regions[j].b);
      regions[i].seed = join(regions[i].seed, regions[j].seed);
      if (RANK[regions[j].kind] < RANK[regions[i].kind]) regions[i].kind = regions[j].kind;
      regions.splice(j, 1);
      grew = true;
    }
  }

  // A formula level with a line of text, or beside words of its own, is part of a sentence, not
  // displayed: it stays text.
  const level = (l, b) => sameSide(boxOf(l), b) && Math.min(l.y + l.size * 0.25, b[3]) - Math.max(l.y - l.size * 0.85, b[1]) > l.size * 0.45;
  const beside = (l, b) => !taken.has(l) && /\p{L}{3}/u.test(l.text) && l.math < 0.4 && (l.x1 < b[0] + 2 || l.x0 > b[2] - 2);
  for (let i = regions.length - 1; i >= 0; i--) { // (judged by its own lines, not the tall brackets it took in)
    const b = regions[i].seed;
    if (regions[i].kind === 'formula' && text.some(l => level(l, b) && (kept.has(l) || beside(l, b)))) regions.splice(i, 1);
  }

  // The page's text never ends up inside a picture: one that has grown over a line is cut back,
  // keeping what it grew from.
  const own = l => kept.has(l); // (captions among them)
  const holds = (c, core) => c[0] <= core[0] + 1 && c[1] <= core[1] + 1 && c[2] >= core[2] - 1 && c[3] >= core[3] - 1;
  for (const r of regions) for (const l of text.filter(own)) {
    while (meets(boxOf(l), r.b, -1)) {
      const lb = boxOf(l), b = r.b;
      const cuts = [[lb[2] + 1, b[1], b[2], b[3]], [b[0], b[1], lb[0] - 1, b[3]], [b[0], lb[3] + 1, b[2], b[3]], [b[0], b[1], b[2], lb[1] - 1]]
        .filter(c => c[2] - c[0] > s && c[3] - c[1] > s * 0.8).sort((x, y) => area(y) - area(x));
      const cut = cuts.find(c => holds(c, r.seed)) || cuts[0];
      if (!cut) break;
      r.b = cut;
    }
  }
  // A figure or table keeps its caption: the paragraph beginning "Figure 2:" or "Table 1."
  // just below or above it.
  const paragraphs = text.filter(cap).map(first => {
    const lines = [first];
    for (let i = text.indexOf(first) + 1; i < text.length; i++) {
      const l = text[i], p = lines.at(-1);
      const across = l.y < p.y && Math.abs(l.y - first.y) < s * 0.5 && l.x0 > p.x1 - 1; // on at the top of the next column, level with its start
      if (cap(l) || Math.abs(l.size - p.size) > s * 0.15 || regions.some(r => meets(boxOf(l), r.b, -1))
        || (!across && (l.y <= p.y || l.y - p.y > lead * 1.6 || l.x1 < first.x0 || l.x0 > p.x1))) break;
      lines.push(l);
    }
    return lines;
  });
  // The nearest wins, but a table's caption names a table and a figure's a figure.
  const captions = new Set();
  const gap = (r, p) => p[0].y - p[0].size * 0.85 >= r.b[3] - 2 ? p[0].y - p[0].size * 0.85 - r.b[3] : r.b[1] - (p.at(-1).y + p.at(-1).size * 0.25);
  const pairs = regions.filter(r => r.kind !== 'formula').flatMap(r => paragraphs.map(p => ({ r, p, d: gap(r, p) })))
    .filter(({ r, p, d }) => p[0].x1 > r.b[0] && p[0].x0 < r.b[2] && d > -2 && d < lead * 2.5)
    .map(x => ({ ...x, d: x.d + (/^\s*tab/i.test(x.p[0].text) !== (x.r.kind === 'table') ? lead * 3 : 0) }))
    .sort((a, b) => a.d - b.d);
  for (const { r, p } of pairs) {
    if (r.caption || captions.has(p[0])) continue;
    r.caption = p.filter(l => !meets(boxOf(l), r.b, -1));
    r.above = p[0].y < r.b[1];
    r.caption.forEach(l => captions.add(l));
  }

  const lines = text.filter(l => !captions.has(l) && (own(l) || !regions.some(r => meets(boxOf(l), r.b, -1))));
  measure([...lines, ...captions], stats.body);
  // A displayed formula's number, at the margin, is set beside it as text: only the formula is drawn.
  for (const r of regions.filter(r => r.kind === 'formula')) {
    const inside = text.filter(l => meets(boxOf(l), r.b, -1)), nos = inside.filter(l => EQNO.test(l.text.trim()));
    if (nos.length === 1 && nos[0].x0 > (r.b[0] + r.b[2]) / 2 && inside.every(l => l === nos[0] || l.x1 < nos[0].x0 - s * 0.5)) r.number = nos[0];
  }

  // Each picture is cut from as much of the page as lies between it and the text around it.
  const room = r => {
    const pad = s * 0.6;
    let [x0, y0, x1, y1] = [r.b[0] - pad, r.b[1] - pad, r.number ? r.number.x0 - s * 0.3 : r.b[2] + pad, r.b[3] + pad];
    for (const l of [...lines, ...captions]) {
      const lb = boxOf(l);
      if (lb[2] <= x0 || lb[0] >= x1) continue;
      if (lb[3] <= r.b[1] + 1) y0 = Math.max(y0, lb[3] + 1);
      else if (lb[1] >= r.b[3] - 1) y1 = Math.min(y1, lb[1] - 1);
    }
    return [Math.max(0, x0), Math.max(0, y0), Math.min(data.width, x1), Math.min(data.height, y1)];
  };
  const pictures = regions.length ? (await cut(drawn || await draw(page), regions.map(r => [...room(r), r.kind !== 'figure']), s)).map((pic, i) => ({ ...pic, r: regions[i] })) : [];
  if (drawn) drawn.canvas.width = drawn.canvas.height = 0; // let go of the page's pixels at once

  // A line is in the nearest column at or before it; an outline place, in the nearest column.
  const columnOf = edge;
  const nearest = x => cols.reduce((a, c) => Math.abs(c - x) < Math.abs(a - x) ? c : a, cols[0]);
  // A picture goes where the text below it begins, and a formula after the line above it. An
  // outline place marks where its entry's text begins, so it goes before the first line at or
  // below it in its column; when nothing but notes follow it there, they belong to the text
  // before it. Pictures and places go in the order they sit down the page. (Where these lines
  // are is what counts, not the order the PDF happened to draw them in.)
  const top = test => lines.reduce((a, l) => test(l) && (!a || l.y < a.y) ? l : a, null);
  const last = test => lines.reduce((a, l) => test(l) && (!a || l.y > a.y) ? l : a, null);
  const before = test => { const l = top(test); return l ? lines.indexOf(l) : lines.length; };
  const placeAt = ({ x, y }) => {
    if (y == null) return 0;
    const own = l => x == null || columnOf(l) === nearest(x);
    const next = top(l => own(l) && l.y > y - 2);
    return next && !small(next.size, stats) ? lines.indexOf(next) : lines.indexOf(last(own)) + 1;
  };
  const html = lineHTML;
  const above = r => lines.indexOf(last(l => l.y < r.b[1] && l.x1 > r.b[0] && l.x0 < r.b[2] && side(boxOf(l)) === side(r.b)));
  const floats = [
    ...pictures.filter(p => p.src).map(({ r, ...pic }) => ({
      k: r.kind === 'formula' && above(r) >= 0 ? above(r) + 1 : before(l => l.y - l.size > r.b[3] - 2 && l.x1 > r.b[0] && l.x0 < r.b[2]), side: side(r.b) % 2, y: r.b[1],
      item: { picture: { ...pic, kind: r.kind, above: r.above, number: r.number?.text.trim(), caption: (r.caption || []).map(l => ({ line: l, html: html(l) })) } },
    })),
    ...[...places].filter(([, p]) => p.page === n).map(([id, p]) => ({ k: placeAt(p), side: p.x == null ? 0 : side([p.x, 0, p.x, 0]) % 2, y: p.y ?? -Infinity, item: { anchor: id } })),
  ].sort((a, b) => a.k - b.k || a.side - b.side || a.y - b.y); // (those with no text after them: by column, then down the page)
  const items = [];
  let f = 0;
  lines.forEach((l, k) => {
    while (floats[f]?.k === k) items.push(floats[f++].item);
    items.push({ line: l, html: html(l) });
  });
  return items.concat(floats.slice(f).map(x => x.item));
}

// A line's cells: its words, parted wherever a gap of an em or more opens between them.
function cellsOf(l) {
  if (l.cells) return l.cells;
  const cells = l.cells = [];
  for (const r of l.runs) {
    if (!r.str.trim()) continue;
    const c = cells.at(-1);
    if (c && r.x - c.x1 < l.size) c.x1 = Math.max(c.x1, r.x + r.w), c.text += r.str;
    else cells.push({ x0: r.x, x1: r.x + r.w, text: r.str });
  }
  return cells;
}

// A line whose gaps take up a quarter of it is cells set apart (a table's row, labels side by
// side), not words: however loosely a line of text is justified, its words fill most of it.
const sparse = l => cellsOf(l).reduce((gap, c) => gap - (c.x1 - c.x0), l.x1 - l.x0) > (l.x1 - l.x0) * 0.25;

// Tables set without rules: rows of three or more cells, the cells of each row starting where
// the row above's do, a row's height apart, and many of them figures. Prose never sets three such
// rows running (and a grid of words, like a paper's authors, is better left as text).
function grids(lines, s, side) {
  const rows = [];
  for (const l of lines) {
    const r = rows.find(r => Math.abs(r.y - l.y) < s * 0.35 && side(boxOf(l)) === side(r.b));
    if (r) r.cells.push(...cellsOf(l)), r.b = join(r.b, boxOf(l));
    else rows.push({ y: l.y, cells: [...cellsOf(l)], b: boxOf(l) });
  }
  const tables = [];
  let run = [];
  const flush = () => {
    const cells = run.flatMap(r => r.cells);
    if (run.length > 2 && cells.filter(c => /\d/.test(c.text)).length > cells.length * 0.25) tables.push(run.reduce((b, r) => join(b, r.b), run[0].b));
    run = [];
  };
  for (const r of rows.filter(r => r.cells.length > 2).sort((a, b) => a.y - b.y)) {
    const p = run.at(-1), starts = r.cells.map(c => c.x0);
    const lined = p && r.y - p.y < s * 2.6 && p.cells.filter(c => starts.some(x => Math.abs(x - c.x0) < s * 1.5)).length > 1;
    if (!lined) flush();
    run.push(r);
  }
  flush();
  return tables;
}

// Displayed formulas: a line of mathematics set apart from the text (centered or indented, not
// starting at the column's edge), and lines stacked too tightly for text (a fraction over its
// bar, a sum over its limits). A line is mathematics when most of it is, or when it states a
// relation in a math font (MultiHead(Q, K, V) = Concat(…)W).
function formulas(loose, { s, edge, side }) {
  return loose.filter((l, i) => {
    const apart = l.x0 - edge(l) > s * 1.5 && l.text.replace(/\s/g, '').length > 1;
    const stack = l.math >= 0.3 && [loose[i - 1], loose[i + 1]].some(m => m && side(boxOf(m)) === side(boxOf(l))
      && Math.abs(m.y - l.y) > s * 0.4 && Math.abs(m.y - l.y) < s * 1.1 && Math.min(m.x1, l.x1) - Math.max(m.x0, l.x0) > Math.min(m.x1 - m.x0, l.x1 - l.x0) * 0.4);
    return stack || (apart && !BULLET.test(l.text) && (l.math >= 0.5 || (l.math >= 0.15 && RELATION.test(l.text))));
  });
}

// How long a line of prose runs on these pages: most lines of many words at the text's size.
function measureOf(pages, body) {
  const widths = pages.flatMap(p => p.lines).filter(l => Math.abs(l.size - body) <= body * 0.1 && l.text.length > 30)
    .map(l => l.x1 - l.x0).sort((a, b) => a - b);
  return widths.length > 2 ? widths[Math.floor(widths.length * 0.75)] : 0;
}

// Where each line sits in its column: indent, short (ends early), centered. A column's
// edges are where most of its lines start and end.
function measure(lines, body) {
  const lefts = new Map();
  for (const l of lines) lefts.set(Math.round(l.x0), (lefts.get(Math.round(l.x0)) || 0) + 1);
  const edges = [...lefts].filter(([, n]) => n >= 3).map(([x]) => x).sort((a, b) => a - b);
  const ends = new Map();
  for (const l of lines) {
    l.edge = edges.filter(e => e <= l.x0 + 2).at(-1) ?? l.x0;
    ends.set(l.edge, [...(ends.get(l.edge) || []), l.x1]);
  }
  for (const l of lines) {
    const x1s = ends.get(l.edge).sort((a, b) => a - b);
    const right = x1s[Math.floor((x1s.length - 1) * 0.8)], size = Math.max(l.size, body);
    l.indent = l.x0 - l.edge;
    l.right = right;
    l.short = l.x1 < right - size * 2;
    l.center = l.indent > size * 2 && Math.abs((l.x0 + l.x1) / 2 - (l.edge + right) / 2) < size;
  }
}

// A font's PostScript name says its weight and slant (NimbusRomNo9L-Medi, CMBX10, Georgia-Italic),
// and whether it is a math font (CMMI10, STIXTwoMath); its descriptor says whether it is
// fixed-pitch, which PDF.js reports as a monospace fallback.
const styleOf = ({ name = '', fallbackName }) => ({
  name,
  bold: /bold|black|heavy|demi|-medi|cmbx/i.test(name),
  italic: /ital|oblique|slant|cmti|cmsl|cmmi/i.test(name),
  mono: fallbackName === 'monospace',
  math: MATH_FONT.test(name),
  tall: EXTENSION.test(name), // big operators and delimiters, taller than their line
});

// TeX's math fonts keep their symbols where Latin letters would be, and a PDF often doesn't say
// which they are: in CMEX, P is a sum, R an integral and the first 48 codes are brackets in
// three sizes; capitals in CMSY are calligraphic, in MSBM double-struck, in EUFM fraktur. Each
// becomes the character it is. (Where a PDF does say, its brackets are already brackets: those
// codes that could be either are left alone.)
const CMEX = { P: '∑', X: '∑', Q: '∏', Y: '∏', R: '∫', Z: '∫', H: '∮', I: '∮', S: '⋃', '[': '⋃', T: '⋂', '\\': '⋂', U: '⊎', ']': '⊎', V: '⋀', '^': '⋀', W: '⋁', _: '⋁',
  J: '⊙', K: '⊙', L: '⊕', M: '⊕', N: '⊗', O: '⊗', '`': '∐', a: '∐', F: '⊔', G: '⊔', D: '⟨', E: '⟩', h: '[', i: ']', j: '⌊', k: '⌋', l: '⌈', m: '⌉', n: '{', o: '}', p: '√', q: '√', r: '√', s: '√', t: '√' };
const DELIMS = [...'()[]⌊⌋⌈⌉{}⟨⟩|‖/\\()()[]⌊⌋⌈⌉{}⟨⟩/\\()[]⌊⌋⌈⌉{}⟨⟩/\\/\\']; // CMEX's first 48: its delimiters, in three sizes
const ALPHABETS = [
  [/cmsy|lmsy|mtsy|txsy|pxsy|rsfs/i, 0x1d49c, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ' }], // script
  [/msbm|bbold|dsrom|bbm/i, 0x1d538, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }], // double-struck
  [/eufm|eufb/i, 0x1d504, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }], // fraktur
];
const EXTENSION = /cmex|lmex|mtex|txex|pxex|esint|mathex/i;
function unicode(str, font) {
  if (EXTENSION.test(font)) return str.replace(/[\0-\x1f!"#$%&'*+,\-.]|[D-Z^_`ah-t]/g, c => CMEX[c] || DELIMS[c.charCodeAt(0)]);
  const [, base, holes] = ALPHABETS.find(([re]) => re.test(font)) || [];
  if (!base) return str;
  return str.replace(/[A-Z]|[0-9]/g, c => holes[c] || String.fromCodePoint(/\d/.test(c) && base === 0x1d538 ? 0x1d7d8 + +c : /\d/.test(c) ? c.codePointAt(0) : base + c.codePointAt(0) - 65));
}

function lineHTML(l) {
  let html = '', prev = null;
  for (const r of l.runs) {
    const f = r.style;
    const tags = [r.size < l.size * 0.85 && r.y < l.y - l.size * 0.15 && 'sup', r.size < l.size * 0.85 && r.y > l.y + l.size * 0.1 && 'sub',
      f.bold && 'b', f.italic && 'i', f.mono && !l.mono && 'code'].filter(Boolean); // a script's parts stay one script: ⁽ᵈ⁾, not ⁽ ᵈ ⁾
    const gap = prev && r.x - (prev.x + prev.w) > l.size * 0.15 && !/\s$/.test(prev.str) && !/^\s/.test(r.str)
      ? ' '.repeat(l.mono ? Math.max(1, Math.round((r.x - prev.x - prev.w) / (l.size * 0.55))) : 1) : '';
    html += gap + tags.reduceRight((inner, t) => `<${t}>${inner}</${t}>`, escape(r.str));
    prev = r;
  }
  return html.replace(/<\/(b|i|code|sup|sub)><\1>/g, '');
}

// A page drawn large, on nothing (so the reader's paper shows through where the page has nothing).
async function draw(page) {
  const { width, height } = page.getViewport({ scale: 1 });
  const k = Math.min(3, 2000 / width, 3000 / height);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [Math.round(width * k), Math.round(height * k)];
  const context = canvas.getContext('2d', { willReadFrequently: true }); // PDF.js's own would be opaque
  await page.render({ canvasContext: context, viewport: page.getViewport({ scale: k }), intent: 'print', annotationMode: AnnotationMode.DISABLE, background: 'rgba(0,0,0,0)' }).promise;
  return { canvas, context, k };
}

// Whether anything is drawn within a box of the page (a line of text that shows leaves ink).
function inked({ context, k }, [x0, y0, x1, y1]) {
  const [w, h] = [Math.max(1, Math.round((x1 - x0) * k)), Math.max(1, Math.round((y1 - y0) * k))];
  const px = context.getImageData(Math.round(x0 * k), Math.round(y0 * k), w, h).data;
  let ink = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 64) ink++;
  return ink > w * h * 0.02;
}

// Pictures are cut from the drawn page, each trimmed to its ink. Type cut this way (a formula, a
// table) is ink only, in black and greys, which a dark theme may turn light. A picture's width
// is told in the text's ems, so it is shown at the size it had beside the text on the page.
async function cut({ canvas, context, k }, boxes, body) {
  const pictures = await Promise.all(boxes.map(async ([bx0, by0, bx1, by1, type]) => {
    const [sx, sy] = [Math.max(0, Math.floor(bx0 * k)), Math.max(0, Math.floor(by0 * k))];
    const [w, h] = [Math.min(canvas.width, Math.ceil(bx1 * k)) - sx, Math.min(canvas.height, Math.ceil(by1 * k)) - sy];
    if (w < 1 || h < 1) return {};
    const px = context.getImageData(sx, sy, w, h).data;
    let [x0, y0, x1, y1] = [w, h, -1, -1], gray = true;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 32 || (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240)) continue;
      const x = (i >> 2) % w, y = (i >> 2) / w | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (gray && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 48) gray = false;
    }
    if (x1 < x0) return {};
    const m = Math.round(k * 1.5);
    [x0, y0, x1, y1] = [Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(w, x1 + m + 1), Math.min(h, y1 + m + 1)];
    const out = new OffscreenCanvas(x1 - x0, y1 - y0);
    out.getContext('2d').drawImage(canvas, sx + x0, sy + y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
    const ink = type && gray;
    const blob = await out.convertToBlob(ink ? { type: 'image/png' } : { type: 'image/webp', quality: 0.9 });
    return { src: URL.createObjectURL(blob), em: (x1 - x0) / k / body, ink };
  }));
  canvas.width = canvas.height = 0; // let go of the page's pixels
  return pictures;
}

// Lines become paragraphs. A paragraph continues while lines follow at the usual leading,
// with the same type, not after a short line that ends a sentence, and not into an indent.
// A displayed formula stands between the lines around it. Figures and tables, with their
// captions, and notes in smaller type below the text, float to the end of the paragraph they
// interrupt, as in a printed book.
class Flow {
  constructor(stats) { this.stats = stats; this.out = []; this.para = null; this.floats = []; this.notes = null; this.ids = []; }
  add(item) {
    if (item.anchor) return this.ids.push(item.anchor); // an outline place goes with the line after it
    if (item.picture) return this.picture(item.picture);
    this.line(item.line, this.ids.splice(0).map(id => `<a id="${id}"></a>`).join('') + item.html);
  }
  line(l, html) {
    const p = this.para, a = p?.last;
    if (p && !p.pre && small(l.size, this.stats) && !small(a.size, this.stats) && l.page === a.page && l.y > a.y) return (this.notes ||= new Flow(this.stats)).line(l, html);
    if (l.mono) return this.code(l, html);
    if (p && !p.pre && this.continues(a, l)) {
      const word = `${a.text.trimEnd().match(/(\p{L}+)-$/u)?.[1]}-${l.text.trimStart().match(/^\p{Ll}+/u)?.[0]}`.toLowerCase();
      const broken = /-$/.test(a.text.trimEnd()) && /^\p{Ll}+(?!-)\b/u.test(l.text.trimStart()) && !this.stats.compounds.has(word);
      p.html = broken ? p.html.replace(/-\s*((?:<\/\w+>)*)\s*$/, '$1') + html : `${p.html}${/-$/.test(a.text.trimEnd()) ? '' : ' '}${html}`;
      p.last = l;
      return;
    }
    this.close();
    this.para = { html, first: l, last: l };
  }
  // Code keeps its lines, and its indentation relative to its leftmost line.
  code(l, html) {
    if (!this.para?.pre) this.close(), this.para = { pre: [] };
    this.para.pre.push([l.x0, l.size * 0.55, html]);
  }
  continues(a, b) {
    if (Math.abs(a.size - b.size) > a.size * 0.1 || a.center !== b.center) return false;
    const below = b.page === a.page && b.y > a.y && b.x0 < a.x1 && b.x1 > a.x0; // further down the same column
    const leading = this.stats.leading * a.size / this.stats.body;
    // A line all in bold is a heading, which a line of text follows after a skip. Only a heading
    // too long for one line goes on, in bold at the usual leading, when the next line's first word
    // couldn't have fit on its first (and under its words, not its number).
    if (a.bold && !/[-.,;:]$/.test(a.text.trim())) {
      const word = (b.x1 - b.x0) * b.text.trim().split(/\s/)[0].length / b.text.trim().length;
      return b.bold && below && b.y - a.y < leading * 1.2 && (a.center || a.x1 + word > a.right - a.size);
    }
    const ends = /[.!?:;"”’)\]]$/.test(a.text.trim());
    if (below) return b.y - a.y < leading * 1.45 && !(ends && a.short) && !(b.indent > b.size * 0.6 && a.indent < a.size * 0.6 && !a.center);
    return !(ends && (a.short || b.indent > b.size * 0.6)); // across a column or page
  }
  close() {
    const p = this.para;
    const left = p?.pre && Math.min(...p.pre.map(([x]) => x));
    if (p?.pre) this.out.push(`<pre>${p.pre.map(([x, ch, html]) => ' '.repeat(Math.round((x - left) / ch)) + html).join('\n')}</pre>`);
    else if (p) this.out.push(`<p style="font-size:${p.first.size}px${p.first.center ? ';text-align:center' : ''}">${p.html}</p>`);
    this.out.push(...this.floats.splice(0));
    if (this.notes) this.out.push(this.notes.end()), this.notes = null;
    this.para = null;
  }
  picture({ src, em, ink, kind, caption, above, number }) {
    const img = `<p><img src="${src}" data-em="${em.toFixed(2)}" class="${ink ? 'ink ' : ''}${kind}">${number ? ` ${escape(number)}` : ''}</p>`;
    if (kind === 'formula') return this.close(), this.out.push(img);
    const words = caption.length ? `<figcaption>${caption.reduce((f, c) => (f.add(c), f), new Flow(this.stats)).end()}</figcaption>` : '';
    this.floats.push(`<figure>${above ? words + img : img + words}</figure>`);
    if (!this.para) this.close();
  }
  end() { this.close(); return this.out.concat(this.ids.map(id => `<a id="${id}"></a>`)).join('\n'); }
}
