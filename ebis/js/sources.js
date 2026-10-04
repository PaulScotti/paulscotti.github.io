// Every way into the library: a file (EPUB, Kindle, FB2, comic, PDF, text, HTML) or a link.
// Each becomes a "source" (sections of HTML, a table of contents, a way to resolve links)
// that convert.js turns into a package.

import { build, fitImage } from './convert.js';

const label = x => typeof x === 'string' ? x.trim()
  : Array.isArray(x) ? x.map(label).filter(Boolean).join(', ')
  : x?.name ? label(x.name)
  : x ? label(Object.values(x)[0]) : '';

const startsWith = async (blob, offset, text) =>
  new TextDecoder('latin1').decode(await blob.slice(offset, offset + text.length).arrayBuffer()) === text;

export async function importFile(file, opts) {
  const { name } = file;
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf' || await startsWith(file, 0, '%PDF-')) {
    const { pdfSource } = await import('./pdf.js');
    return finish(await pdfSource(file), 'pdf', name, opts);
  }
  if (/^(epub|mobi|azw3?|kf8|prc|fb2|fbz|cbz)$/.test(ext) || await startsWith(file, 0, 'PK\x03\x04') || await startsWith(file, 60, 'BOOKMOBI')) {
    return finish(await ebookSource(file, ext), /^(azw|prc|kf8)$/.test(ext) ? 'mobi' : ext, name, opts);
  }
  const html = /^x?html?$/.test(ext) || file.type === 'text/html';
  if (!html && !/^(txt|text|md)$/.test(ext) && !file.type.startsWith('text/')) throw new Error(`ebis can’t read .${ext} files.`);
  const text = decode(new Uint8Array(await file.arrayBuffer()));
  return finish(html ? webSource(parse(text), `file:///${name}`) : textSource(text), html ? 'html' : 'txt', name, opts);
}

export async function importURL(url, opts) {
  let blob, final;
  try {
    ({ blob, url: final } = await opts.fetchPage(url));
  } catch (e) {
    // A site can refuse the fetch outright — Forbes and friends answer every non-browser 402/403/429/451.
    const code = e.message.match(/answered (\d{3})/)?.[1];
    throw /^(402|403|429|451)$/.test(code) ? new Error(`The site only shows its pages to a real browser (it answered ${code}).`) : e;
  }
  const type = blob.type.split(';')[0];
  if (!/html|xml/.test(type)) {
    const file = new File([blob], decodeURIComponent(new URL(final).pathname.split('/').pop() || 'download'), { type });
    const out = await importFile(file, opts);
    out.record.source = final;
    return out;
  }
  const html = decode(new Uint8Array(await blob.arrayBuffer()), blob.type);
  // Or it answers 200 with a bot wall's challenge page instead of the article.
  if (botWall(html)) throw new Error('The site only shows its pages to a real browser.');
  const doc = parse(html);
  // A scholarly page names its paper in citation_pdf_url (arXiv, bioRxiv, journals); ebis reads the paper itself.
  const paper = doc.querySelector('meta[name="citation_pdf_url"]')?.content;
  if (paper) return importURL(new URL(paper, final).href, opts);
  return finish(webSource(doc, final), 'web', final, opts);
}

// The signature of a challenge page (DataDome, Cloudflare, PerimeterX, Incapsula): its vendor's
// script or token in the markup, or its stock title — never something a real article carries.
const botWall = html => /captcha-delivery\.com|cf-chl-|challenge-platform|px-captcha|_incapsula_|distil_ron|<title[^>]*>\s*(just a moment|attention required|please wait|checking your browser)/i.test(html);

const parse = html => new DOMParser().parseFromString(html, 'text/html');

async function finish(source, format, origin, { fetcher, progress }) {
  const { book, zip } = await build(source, { fetcher, progress });
  const cover = source.cover && await thumbnail(await source.cover);
  const words = Math.round(book.sizes.reduce((a, b) => a + b, 0) / 6);
  const record = {
    title: book.title || origin.replace(/\.\w+$/, ''), author: book.author || '', site: book.site || '',
    kind: format === 'web' ? 'article' : 'book', format, source: origin, lang: book.lang || '',
    words, bytes: zip.size, cover, added: Date.now(),
  };
  return { record, zip, book };
}

export async function thumbnail(blob) {
  if (!blob?.size) return '';
  const { blob: small } = await fitImage(blob, 420);
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(small);
  });
}

