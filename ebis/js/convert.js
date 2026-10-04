// Turns any source (ebook sections, a web article, a PDF) into an ebis package:
// chapters of small, semantic HTML that ebis typesets itself. Each source document
// is mounted in a hidden frame so the browser resolves its CSS; we keep what a reader
// would notice (structure, emphasis, alignment, images, links) and drop the rest.

import { zipSync, strToU8 } from '../vendor/fflate.js';

// Source elements that keep their shape: containers hold blocks, leaves hold text.
const ROLE = {
  ul: 'box', ol: 'box', dl: 'box', table: 'box', thead: 'box', tbody: 'box', tfoot: 'box', tr: 'box',
  blockquote: 'box', figure: 'box', figcaption: 'box', caption: 'box', aside: 'box', li: 'box', dd: 'box', td: 'box', th: 'box',
  p: 'leaf', dt: 'leaf', pre: 'leaf',
  h1: 'head', h2: 'head', h3: 'head', h4: 'head', h5: 'head', h6: 'head',
};
const SKIP = new Set(['head', 'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'form', 'input', 'button', 'select', 'textarea', 'nav']);
const MONO = /mono|courier|consol/i;
const TEXT_BLOCKS = 'p,h2,h3,h4,pre,li,dt,dd,th,td,caption,figcaption';
const CHAPTER_LIMIT = 90000; // characters; longer chapters are split at a heading near the middle
const PARAGRAPH_LIMIT = 6000; // a text run longer than any real paragraph (a file with no line breaks) is cut into these

const h = (tag, attrs = {}) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const textOf = el => el.textContent.replace(/\s+/g, ' ').trim();

// Leaf blocks in reading order; reading positions count characters within these.
export const blocks = root => [...root.querySelectorAll(`${TEXT_BLOCKS},hr,img`)].filter(el =>
  el.localName === 'img' ? !el.closest(TEXT_BLOCKS) : el.localName === 'hr' || !el.querySelector(TEXT_BLOCKS));
export const blockSizes = root => blocks(root).map(el => el.textContent.length || 1);

class Writer {
  constructor(section, win, prefix) {
    this.win = win;
    this.prefix = prefix;
    this.stack = [section];
    this.leaf = this.inline = null;
    this.ids = []; // anchors waiting for the next block
  }
  get box() { return this.stack.at(-1); }

  place(el) {
    if (this.ids.length) el.id = this.ids.shift();
    el.prepend(...this.ids.splice(0).map(id => h('a', { id })));
    return el;
  }
  open(tag) { this.close(); const el = this.place(h(tag)); this.box.append(el); this.stack.push(el); return el; }
  end() { this.close(); this.stack.pop(); }
  startLeaf(tag, look) {
    this.close();
    this.leaf = this.inline = this.place(h(tag, { 'data-fs': look.fs }));
    this.chars = this.weight = 0; // for the size its text is set in, averaged over its characters
    if (look.cls) this.leaf.className = look.cls;
    this.box.append(this.leaf);
  }
  close() {
    const leaf = this.leaf;
    this.leaf = this.inline = null;
    if (!leaf) return;
    trim(leaf);
    if (this.chars) leaf.dataset.fs = Math.round(this.weight / this.chars * 2) / 2;
    if (!leaf.textContent.trim() && !leaf.querySelector('img,math,a[id]')) leaf.remove();
  }
  text(s, look) {
    if (look.pre) return this.add(s, look);
    if (s.length > PARAGRAPH_LIMIT * 2) {
      for (const part of s.match(new RegExp(`[\\s\\S]{1,${PARAGRAPH_LIMIT}}\\S*`, 'g'))) this.close(), this.text(part, look);
      return;
    }
    const lines = look.lines ? s.split('\n') : [s];
    lines.forEach((line, i) => {
      if (i && this.leaf) this.inline.append(h('br'));
      line = line.replace(/[\t\n\r\f ]+/g, ' ');
      if (!this.leaf && !line.trim()) return;
      if (line[0] === ' ' && /(^|\s)$/.test(this.leaf?.textContent ?? '')) line = line.slice(1);
      if (line) this.add(line, look);
    });
  }
  add(el, look) {
    if (!this.leaf) this.startLeaf('p', look);
    this.inline.append(el);
    if (typeof el === 'string') {
      const n = el.trim().length;
      this.chars += n;
      this.weight += n * look.fs;
    }
  }

  walk(node, look, cs) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) this.text(child.data, look);
      else if (child.nodeType === 1) this.element(child, look, cs);
    }
  }

  element(el, look, parent) {
    const tag = el.localName;
    if (SKIP.has(tag)) return;
    const cs = this.win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const inline = /^(inline|ruby|math|contents)/.test(cs.display);
    const id = el.id || (tag === 'a' && el.getAttribute('name'));
    if (id) {
      if (inline && this.leaf) this.inline.append(h('a', { id: this.prefix + id }));
      else this.ids.push(this.prefix + id);
    }

    if (tag === 'img' || tag === 'image' || tag === 'svg') return this.picture(el, look);
    if (tag === 'math') return this.add(cloneMath(el), look);
    if (tag === 'br') return this.leaf && this.inline.append(h('br'));
    if (tag === 'hr') return this.close(), this.box.append(this.place(h('hr')));
    if (inline) return this.span(el, cs, look, parent);

    const role = ROLE[tag];
    const own = lookOf(cs, look, tag === 'pre');
    if (look.inLeaf && role !== 'box') { // a block inside a heading or paragraph is a line of it
      if (this.leaf?.textContent.trim()) this.inline.append(h('br'));
      return this.walk(el, look, cs);
    }
    if (role === 'box') {
      const box = this.open(tag);
      for (const a of ['start', 'colspan', 'rowspan']) if (el.getAttribute(a) > 1) box.setAttribute(a, el.getAttribute(a));
      this.walk(el, own, cs);
      return this.end();
    }
    if (role) {
      this.startLeaf(role === 'head' ? 'p' : tag, own);
      if (role === 'head') this.leaf.dataset.h = tag[1];
      this.walk(el, { ...own, inLeaf: true }, cs);
      return this.close();
    }
    // Any other block (div, section, header…): its loose text becomes paragraphs.
    this.close();
    this.walk(el, { ...own, inLeaf: look.inLeaf }, cs);
    this.close();
  }

  span(el, cs, look, parent) {
    look = { ...look, fs: parseFloat(cs.fontSize) };
    const wraps = [];
    if (el.localName === 'a' && el.hasAttribute('href')) wraps.push(h('a', { 'data-href': el.getAttribute('href') }));
    if ((cs.fontStyle === 'italic') !== (parent.fontStyle === 'italic')) wraps.push(h('em'));
    if (cs.fontWeight >= 600 && parent.fontWeight < 600) wraps.push(h('strong'));
    if (cs.fontVariantCaps === 'small-caps' && parent.fontVariantCaps !== 'small-caps') wraps.push(h('span', { class: 'sc' }));
    if (cs.verticalAlign === 'super' || cs.verticalAlign === 'sub') wraps.push(h(cs.verticalAlign === 'sub' ? 'sub' : 'sup'));
    if (MONO.test(cs.fontFamily) && !MONO.test(parent.fontFamily)) wraps.push(h('code'));
    if (['ruby', 'rt', 'rp'].includes(el.localName)) wraps.push(h(el.localName));
    if (!wraps.length) return this.walk(el, look, cs);
    const inner = wraps.reduce((outer, w) => (outer.append(w), w));
    this.add(wraps[0], look);
    const before = this.inline;
    this.inline = inner;
    this.walk(el, look, cs);
    if (this.inline === inner) this.inline = before; // a block may have closed the paragraph meanwhile
  }

  picture(el, look) {
    const href = node => node?.getAttribute('href') || node?.getAttribute('xlink:href');
    const src = el.localName === 'img' ? el.currentSrc || el.getAttribute('src')
      : el.localName === 'image' ? href(el)
      : href(el.querySelector('image')) || svgURL(el);
    if (src) this.add(h('img', { alt: el.getAttribute('alt') || '', 'data-src': src }), look);
  }
}

