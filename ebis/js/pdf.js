// PDFs, reflowed. PDF.js gives positioned text and drawing operations. Lines are rebuilt
// into paragraphs from their spacing and indents, running heads and page numbers (lines
// that repeat at the same place) are dropped, and figures (pictures or drawings) are cut
// from the rendered page. The result is plain HTML; convert.js decides what is a heading.

import { AnnotationMode, getDocument, GlobalWorkerOptions, OPS, Util } from '../vendor/pdfjs/pdf.min.mjs';

const BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
const PAINT = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mode = values => {
  const n = new Map();
  for (const [v, w = 1] of values) n.set(v, (n.get(v) || 0) + w);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export async function pdfSource(file) {
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `${BASE}cmaps/`, standardFontDataUrl: `${BASE}standard_fonts/`,
    wasmUrl: `${BASE}wasm/`, iccUrl: `${BASE}iccs/`, isEvalSupported: false, fontExtraProperties: true,
  }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) pages.push(await readPage(await pdf.getPage(n)));

  // What the book is set in, and which lines are furniture rather than text.
  const body = mode(pages.flatMap(p => p.lines.map(l => [l.size, l.text.length]))) || 10;
  const leading = mode(pages.flatMap(p => p.lines.slice(1).map((l, i) => [Math.round(l.y - p.lines[i].y), +(l.size === body)])).filter(([d]) => d > 0)) || body * 1.2;
  const key = l => l.text.replace(/\d+/g, '#').trim();
  const banded = pages.flatMap(p => p.lines.filter(l => l.y < p.height * 0.09 || l.y > p.height * 0.91));
  const seen = new Map();
  for (const l of banded) seen.set(key(l), (seen.get(key(l)) || 0) + 1);
  const furniture = new Set(banded.filter(l => seen.get(key(l)) >= 3 || /^(page )?[\divxlc]+$/i.test(l.text.trim())));

  // Chapters follow the PDF's own outline when it has one.
  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
  const pageOf = async dest => {
    const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    return !d ? null : typeof d[0] === 'number' ? d[0] : pdf.getPageIndex(d[0]).catch(() => null);
  };
  const toc = [];
  const walk = async (items, into) => {
    for (const item of items || []) {
      const page = await pageOf(item.dest);
      const entry = { label: item.title, href: page == null ? null : `p${page}`, subitems: [] };
      into.push(entry);
      await walk(item.items, entry.subitems);
    }
  };
  await walk(await pdf.getOutline(), toc);
  const starts = [...new Set([0, ...toc.map(t => t.href && +t.href.slice(1)).filter(p => p > 0)])].sort((a, b) => a - b);
  const ranges = starts.map((s, i) => [s, starts[i + 1] ?? pages.length]);

  // Words this document hyphenates itself, so a line break at "single-subject" keeps its hyphen.
  const compounds = new Set(pages.flatMap(p => p.lines.flatMap(l => l.text.toLowerCase().match(/\p{L}+-\p{L}+/gu) || [])));
  const stats = { body, leading, compounds };
  const first = pages[0]?.lines || [];
  const biggest = Math.max(...first.map(l => l.size));
  return { // without a title in its metadata, a PDF's title is the largest type on its first page
    meta: { title: info?.Title?.trim() || first.filter(l => l.size === biggest).map(l => l.text.trim()).join(' '), author: info?.Author?.trim() || '' },
    cover: renderPage(await pdf.getPage(1), 420).then(c => c.convertToBlob({ type: 'image/webp', quality: 0.86 })),
    toc,
    sections: ranges.map(([from, to]) => ({
      async load() {
        const flow = new Flow(stats);
        for (let n = from; n < to; n++) {
          flow.anchor(`p${n}`);
          await layoutPage(await pdf.getPage(n + 1), pages[n], furniture, flow);
        }
        return { html: `<!doctype html><html><body>${flow.end()}</body></html>` };
      },
    })),
    resolve(href) {
      const n = +href.replace(/^#?p/, '');
      const i = ranges.findIndex(([from, to]) => n >= from && n < to);
      return i < 0 ? null : `s${i}-p${n}`;
    },
  };
}