// Ebooks, read by foliate-js.
async function openEbook(file, ext) {
  if (await startsWith(file, 60, 'BOOKMOBI')) {
    const [{ MOBI }, { unzlibSync }] = await Promise.all([import('../vendor/foliate/mobi.js'), import('../vendor/fflate.js')]);
    const book = await new MOBI({ unzlib: unzlibSync }).open(file);
    return { book, locked: book.mobi.headers.palmdoc.encryption > 0 };
  }
  if (ext === 'fb2') return { book: await (await import('../vendor/foliate/fb2.js')).makeFB2(file) };
  const zip = await unzip(file);
  const fb2 = zip.entries.find(e => e.filename.endsWith('.fb2'));
  if (fb2) return { book: await (await import('../vendor/foliate/fb2.js')).makeFB2(zip.loadBlob(fb2.filename)) };
  if (!zip.entries.some(e => e.filename === 'META-INF/container.xml')) return { book: comicBook(zip, file.name) };
  // Content encrypted with anything but the standard font obfuscation is DRM.
  const locked = !!zip.loadText('META-INF/rights.xml') ||
    /Algorithm="(?!http:\/\/www\.idpf\.org\/2008\/embedding|http:\/\/ns\.adobe\.com\/pdf\/enc#RC)/.test(zip.loadText('META-INF/encryption.xml') ?? '');
  return { book: await new (await import('../vendor/foliate/epub.js')).EPUB(zip).init(), locked };
}

async function ebookSource(file, ext) {
  const { book, locked } = await openEbook(file, ext).catch(() => { throw new Error('This file looks damaged.'); });
  if (locked) throw new Error('This book is locked with DRM, which ebis can’t open.');

  const kept = book.sections.map((s, i) => [s, i]).filter(([s]) => s.load);
  const index = new Map(kept.map(([, i], k) => [i, k]));
  const docs = new Map();
  const docOf = i => {
    if (!docs.has(i)) docs.set(i, Promise.resolve(book.sections[i].createDocument?.()));
    return docs.get(i);
  };
  const meta = book.metadata || {};
  return {
    meta: {
      title: label(meta.title), author: label(meta.author),
      lang: label([meta.language].flat()[0]), dir: book.dir || '',
    },
    cover: book.getCover?.(),
    sections: kept.map(([s]) => ({ load: () => s.load() })),
    toc: book.toc,
    async resolve(href, from) {
      if (book.isExternal?.(href)) return null;
      const section = from == null ? null : kept[from][0];
      const r = await book.resolveHref(section?.resolveHref?.(href) ?? href);
      if (!r || !index.has(r.index)) return null;
      const doc = await docOf(r.index);
      const el = doc && r.anchor?.(doc);
      const id = el?.nodeType === 1 && el !== doc.documentElement && el !== doc.body
        && (el.id || el.getAttribute('name') || el.closest('[id]')?.id);
      return id ? `s${index.get(r.index)}-${id}` : `s${index.get(r.index)}`;
    },
  };
}

async function unzip(file) {
  const { unzip } = await import('../vendor/fflate.js');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise((resolve, reject) => unzip(bytes, (err, out) => err ? reject(err) : resolve(out)));
  const decoder = new TextDecoder();
  return {
    entries: Object.keys(files).map(filename => ({ filename })),
    loadText: name => name in files ? decoder.decode(files[name]) : null,
    loadBlob: (name, type) => name in files ? new Blob([files[name]], type ? { type } : {}) : null,
    getSize: name => files[name]?.length ?? 0,
  };
}

function comicBook(zip, name) {
  const pages = zip.entries.map(e => e.filename).filter(f => /\.(jpe?g|png|gif|webp|avif)$/i.test(f) && !f.startsWith('__MACOSX'))
    .sort(new Intl.Collator(undefined, { numeric: true }).compare);
  if (!pages.length) throw new Error('This archive has no pages ebis can read.');
  const url = f => URL.createObjectURL(zip.loadBlob(f));
  return {
    metadata: { title: name.replace(/\.\w+$/, '') },
    getCover: () => zip.loadBlob(pages[0]),
    sections: [{ load: () => ({ html: pages.map(f => `<p><img src="${url(f)}"></p>`).join('') }) }],
    resolveHref: () => null,
  };
}