// How a block looks, in the few terms ebis keeps.
function lookOf(cs, parent, pre) {
  const cls = [];
  const align = cs.textAlign.replace('-webkit-', ''); // HTML's align attribute and <center> compute to -webkit-center
  if (align === 'center') cls.push('c');
  else if (align === 'right' || (align === 'end' && cs.direction === 'ltr')) cls.push('r');
  if (cs.fontStyle === 'italic') cls.push('i');
  if (cs.fontVariantCaps === 'small-caps') cls.push('sc');
  return { cls: cls.join(' '), fs: parseFloat(cs.fontSize), pre: pre || parent.pre, lines: /^pre/.test(cs.whiteSpace) };
}

function trim(leaf) {
  for (const side of ['firstChild', 'lastChild']) while (leaf[side]?.localName === 'br') leaf[side].remove();
  if (leaf.localName === 'pre') return;
  const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  if (!texts.length) return;
  texts[0].data = texts[0].data.trimStart();
  texts.at(-1).data = texts.at(-1).data.trimEnd();
}

function cloneMath(node) {
  if (node.nodeType === 3) return document.createTextNode(node.data);
  const out = document.createElementNS('http://www.w3.org/1998/Math/MathML', node.localName);
  for (const { name, value } of node.attributes) if (!/^on|href|style|src/i.test(name)) out.setAttribute(name, value);
  for (const child of node.childNodes) {
    if (child.nodeType === 3 || child.namespaceURI === out.namespaceURI) out.append(cloneMath(child));
  }
  return out;
}