// The text of a page as lines, in the order the PDF draws them (which is reading order).
async function readPage(page) {
  const vp = page.getViewport({ scale: 1 });
  const { items } = await page.getTextContent();
  const lines = [];
  let line = null;
  for (const it of items) {
    if (!it.str?.trim() && !it.str?.includes(' ')) continue;
    const [a, b, c, d, x, y] = Util.transform(vp.transform, it.transform);
    if (Math.abs(b) > Math.abs(a) * 0.2) continue; // rotated: margin notes, watermarks
    const run = { str: it.str.replace(/[ﬀ-ﬆ]/g, ch => ch.normalize('NFKC')), x, y, w: it.width, size: Math.round(Math.hypot(c, d) * 2) / 2, font: it.fontName };
    const same = line && Math.abs(run.y - line.y) < line.size * 0.6 && run.x > line.x1 - line.size && run.x - line.x1 < line.size * 3;
    if (!same) lines.push(line = { runs: [], x0: run.x, x1: run.x, y: run.y, size: run.size, page: page.pageNumber - 1 });
    line.runs.push(run);
    line.x1 = Math.max(line.x1, run.x + run.w);
  }
  for (const l of lines) {
    const main = l.runs.reduce((m, r) => r.str.length > m.str.length ? r : m);
    Object.assign(l, { size: main.size, y: main.y, text: l.runs.map(r => r.str).join('') });
  }
  return { width: vp.width, height: vp.height, lines: lines.filter(l => l.text.trim()) };
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

// Pictures, drawings, and text that is set like a picture rather than in lines of prose.
async function drawings(page, data) {
  const { fnArray, argsArray } = await page.getOperatorList();
  let ctm = page.getViewport({ scale: 1 }).transform;
  const stack = [], boxes = [];
  const box = (rect, m) => { const out = [Infinity, Infinity, -Infinity, -Infinity]; Util.axialAlignedBoundingBox(rect, m, out); return out; };
  fnArray.forEach((fn, i) => {
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, argsArray[i]);
    else if (PAINT.has(fn)) boxes.push(box([0, 0, 1, 1], ctm));
    else if (fn === OPS.constructPath && argsArray[i][2] && argsArray[i][0] !== OPS.endPath) {
      const b = box(argsArray[i][2], ctm); // a drawn shape; one as large as the page is just its background
      if (!(b[2] - b[0] > data.width * 0.85 && b[3] - b[1] > data.height * 0.85)) boxes.push(b);
    }
  });
  return boxes.filter(([x0, y0, x1, y1]) => x1 - x0 > 3 && y1 - y0 > 3);
}

// Prose moves down its column a line at a time. Text that sits on the same baseline as
// its neighbour, or steps back up (table cells, fractions, labels), belongs to a picture.
function loose(lines, width) {
  const marked = new Set();
  lines.forEach((l, i) => {
    const p = lines[i - 1];
    if (p && l.y - p.y < Math.min(l.size, p.size) * 0.7 && Math.abs(l.x0 - p.x0) < width * 0.3) marked.add(p).add(l);
  });
  return [...marked].map(l => [l.x0, l.y - l.size * 0.85, l.x1, l.y + l.size * 0.25]);
}

function merge(boxes, gap = 8) {
  let regions = boxes.map(b => [...b]);
  for (let merged = true; merged;) {
    merged = false;
    regions = regions.reduce((out, r) => {
      const hit = out.find(o => r[0] < o[2] + gap && r[2] > o[0] - gap && r[1] < o[3] + gap && r[3] > o[1] - gap);
      if (hit) hit.splice(0, 4, Math.min(hit[0], r[0]), Math.min(hit[1], r[1]), Math.max(hit[2], r[2]), Math.max(hit[3], r[3])), merged = true;
      else out.push(r);
      return out;
    }, []);
  }
  return regions;
}

async function layoutPage(page, data, furniture, flow) {
  const text = data.lines.filter(l => !furniture.has(l));
  const figures = merge([...await drawings(page, data), ...loose(text, data.width)])
    .filter(([x0, y0, x1, y1]) => x1 - x0 > 40 && y1 - y0 > 20 && (x1 - x0) * (y1 - y0) > data.width * data.height * 0.008);
  const fonts = id => styleOf(page.commonObjs.has(id) ? page.commonObjs.get(id) : {});
  const inside = (l, [x0, y0, x1, y1]) => { const cx = (l.x0 + l.x1) / 2; return cx > x0 - 4 && cx < x1 + 4 && l.y > y0 - 4 && l.y - l.size * 0.7 < y1 + 4; };
  for (const f of figures) for (const l of text.filter(l => inside(l, f))) { // a figure keeps all of its labels
    f.splice(0, 4, Math.min(f[0], l.x0), Math.min(f[1], l.y - l.size * 0.85), Math.max(f[2], l.x1), Math.max(f[3], l.y + l.size * 0.25));
  }
  const lines = text.filter(l => !figures.some(f => inside(l, f)));
  measure(lines, flow.stats.body);

  const images = figures.length ? await crop(page, figures) : [];
  const placed = new Set();
  for (const l of lines) {
    for (const [i, f] of figures.entries()) { // a figure goes where the text below it begins
      if (!placed.has(i) && l.y - l.size > f[3] - 2 && l.x1 > f[0] && l.x0 < f[2]) placed.add(i), flow.figure(images[i]);
    }
    flow.line(l, lineHTML(l, fonts));
  }
  figures.forEach((f, i) => placed.has(i) || flow.figure(images[i]));
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
    l.short = l.x1 < right - size * 2;
    l.center = l.indent > size * 2 && Math.abs((l.x0 + l.x1) / 2 - (l.edge + right) / 2) < size;
  }
}