// Web pages and saved HTML: the article itself, found by Readability.
function webSource(doc, url) {
  // Two patterns Readability mistakes for clutter: old <font> tags, which split its paragraphs,
  // and headings wrapped with link chrome ("[edit]", "#" anchors), which it deletes as links.
  for (const font of doc.querySelectorAll('font')) font.replaceWith(...font.childNodes);
  for (const head of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const wrap = head.parentElement;
    const rest = wrap.textContent.replace(head.textContent, '').trim();
    if (wrap.localName === 'div' && rest.length <= 12 && [...wrap.querySelectorAll('a')].some(a => !head.contains(a))) wrap.replaceWith(head);
  }
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const metaOf = (...names) => names.map(n => doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content).find(Boolean) || '';
  const lang = doc.documentElement.lang || metaOf('og:locale').replace('_', '-');
  const published = metaOf('article:published_time', 'citation_publication_date', 'date');
  const source = { meta: {}, cover: null, toc: null, sections: [{ load }], resolve };

  async function load() {
    // A paywall is mostly theater for anything reading raw HTML: the whole article still
    // ships in the page, in a schema.org block or the app's own JSON state. Read it
    // before Readability rearranges the document.
    const embedded = embeddedArticle(doc);
    const { Readability } = await import('../vendor/readability.js');
    const article = new Readability(doc, { charThreshold: 200 }).parse();
    if (!article?.content) throw new Error('No article found on that page.');
    if (embedded.length > article.textContent.length * 1.25 + 500) {
      article.content = looksLikeMarkup(embedded) ? embedded : asParagraphs(embedded);
    }
    const when = new Date(article.publishedTime || published);
    const meta = source.meta = {
      title: article.title || doc.title || url, author: article.byline?.replace(/^by\s+/i, '') || '',
      site: article.siteName || new URL(url).hostname.replace(/^www\./, ''), lang: article.lang || lang,
      published: isNaN(when) ? '' : when.toISOString(),
    };
    const date = isNaN(when) ? '' : when.toLocaleDateString(meta.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const line = (text, style) => text ? `<p style="text-align:center;${style}">${escape(text)}</p>` : '';
    return {
      html: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; style-src \'unsafe-inline\'">' +
        `<base href="${escape(url)}"></head><body><h1>${escape(meta.title)}</h1>` +
        line(meta.author, 'font-variant-caps:small-caps') + line([meta.site, date].filter(Boolean).join(' · '), 'font-style:italic') +
        `${article.content}</body></html>`,
    };
  }
  function resolve(href) {
    const target = new URL(href, url);
    return target.hash && target.href.split('#')[0] === url.split('#')[0] ? `s0-${decodeURIComponent(target.hash.slice(1))}` : null;
  }
  return source;
}

// The full article where a page embeds it for machines: schema.org's articleBody, or a long
// prose value in the JSON state its app boots from (__NEXT_DATA__, window.__STATE__, …).
function embeddedArticle(doc) {
  let best = '';
  const KEYS = /^(articlebody|body(text|html)?|content|fullcontent|fulltext|text|html|markup)$/i;
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && KEYS.test(key) && value.length > best.length && prose(value)) best = value;
      else walk(value);
    }
  };
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const text = script.textContent.trim();
    // Pure JSON (ld+json, application/json) or one assignment of a JSON object.
    const json = /^\{/.test(text) ? text : /^(?:window\.|var |let |const )[\w$]+(?:\.\w+)?\s*=\s*(\{[\s\S]*\})\s*;?$/.exec(text)?.[1];
    if (json) try { walk(JSON.parse(json)); } catch { /* not JSON */ }
  }
  return best;
}

// Article prose is long and sentence-shaped; markup is only prose when it holds paragraphs.
const prose = s => s.length > 600 && (looksLikeMarkup(s) ? /<p[\s>]/.test(s) : /[.!?] /.test(s));
const looksLikeMarkup = s => /^\s*</.test(s) && /<\/(p|div|h[1-6]|section|article)>/.test(s);

// Plain text becomes paragraphs the way textSource cuts them.
const asParagraphs = text => {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/.test(text) ? /\n\s*\n/ : '\n').map(p => p.trim()).filter(Boolean);
  return paras.map(p => `<p>${escape(p).replace(/\n/g, ' ')}</p>`).join('');
};

// Plain text: blank lines separate paragraphs and single line breaks are wrapping,
// unless there are no blank lines at all, in which case each line is a paragraph.
function textSource(text) {
  text = text.replace(/\r\n?/g, '\n');
  const paras = text.split(/\n\s*\n/.test(text) ? /\n\s*\n/ : '\n').map(p => p.trim()).filter(Boolean);
  const html = paras.map(p => `<p>${escape(p).replace(/\n/g, ' ')}</p>`).join('');
  return { meta: {}, cover: null, toc: null, sections: [{ load: () => ({ html }) }], resolve: () => null };
}

// Text in the encoding its byte-order mark, server or <meta> names; otherwise UTF-8, or
// Windows-1252 for older text that isn't valid UTF-8 (as browsers decide for web pages).
function decode(bytes, type = '') {
  const named = (bytes[0] === 0xff && bytes[1] === 0xfe && 'utf-16le') || (bytes[0] === 0xfe && bytes[1] === 0xff && 'utf-16be')
    || type.match(/charset=([\w-]+)/i)?.[1] || new TextDecoder('latin1').decode(bytes.slice(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  for (const [encoding, fatal] of [[named, false], ['utf-8', true], ['windows-1252', false]]) {
    try {
      if (encoding) return new TextDecoder(encoding, { fatal }).decode(bytes);
    } catch {} // an encoding no browser knows, or bytes that aren't UTF-8
  }
}

const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