function svgURL(svg) {
  const copy = svg.cloneNode(true);
  const { width, height } = svg.getBoundingClientRect();
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (width && height) copy.setAttribute('width', width), copy.setAttribute('height', height);
  return URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
}

// Decisions that need the whole book: which lines are headings, breaks, figures.
function finish(sections) {
  const weight = new Map();
  for (const el of sections.flatMap(s => [...s.querySelectorAll('[data-fs]')])) {
    weight.set(+el.dataset.fs, (weight.get(+el.dataset.fs) || 0) + el.textContent.length);
  }
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0];

  for (const section of sections) {
    // Headings: real ones, short lines set clearly larger than the text, and short lines set all in bold.
    const heads = [...section.querySelectorAll('[data-fs]')].filter(el => el.dataset.h || (el.localName === 'p' && !el.querySelector('img') &&
      ((el.dataset.fs >= body * 1.2 && textOf(el).length < 120) || (textOf(el).length < 90 && !/[.:,;]$/.test(textOf(el)) && boldOnly(el)))));
    const sizes = [...new Set(heads.map(el => +el.dataset.fs))].sort((a, b) => b - a);
    for (const el of heads) {
      if (boldOnly(el)) for (const b of el.querySelectorAll('strong, b')) b.replaceWith(...b.childNodes); // a heading's weight is its own
      rename(el, `h${2 + Math.min(sizes.indexOf(+el.dataset.fs), 2)}`);
    }

    for (const p of section.querySelectorAll('p')) {
      const text = textOf(p);
      const media = p.querySelectorAll('img');
      if (!media.length && /^[*∗⁂·•.\-–—~#❦❧✻✽○◦ ]{1,24}$/u.test(text)) p.replaceWith(h('hr')); // a dinkus: * * *
      else if (media.length && !text) { // a paragraph holding only images is a figure
        const keep = [...p.querySelectorAll('img, a[id]')];
        if (p.parentElement.localName === 'figure') p.replaceWith(...keep);
        else rename(p, 'figure').replaceChildren(...keep);
      }
    }
    for (const el of section.querySelectorAll('li, dd, td, th, figcaption, caption')) {
      const only = el.firstElementChild;
      if (el.childElementCount === 1 && only.localName === 'p' && textOf(only) === textOf(el)) {
        if (only.id && !el.id) el.id = only.id;
        only.replaceWith(...only.childNodes);
      }
    }
    for (const el of section.querySelectorAll('[data-fs]')) el.removeAttribute('data-fs'), el.removeAttribute('data-h');
  }
}

function boldOnly(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let any = false;
  while (walker.nextNode()) {
    if (!walker.currentNode.data.trim()) continue;
    if (!walker.currentNode.parentElement.closest('strong, b')) return false;
    any = true;
  }
  return any;
}

function rename(el, tag) {
  const out = h(tag);
  for (const { name, value } of el.attributes) out.setAttribute(name, value);
  out.append(...el.childNodes);
  el.replaceWith(out);
  return out;
}

// Chapters too long to lay out quickly are split, preferring a heading near the middle.
function split(section) {
  const parts = [section];
  for (let i = 0; i < parts.length; i++) {
    const kids = [...parts[i].children];
    const total = parts[i].textContent.length;
    if (total < CHAPTER_LIMIT || kids.length < 2) continue;
    let run = 0, cut = 1, best = Infinity;
    kids.forEach((el, k) => {
      const miss = Math.abs(run - total / 2) * (/^h[234]$/.test(el.localName) ? 0.5 : 1);
      if (k && miss < best) best = miss, cut = k;
      run += el.textContent.length;
    });
    const rest = h('section');
    rest.append(...kids.slice(cut));
    parts.splice(i-- + 1, 0, rest);
  }
  return parts;
}

// Images are stored once per source, scaled down when they exceed any screen.
export async function fitImage(blob, max = 1800) {
  if (/svg/.test(blob.type)) return { blob, ...svgSize(await blob.text()) };
  const bitmap = await createImageBitmap(blob);
  const { width: w, height: h } = bitmap;
  const k = max / Math.max(w, h);
  if (k >= 1 || blob.type === 'image/gif') return bitmap.close(), { blob, w, h };
  const canvas = new OffscreenCanvas(Math.round(w * k), Math.round(h * k));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 }), w: canvas.width, h: canvas.height };
}