// A font's PostScript name says its weight and slant (NimbusRomNo9L-Medi, CMBX10, Georgia-Italic);
// its descriptor says whether it is fixed-pitch, which PDF.js reports as a monospace fallback.
const styleOf = ({ name = '', fallbackName }) => ({
  bold: /bold|black|heavy|demi|-medi|cmbx/i.test(name),
  italic: /ital|oblique|slant|cmti|cmsl|cmmi/i.test(name),
  mono: fallbackName === 'monospace',
});

function lineHTML(l, fonts) {
  let html = '', prev = null;
  l.mono = l.runs.every(r => fonts(r.font).mono || !r.str.trim());
  for (const r of l.runs) {
    const f = fonts(r.font);
    const tags = [f.bold && 'b', f.italic && 'i', f.mono && !l.mono && 'code',
      r.size < l.size * 0.85 && r.y < l.y - l.size * 0.15 && 'sup', r.size < l.size * 0.85 && r.y > l.y + l.size * 0.1 && 'sub'].filter(Boolean);
    const gap = prev && r.x - (prev.x + prev.w) > l.size * 0.15 && !/\s$/.test(prev.str) && !/^\s/.test(r.str)
      ? ' '.repeat(l.mono ? Math.max(1, Math.round((r.x - prev.x - prev.w) / (l.size * 0.55))) : 1) : '';
    html += gap + tags.reduceRight((inner, t) => `<${t}>${inner}</${t}>`, escape(r.str));
    prev = r;
  }
  return html.replace(/<\/(b|i|code|sup|sub)><\1>/g, '');
}

async function crop(page, regions) {
  const width = page.getViewport({ scale: 1 }).width;
  const k = Math.min(2.5, 1800 / width);
  const canvas = await renderPage(page, width * k);
  return Promise.all(regions.map(async ([x0, y0, x1, y1]) => {
    const [sx, sy] = [Math.max(0, (x0 - 3) * k), Math.max(0, (y0 - 3) * k)];
    const [w, h] = [Math.min(canvas.width - sx, (x1 - x0 + 6) * k), Math.min(canvas.height - sy, (y1 - y0 + 6) * k)];
    const out = new OffscreenCanvas(Math.round(w), Math.round(h));
    out.getContext('2d').drawImage(canvas, sx, sy, w, h, 0, 0, out.width, out.height);
    return URL.createObjectURL(await out.convertToBlob({ type: 'image/webp', quality: 0.9 }));
  }));
}

// Lines become paragraphs. A paragraph continues while lines follow at the usual leading,
// with the same type, not after a short line that ends a sentence, and not into an indent.
// Figures, and notes in smaller type below the text, float to the end of the paragraph
// they interrupt, as in a printed book.
class Flow {
  constructor(stats) { this.stats = stats; this.out = []; this.para = null; this.floats = []; this.notes = null; }
  line(l, html) {
    const p = this.para, a = p?.last;
    const small = size => size < this.stats.body * 0.92; // notes are set smaller than the text they annotate
    if (p && !p.pre && small(l.size) && !small(a.size) && l.page === a.page && l.y > a.y) return (this.notes ||= new Flow(this.stats)).line(l, html);
    if (l.mono) return this.code(l, html);
    if (p && !p.pre && this.continues(a, l)) {
      const word = `${a.text.trimEnd().match(/(\p{L}+)-$/u)?.[1]}-${l.text.trimStart().match(/^\p{Ll}+/u)?.[0]}`.toLowerCase();
      const broken = /-$/.test(a.text.trimEnd()) && /^\p{Ll}/u.test(l.text.trimStart()) && !this.stats.compounds.has(word);
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
    const ends = /[.!?:;"”’)\]]$/.test(a.text.trim());
    const leading = this.stats.leading * a.size / this.stats.body;
    const below = b.page === a.page && b.y > a.y && b.x0 < a.x1 && b.x1 > a.x0; // further down the same column
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
  figure(src) {
    this.floats.push(`<p><img src="${src}"></p>`);
    if (!this.para) this.close();
  }
  anchor(id) { (this.para ? (this.para.html += `<a id="${id}"></a>`) : this.out.push(`<a id="${id}"></a>`)); }
  end() { this.close(); return this.out.join('\n'); }
}
