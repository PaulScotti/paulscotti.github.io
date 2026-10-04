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
  const name = file.name || 'Untitled';
  const ext = name.toLowerCase().split('.').pop();
  if (await startsWith(file, 0, '%PDF-')) {
    const { pdfSource } = await import('./pdf.js');
    return finish(await pdfSource(file), 'pdf', name, opts);
  }
  if (await startsWith(file, 0, 'PK\x03\x04') || await startsWith(file, 60, 'BOOKMOBI') || ext === 'fb2') {
    return finish(await ebookSource(file, ext), ext === 'azw' || ext === 'prc' ? 'mobi' : ext, name, opts);
  }
  const text = decode(new Uint8Array(await file.arrayBuffer()));
  const source = /^html?$/.test(ext) ? webSource(parse(text), `file:///${name}`) : textSource(text);
  return finish(source, ext, name, opts);
}

export async function importURL(url, opts) {
  const { blob, url: final } = await opts.fetchPage(url);
  const type = blob.type.split(';')[0];
  if (!/html|xml/.test(type)) {
    const file = new File([blob], decodeURIComponent(new URL(final).pathname.split('/').pop() || 'download'), { type });
    const out = await importFile(file, opts);
    out.record.source = final;
    return out;
  }
  const doc = parse(decode(new Uint8Array(await blob.arrayBuffer()), blob.type));
  // A scholarly page names its paper in citation_pdf_url (arXiv, bioRxiv, journals); ebis reads the paper itself.
  const paper = doc.querySelector('meta[name="citation_pdf_url"]')?.content;
  if (paper) return importURL(new URL(paper, final).href, opts);
  return finish(webSource(doc, final), 'web', final, opts);
}

const parse = html => new DOMParser().parseFromString(html, 'text/html');

async function finish(source, format, origin, { fetcher, progress }) {
  const { book, zip } = await build(source, { fetcher, progress });
  const cover = source.cover && await thumbnail(await source.cover);
  const words = Math.round(book.sizes.reduce((a, b) => a + b, 0) / 6);
  const record = {
    title: book.title || origin.replace(/\.\w+$/, ''), author: book.author || '', site: book.site || '',
    kind: format === 'web' ? 'article' : 'book', format, source: origin, lang: book.lang || '',
    words, cover, added: Date.now(),
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
async function ebookSource(file, ext) {
  let book;
  if (await startsWith(file, 60, 'BOOKMOBI')) {
    const [{ MOBI }, { unzlibSync }] = await Promise.all([import('../vendor/foliate/mobi.js'), import('../vendor/fflate.js')]);
    book = await new MOBI({ unzlib: unzlibSync }).open(file);
  } else if (ext === 'fb2') {
    book = await (await import('../vendor/foliate/fb2.js')).makeFB2(file);
  } else {
    const zip = await unzip(file);
    const fb2 = zip.entries.find(e => e.filename.endsWith('.fb2'));
    if (fb2) book = await (await import('../vendor/foliate/fb2.js')).makeFB2(zip.loadBlob(fb2.filename));
    else if (zip.entries.some(e => e.filename === 'META-INF/container.xml')) book = await new (await import('../vendor/foliate/epub.js')).EPUB(zip).init();
    else book = comicBook(zip, file.name);
  }

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
  for (const font of doc.querySelectorAll('font')) font.replaceWith(...font.childNodes); // obsolete markup Readability would split paragraphs at
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const metaOf = (...names) => names.map(n => doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content).find(Boolean) || '';
  const lang = doc.documentElement.lang || metaOf('og:locale').replace('_', '-');
  const published = metaOf('article:published_time', 'citation_publication_date', 'date');
  const source = { meta: {}, cover: null, toc: null, sections: [{ load }], resolve };

  async function load() {
    const { Readability } = await import('../vendor/readability.js');
    const article = new Readability(doc, { charThreshold: 200 }).parse();
    if (!article?.content) throw new Error('No article found on that page.');
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

// Plain text: blank lines separate paragraphs; single line breaks are just wrapping.
function textSource(text) {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const html = paras.map(p => `<p>${escape(p).replace(/\n/g, ' ')}</p>`).join('');
  return { meta: {}, cover: null, toc: null, sections: [{ load: () => ({ html }) }], resolve: () => null };
}

function decode(bytes, type = '') {
  const declared = type.match(/charset=([\w-]+)/i)?.[1]
    || new TextDecoder('latin1').decode(bytes.slice(0, 4096)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(declared || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