function svgSize(text) {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const box = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) || [];
  return { w: parseFloat(svg.getAttribute('width')) || box[2] || 300, h: parseFloat(svg.getAttribute('height')) || box[3] || 150 };
}

async function storeImages(sections, fetcher) {
  const byURL = new Map(), files = {}, sizes = {};
  const load = async (src, key) => {
    const blob = /^(blob|data):/.test(src) ? await (await fetch(src)).blob() : await fetcher(src);
    const { blob: fit, w, h } = await fitImage(blob);
    const name = `${key}.${{ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[fit.type] || fit.type.split('/')[1] || 'img'}`;
    files[name] = new Uint8Array(await fit.arrayBuffer());
    sizes[name] = [w, h];
    return name;
  };
  const imgs = sections.flatMap(s => [...s.querySelectorAll('img[data-src]')]);
  for (const { dataset: { src } } of imgs) if (!byURL.has(src)) byURL.set(src, load(src, `i${byURL.size}`).catch(() => null));
  await Promise.all(imgs.map(async img => {
    const name = await byURL.get(img.dataset.src);
    if (!name) { // a picture that can't be fetched leaves nothing behind, not even its empty frame
      const figure = img.closest('figure');
      img.remove();
      if (figure && !figure.textContent.trim() && !figure.querySelector('img')) figure.remove();
      return;
    }
    img.removeAttribute('data-src');
    img.dataset.k = name;
    [img.width, img.height] = sizes[name];
  }));
  return { files, sizes };
}

async function mount(frame, src) {
  const loaded = new Promise(resolve => frame.onload = resolve);
  if (typeof src === 'string') frame.src = src; else frame.srcdoc = src.html;
  await loaded;
  return frame.contentDocument;
}

// source: { meta, cover, sections: [{ load }], toc?, resolve(href, fromSection) → id | null }
export async function build(source, { fetcher, progress = () => {} }) {
  const frame = h('iframe', { sandbox: 'allow-same-origin', 'aria-hidden': 'true', tabindex: '-1' });
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:720px;height:1000px;border:0;visibility:hidden';
  document.body.append(frame);
  const sections = [];
  try {
    for (const [i, section] of source.sections.entries()) {
      const doc = await mount(frame, await section.load());
      const root = doc.body || doc.documentElement;
      const out = h('section', { id: `s${i}` });
      const writer = new Writer(out, frame.contentWindow, `s${i}-`);
      writer.walk(root, { cls: '', fs: 16 }, frame.contentWindow.getComputedStyle(root));
      writer.close();
      out.append(...writer.ids.map(id => h('a', { id })));
      for (const a of out.querySelectorAll('a[data-href]')) a.dataset.from = i;
      sections.push(out);
      progress(0.8 * (i + 1) / source.sections.length);
    }
  } finally {
    frame.remove();
  }
  finish(sections);

  // Links and contents point at ids; only ids something points at are kept.
  const targets = new Set(sections.map(s => s.id));
  const memo = new Map();
  const resolve = (href, from) => {
    const key = `${from}\n${href}`;
    if (!memo.has(key)) memo.set(key, (async () => source.resolve(href, from))().catch(() => null));
    return memo.get(key);
  };
  for (const a of sections.flatMap(s => [...s.querySelectorAll('a[data-href]')])) {
    const { href, from } = a.dataset;
    a.removeAttribute('data-href');
    a.removeAttribute('data-from');
    const target = await resolve(href, +from);
    if (target) a.setAttribute('href', `#${target}`), targets.add(target);
    else if (/^(https?|mailto):/i.test(href)) Object.assign(a, { href, target: '_blank', rel: 'noopener' });
    else a.replaceWith(...a.childNodes);
  }
  let toc = [];
  const addToc = async (items, level) => {
    for (const item of items) {
      const id = item.label?.trim() && await resolve(item.href, null);
      if (id) toc.push({ title: item.label.trim(), id, level }), targets.add(id);
      if (item.subitems) await addToc(item.subitems, level + 1);
    }
  };
  await addToc(source.toc || [], 0);
  if (!toc.length) toc = sections.flatMap(s => [...s.querySelectorAll('h2, h3')].map((head, k) => {
    head.id ||= `${s.id}-h${k}`;
    targets.add(head.id);
    return { title: textOf(head), id: head.id, level: head.localName === 'h2' ? 0 : 1 };
  }));
  for (const el of sections.flatMap(s => [...s.querySelectorAll('[id]')])) {
    if (targets.has(el.id)) continue;
    if (el.localName === 'a' && !el.hasAttribute('href') && !el.childNodes.length) el.remove();
    else el.removeAttribute('id');
  }

  const images = await storeImages(sections, fetcher);
  progress(0.95);
  const chapters = sections.flatMap(split).filter(s => s.textContent.trim() || s.querySelector('img'));
  chapters.forEach((s, i) => s.id ||= `p${i}`);
  return pack(source.meta, chapters, toc, images);
}

// The package is a zip of book.json (chapters, contents, sizes) and the images.
function pack(meta, chapters, toc, images) {
  const ids = {};
  chapters.forEach((s, i) => { for (const el of [s, ...s.querySelectorAll('[id]')]) ids[el.id] = i; });
  const book = {
    v: 1, ...meta,
    chapters: chapters.map(s => s.outerHTML),
    sizes: chapters.map(s => blockSizes(s).reduce((a, b) => a + b, 0)),
    toc: toc.filter(t => t.id in ids),
    ids,
    images: images.sizes,
  };
  const files = { 'book.json': strToU8(JSON.stringify(book)) };
  for (const [name, bytes] of Object.entries(images.files)) files[`img/${name}`] = [bytes, { level: 0 }];
  return { book, zip: new Blob([zipSync(files)], { type: 'application/zip' }) };
}
