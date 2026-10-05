// Every way into the library: a file (EPUB, Kindle, FB2, comic, PDF, text, HTML), a link,
// or the page a browser is showing. Each becomes a "source" (sections of HTML, a table of
// contents, a way to resolve links) that convert.js turns into a package.

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
  return finish(html ? webSource(parse(text), `file:///${name}`, opts.fetcher) : textSource(text), html ? 'html' : 'txt', name, opts);
}

export async function importURL(url, opts) {
  // An arXiv paper's HTML edition keeps its tables, formulas and figures as real
  // markup, where the PDF keeps only glyphs; read the page, falling back to the PDF.
  const edition = arxivHTML(url);
  if (edition) {
    try { return await importURL(edition, opts); } catch { /* this paper has no HTML edition */ }
  }
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
  const doc = parse(decode(new Uint8Array(await blob.arrayBuffer()), blob.type));
  // A scholarly page names its paper in citation_pdf_url (arXiv, bioRxiv, journals). When the page
  // is only the paper's abstract, read the paper itself; when it carries the full text, stay here.
  const paper = doc.querySelector('meta[name="citation_pdf_url"]')?.content;
  if (paper && (await articleLength(doc)) < 8000) return importURL(new URL(paper, final).href, opts);
  return finish(webSource(doc, final, opts.fetcher), 'web', final, opts);
}

// The page a browser is showing, handed over by the "Save to Ebis" bookmarklet: read where
// it lives, so its pictures and links resolve and its source is the page's real address.
export async function importPage(html, url, opts) {
  return finish(webSource(parse(html), url, opts.fetcher, true), 'web', url, opts);
}

const parse = html => new DOMParser().parseFromString(html, 'text/html');

// The paper's HTML edition for an arXiv abstract or PDF link (papers old and new have one).
const arxivHTML = url => {
  const m = /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/(?:(\d{4}\.\d{4,5})|([a-z-]+)(?:\.[a-z]{2})?\/(\d{7}))(v\d+)?(?:\.pdf)?\/?(?:[?#].*)?$/i.exec(url);
  return m ? `https://arxiv.org/html/${m[1] || `${m[2]}/${m[3]}`}${m[4] || ''}` : null;
};

// How much article a page shows, measured on a throwaway copy (Readability rearranges its input).
async function articleLength(doc) {
  const { Readability } = await import('../vendor/readability.js');
  return new Readability(doc.cloneNode(true)).parse()?.textContent.trim().length ?? 0;
}

async function finish(source, format, origin, { fetcher, progress }) {
  const { book, zip } = await build(source, { fetcher, progress });
  const cover = await Promise.resolve(source.cover).then(thumbnail).catch(() => ''); // without one, the shelf sets a cover
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

// Web pages and saved HTML: the article itself, found by Readability. A page `shown` is one as
// the browser showed it to its reader.
function webSource(doc, url, fetcher, shown) {
  // Before Readability looks: dialogs go, being the page's interface (consent prompts, menus,
  // popovers) rather than its text; and patterns Readability mistakes for clutter are put right: old
  // <font> tags, which split its paragraphs; headings wrapped with link chrome ("[edit]", "#" anchors),
  // which it deletes as links; and figures set in the margin (an <aside> holding nothing but figures),
  // which it drops as asides.
  for (const el of doc.querySelectorAll('dialog')) el.remove();
  for (const font of doc.querySelectorAll('font')) font.replaceWith(...font.childNodes);
  for (const head of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const wrap = head.parentElement;
    const rest = wrap.textContent.replace(head.textContent, '').trim();
    if (wrap.localName === 'div' && rest.length <= 12 && [...wrap.querySelectorAll('a')].some(a => !head.contains(a))) wrap.replaceWith(head);
  }
  for (const aside of doc.querySelectorAll('aside')) {
    const figures = [...aside.querySelectorAll('figure')];
    if (figures.length && !figures.reduce((text, f) => text.replace(f.textContent, ''), aside.textContent).trim()) aside.replaceWith(...figures);
  }
  // An article that ads break into parts comes as blocks of the same kind within its <article>,
  // with nothing to read between them; Readability keeps one block and its siblings, so such
  // parts are gathered into one.
  for (const article of doc.querySelectorAll('article')) {
    const holders = new Set([...article.querySelectorAll('p')].map(p => p.parentElement));
    const kinds = Map.groupBy([...holders].filter(h => h.className && h.querySelectorAll(':scope > p').length > 1), h => h.className);
    for (const parts of kinds.values()) parts.reduce((head, part) => {
      const gap = doc.createRange();
      gap.setStartAfter(head);
      gap.setEndBefore(part);
      if (gap.toString().trim() || gap.cloneContents().querySelector('img, picture, svg, video, figure')) return part;
      head.append(...part.childNodes);
      part.remove();
      return head;
    });
  }
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const metaOf = (...names) => names.map(n => doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content).find(Boolean) || '';
  const lang = doc.documentElement.lang || metaOf('og:locale').replace('_', '-');
  const published = metaOf('article:published_time', 'citation_publication_date', 'date');
  const image = metaOf('og:image', 'twitter:image'); // the picture the page shares itself with becomes its cover
  const declaresArticle = /article/i.test(metaOf('og:type')) ||
    /"\w*(Article|BlogPosting)"/.test([...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join());
  const paper = doc.querySelector('article.ltx_document'); // a paper LaTeXML made from its LaTeX (arXiv's HTML papers)
  const source = { meta: {}, cover: image && fetcher(new URL(image, url).href).catch(() => null), toc: null, sections: [{ load }], resolve };

  async function load() {
    await mathify(doc);
    // A page that says it is an article may carry the whole of it for machines too (schema.org's
    // articleBody, or the JSON state its app boots from); when that holds clearly more than the page
    // shows, it is read instead — unless the page is as its reader saw it, the whole article.
    // It has to be found before Readability rearranges the document.
    const embedded = declaresArticle && !paper && !shown ? embeddedArticle(doc) : '';
    const walled = botWall(doc);
    const { Readability } = await import('../vendor/readability.js');
    const article = paper ? latexml(paper)
      : new Readability(asSet(doc), { serializer: el => el, classesToPreserve: HIDDEN }).parse() ?? { textContent: '', content: doc.createElement('div') };
    const fuller = embedded.length > article.textContent.length * 1.25 + 500 && sameText(embedded, article.textContent, metaOf('og:description', 'description'));
    if ((fuller ? embedded : article.textContent).trim().length < 500) {
      throw new Error(walled ? 'The site only shows its pages to a real browser.' : 'That page has no article ebis can find.');
    }
    if (fuller) article.content.innerHTML = looksLikeMarkup(embedded) ? embedded : asParagraphs(embedded);
    const when = new Date(article.publishedTime || published);
    const site = tidy(article.siteName) || new URL(url).hostname.replace(/^www\./, '');
    const meta = source.meta = {
      title: withoutSite(tidy(article.title || doc.title) || url, site),
      author: withoutDate(tidy(article.byline).replace(/^by\b:?\s*/i, ''), when),
      site, lang: article.lang || lang, published: isNaN(when) ? '' : when.toISOString(),
    };
    prune(article.content, meta, when, url);
    const date = isNaN(when) ? '' : when.toLocaleDateString(meta.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const line = (text, style) => text ? `<p style="text-align:center;${style}">${escape(text)}</p>` : '';
    return {
      html: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; style-src \'unsafe-inline\'">' +
        `<base href="${escape(url)}"></head><body><h1>${escape(meta.title)}</h1>` +
        line(meta.author, 'font-variant-caps:small-caps') + line([meta.site, date].filter(Boolean).join(' · '), 'font-style:italic') +
        `${article.content.innerHTML}</body></html>`,
    };
  }
  function resolve(href) {
    const target = new URL(href, url);
    return target.hash && target.href.split('#')[0] === url.split('#')[0] ? `s0-${decodeURIComponent(target.hash.slice(1))}` : null;
  }
  return source;
}

const MATHML = 'http://www.w3.org/1998/Math/MathML';

// Formulas, however a page sets them, become MathML, which ebis typesets itself.
async function mathify(doc) {
  // TeX to typeset: MathJax's script elements, each in its own place. On a page saved as the
  // browser showed it, MathJax has drawn its formulas already, keeping each one's MathML beside
  // the drawing (see below) or else its TeX: version 2 in that script, after the drawing (its
  // "Frame"); version 4 on the drawing itself. The drawing goes for the TeX.
  const scripts = [...doc.querySelectorAll('script')];
  const tex = [];
  for (const s of scripts.filter(s => /^math\/tex/.test(s.type))) {
    const drawn = s.id && doc.getElementById(`${s.id}-Frame`);
    if (drawn?.querySelector('math')) s.remove();
    else {
      drawn?.remove();
      tex.push([s, s.textContent, /mode=display/.test(s.type)]);
    }
  }
  for (const drawn of doc.querySelectorAll('mjx-container')) {
    const source = !drawn.querySelector('math') && drawn.querySelector('[data-latex]')?.getAttribute('data-latex');
    if (source) tex.push([drawn, source, drawn.getAttribute('display') === 'true']);
  }
  // A formula is often there twice: as MathML for assistive technology, and drawn for the eye
  // where assistive technology is told not to look (KaTeX's HTML, MathJax's glyphs, a wiki's
  // picture of it). The MathML stays, in place of the typesetter's wrapper that held both.
  for (const math of doc.querySelectorAll('math')) {
    let wrapper;
    for (let el = math; el.parentElement && el.parentElement !== doc.body; el = el.parentElement) {
      const rest = [...el.parentElement.childNodes].filter(n => n !== el && (n.nodeType === 1 || n.data?.trim()));
      if (!rest.every(n => n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')) break;
      if (rest.length) wrapper = el.parentElement;
      rest.forEach(n => n.remove());
    }
    wrapper?.replaceWith(math);
  }
  // TeX that the page would have typeset in the browser, as MathJax and KaTeX look for it in
  // the text: \(…\), \[…\], $$…$$ and \begin{…}…\end{…}, and $…$ where the page's
  // configuration asks for it. Like them, a formula may run across lines.
  const config = scripts.map(s => `${s.src} ${s.textContent.slice(0, 3000)}`).join('\n');
  const dollars = /inlineMath[^\]]*\[\s*(['"])\$\1|left\s*:\s*(['"])\$\2\s*,\s*right/.test(config);
  const delimiters = /mathjax|katex/i.test(config) && new RegExp(String.raw`\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|(\\begin\{((?:equation|align|alignat|gather|multline|eqnarray|flalign)\*?)\}[\s\S]+?\\end\{\4\})|\\\(([\s\S]+?)\\\)`
    + (dollars ? String.raw`|(?<![\\$\w])\$(?=\S)([^$]+?)(?<=[^\s\\])\$(?![\w$])` : ''), 'g');
  const runs = []; // lines of text, with the breaks between them
  if (delimiters) {
    const skip = 'script, style, code, pre, kbd, samp, textarea, math, svg, title';
    for (const el of [doc.body, ...doc.body.querySelectorAll(`:not(${skip})`)]) {
      if (el.closest(skip)) continue;
      let run = [];
      for (const n of [...el.childNodes, null]) {
        if (n && (n.nodeType === 3 || n.localName === 'br')) { run.push(n); continue; }
        const text = run.map(r => r.nodeType === 3 ? r.data : '\n').join('');
        if (delimiters.test(text)) runs.push([run, text]);
        delimiters.lastIndex = 0;
        run = [];
      }
    }
  }
  if (tex.length || runs.length) {
    const { default: temml } = await import('../vendor/temml.js');
    const typeset = (source, display) => { // the TeX stays as an annotation, so the page's text still measures the same
      const t = doc.createElement('template');
      t.innerHTML = temml.renderToString(source.trim(), { displayMode: display, throwOnError: false, annotate: true });
      return t.content.firstChild;
    };
    for (const [el, source, display] of tex) el.replaceWith(typeset(source, display));
    const lines = text => text.split('\n').flatMap((line, i) => i ? [doc.createElement('br'), line] : [line]);
    for (const [run, text] of runs) {
      const parts = [];
      let at = 0;
      for (const m of text.matchAll(delimiters)) {
        const display = m[1] ?? m[2] ?? m[3];
        parts.push(...lines(text.slice(at, m.index)), typeset(display ?? m[5] ?? m[6], display != null));
        at = m.index + m[0].length;
      }
      run[0].before(...parts, ...lines(text.slice(at)));
      run.forEach(n => n.remove());
    }
  }
  // Readability knows MathML as inline only by an HTML element's name, which MathML elements
  // don't have; in a span, a formula stays in its sentence.
  for (const math of doc.querySelectorAll('math')) {
    const span = doc.createElement('span');
    math.replaceWith(span);
    span.append(math);
  }
}

// A paper LaTeXML made from its LaTeX source (arXiv's HTML papers) is an article already: its
// formulas are MathML, its figures, tables and notes are marked as such. What LaTeXML's own
// stylesheet would do is done here instead.
const LTX_STYLES = {
  ltx_font_bold: 'font-weight:bold', ltx_font_italic: 'font-style:italic', ltx_font_typewriter: 'font-family:monospace',
  ltx_font_smallcaps: 'font-variant:small-caps', ltx_align_center: 'text-align:center', ltx_centering: 'text-align:center',
  ltx_align_right: 'text-align:right', ltx_align_left: 'text-align:left', ltx_p: 'display:block',
};
function latexml(root) {
  const doc = root.ownerDocument;
  for (const el of root.querySelectorAll('.ltx_ERROR')) el.remove(); // a command it couldn't convert, shown raw
  for (const [cls, style] of Object.entries(LTX_STYLES)) for (const el of root.getElementsByClassName(cls)) el.style.cssText += `;${style}`;

  // Displayed equations are tables: a row per line, its parts in cells aligned right and left
  // (an align environment), its number at the edge. Each becomes one formula of the same rows
  // and columns, with its number after it (which ebis sets at the margin); when several lines
  // are numbered, each number stays on its line.
  const M = (tag, attrs = {}, ...kids) => {
    const el = doc.createElementNS(MATHML, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  };
  const formula = cell => [...cell.childNodes].flatMap(n => n.localName === 'math'
    ? [...(n.querySelector('semantics') || n).children].filter(c => !/^annotation/.test(c.localName))
    : n.textContent.trim() ? [M('mtext', {}, n.textContent.trim())] : []);
  const align = td => /ltx_align_right/.test(td.className) ? 'r' : /ltx_align_left/.test(td.className) ? 'l' : 'c';
  for (const table of root.querySelectorAll('table.ltx_equation, table.ltx_equationgroup')) {
    if (table.parentElement.closest('table.ltx_equation, table.ltx_equationgroup')) continue;
    const rows = [...table.querySelectorAll('tr')].filter(tr => tr.querySelector('math'));
    const numbers = [...table.querySelectorAll('.ltx_eqn_eqno')].filter(td => td.textContent.trim());
    const cells = tr => [...tr.cells].filter(td => !/ltx_eqn_(center|left|right)_pad|ltx_eqn_eqno/.test(td.className));
    const p = doc.createElement('p');
    p.id = table.id;
    if (numbers.length > 1) {
      p.append(M('math', { display: 'block' }, M('mtable', { class: 'eqs numbered', displaystyle: 'true' }, ...rows.map(tr => {
        const no = tr.querySelector('.ltx_eqn_eqno');
        return M('mtr', {}, M('mtd', { class: 's' }), ...cells(tr).map(td => M('mtd', { class: align(td) }, M('mrow', {}, ...formula(td)))),
          ...no ? [M('mtd', { class: 'n', rowspan: no.rowSpan }, M('mtext', {}, no.textContent.trim()))] : []);
      }))));
    } else {
      const single = rows.length === 1 && cells(rows[0]).length === 1 && rows[0].querySelector('math');
      const math = single || M('math', {}, M('mtable', { class: 'eqs', displaystyle: 'true' },
        ...rows.map(tr => M('mtr', {}, ...cells(tr).map(td => M('mtd', { class: align(td) }, M('mrow', {}, ...formula(td))))))));
      math.setAttribute('display', 'block');
      p.append(math, numbers[0]?.textContent.trim() || '');
    }
    table.replaceWith(p);
  }

  // A paragraph's heading (LaTeX's \\paragraph) runs into its paragraph, in bold, as on the page.
  for (const head of root.querySelectorAll('.ltx_title_paragraph')) {
    const p = head.parentElement.querySelector('.ltx_para .ltx_p');
    if (!p || head.nextElementSibling !== p.closest('.ltx_para')) continue;
    const b = doc.createElement('b');
    b.append(...head.childNodes);
    p.prepend(b, ' ');
    head.remove();
  }

  // A listing is lines: an algorithm's, numbered; a program's, as code.
  for (const listing of root.querySelectorAll('.ltx_listing')) {
    const lines = [...listing.querySelectorAll('.ltx_listingline')];
    if (!lines.length) continue;
    if (listing.closest('.ltx_float_algorithm') && !lines.some(l => l.querySelector('.ltx_font_typewriter'))) {
      const list = doc.createElement('ol');
      for (const line of lines) {
        line.querySelector('.ltx_tag_listingline')?.remove();
        list.append(doc.createElement('li'));
        list.lastChild.append(...line.childNodes);
      }
      listing.replaceWith(list);
    } else {
      const pre = doc.createElement('pre');
      pre.textContent = lines.map(l => l.textContent.replace(/\s+$/, '')).join('\n');
      listing.replaceWith(pre);
    }
  }

  // Notes hide in the sentence until hovered; each becomes a numbered link to its text, set
  // after the paragraph it belongs to (where ebis shows it when the number is touched).
  let n = 0;
  for (const note of root.querySelectorAll('.ltx_note')) {
    const mark = note.classList.contains('ltx_role_footnotetext') ? '' : note.querySelector('.ltx_note_mark')?.textContent.trim() || '';
    const body = note.querySelector('.ltx_note_content');
    body?.querySelectorAll('.ltx_note_mark, .ltx_note_type, .ltx_tag_note').forEach(el => el.remove());
    const sup = doc.createElement('sup');
    if (body?.textContent.trim()) {
      const aside = doc.createElement('aside');
      aside.id = note.id || `ltx-note-${n++}`;
      aside.append(mark ? `${mark} ` : '', ...body.childNodes);
      let after = note.closest('.ltx_para, figure, li, table') || note.parentElement;
      while (after.nextElementSibling?.localName === 'aside') after = after.nextElementSibling;
      after.after(aside);
      if (mark) sup.innerHTML = `<a href="#${aside.id}">${escape(mark)}</a>`;
    } else sup.textContent = mark;
    note.replaceWith(...mark ? [sup] : []);
  }

  // The title and authors are set on ebis's own title page.
  const title = tidy(root.querySelector('.ltx_title_document')?.textContent);
  const authors = [...root.querySelectorAll('.ltx_personname')].map(p => tidy(p.firstChild?.textContent)).filter(Boolean);
  root.querySelector('.ltx_authors')?.remove();
  return { title, byline: authors.join(', '), content: root, textContent: root.textContent, siteName: '' };
}

const tidy = s => (s || '').replace(/\s+/g, ' ').trim();

// The text as a browser sets it: outside preformatted text, a run of spaces and line breaks is
// one space. Readability measures some things as written (a byline is under 100 characters),
// and a page's indentation would count: a byline of 34 characters set across indented lines
// measures 115, and is passed over for the "By" inside it.
function asSet(doc) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.parentElement.closest('pre, textarea, code, script, style')) text.data = text.data.replace(/[ \t\n\r\f]+/g, ' ');
  }
  return doc;
}

// A page's title often carries its site's name ("Headline | Site"), which ebis sets on a line of its own.
function withoutSite(title, site) {
  const name = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`^${name}\\s+[|–—·•:-]\\s+|\\s+[|–—·•:-]\\s+${name}$`, 'i'), '') || title;
}

// Whether text names the article's own date, give or take a time zone.
const onDay = (text, when) => Math.abs(new Date(text) - when) < 2 * 864e5;

// A byline that ends with the article's own date (as many print it beside the name) gives it up,
// since the date has its line too.
function withoutDate(byline, when) {
  const words = byline.split(' ');
  for (let k = 1; k < words.length; k++) {
    if (onDay(words.slice(-k).join(' '), when)) return words.slice(0, -k).join(' ').replace(/[\s,·|–—-]+$/, '');
  }
  return byline;
}

// Text only screen readers are meant to hear, by its conventional classes: it never shows on the page.
const HIDDEN = ['sr-only', 'visually-hidden', 'screen-reader-text'];

// What Readability keeps that a reader of the article doesn't need: the title, byline and date, which
// ebis sets itself; blocks laid out twice in a row (once for phones, once for desktops); text only
// screen readers hear; pictures of people beside their names (the author's portrait, avatars); lists
// of links that lead to other pages (related stories) with the heading over them, and headings left
// with nothing under them; and a link that skips to the article itself.
function prune(root, { title, author }, when, url) {
  const text = el => tidy(el.textContent);
  const is = (s, what) => !!what && s.toLowerCase() === what.toLowerCase();
  const here = a => a.href.split('#')[0] === url.split('#')[0]; // Readability makes every link absolute
  let previous = '';
  for (const el of root.querySelectorAll('p, h1, h2, h3, h4, h5, h6')) {
    const t = text(el);
    if (t && (t === previous || is(t, title) || (/^by\s*/i.test(t) && is(t.replace(/^by\s*/i, ''), author)) || (t.length < 40 && onDay(t, when)))) el.remove();
    else if (t) previous = t;
  }
  for (const el of root.querySelectorAll(HIDDEN.map(c => `.${c}`).join())) el.remove();
  for (const a of root.querySelectorAll('a[href]:not(svg a)')) if (here(a) && /^[¶§#🔗]$/u.test(text(a))) a.remove(); // a permalink's mark
  for (const img of root.querySelectorAll('img')) if (/\bavatar\b/i.test(img.alt) || is(tidy(img.alt), author)) img.remove();
  const away = li => {
    const linked = [...li.querySelectorAll('a[href]')].filter(a => !here(a)).reduce((n, a) => n + text(a).length, 0);
    return linked > 0 && linked >= text(li).length * 0.8;
  };
  for (const list of root.querySelectorAll('ul, ol')) {
    if (list.children.length < 2 || ![...list.children].every(away)) continue;
    let box = list;
    while (box.parentElement !== root && [...box.parentElement.children].every(el => el === box || /^h\d$/.test(el.localName))) box = box.parentElement;
    box.remove();
  }
  for (const a of [...root.querySelectorAll('a[href*="#"]')].filter(here)) {
    const target = root.querySelector(`[id="${CSS.escape(decodeURIComponent(a.hash.slice(1)))}"]`);
    const block = a.closest('p, li, div');
    if (target && block && text(target).length > text(root).length / 2 && text(block) === text(a)) block.remove();
  }
  const between = (a, b) => { const r = root.ownerDocument.createRange(); r.setStartAfter(a); r.setEndBefore(b); return tidy(r.toString()); };
  let kept = null;
  for (const img of root.querySelectorAll('img')) {
    if (kept && img.alt && img.alt === kept.alt && !between(kept, img)) img.remove();
    else kept = img;
  }
  for (const figure of root.querySelectorAll('figure')) if (!figure.querySelector('img, svg, picture') && !text(figure)) figure.remove();
  const blocks = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, figure, img, table, pre, blockquote, dl')];
  blocks.reduceRight((next, el) => { // a heading must have something under it before the next heading of its rank
    const heading = /^h\d$/.test(el.localName);
    if (heading && (!next || (/^h\d$/.test(next.localName) && next.localName[1] <= el.localName[1]))) return el.remove(), next;
    return el;
  }, null);
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

// Article prose is long and sentence-shaped (in any script); markup is only prose when it holds paragraphs.
const prose = s => s.length > 600 && (looksLikeMarkup(s) ? /<p[\s>]/.test(s) : /[.!?]\s|[。！？]/.test(s));
const looksLikeMarkup = s => /^\s*</.test(s) && /<\/(p|div|h[1-6]|section|article)>/.test(s);

// The signature of a bot wall's challenge page (DataDome, Cloudflare, PerimeterX, Incapsula):
// its vendor's script or stock title. Ordinary pages can carry the same scripts, so this only
// ever gets consulted when no article could be found.
const botWall = doc => /captcha-delivery\.com|challenge-platform|px-captcha|_incapsula_|distil_ron|cf-chl-|<title[^>]*>\s*(just a moment|attention required|please wait|checking your browser)/i
  .test(doc.documentElement.innerHTML);

// An embedded candidate is the article only if some of what the page showed is part of it:
// a few samples from the visible text must appear in it too. When the page showed almost
// nothing, its description (written from the article) samples for it instead.
const sameText = (embedded, shown, description = '') => {
  const norm = s => textOf(s).replace(/\s+/g, ' ').toLowerCase();
  const full = norm(embedded), seen = norm(`${shown} ${description}`);
  if (seen.length < 60) return true;
  return [0.1, 0.4, 0.7].some(at => full.includes(seen.slice(Math.floor(seen.length * at), Math.floor(seen.length * at) + 60)));
};

// Markup becomes its text (tags and entities resolved); anything else is text already.
const textOf = s => {
  if (!looksLikeMarkup(s)) return s;
  const div = document.createElement('div');
  div.innerHTML = s;
  return div.textContent;
};

// Plain text: blank lines separate paragraphs and single line breaks are wrapping,
// unless there are no blank lines at all, in which case each line is a paragraph.
const asParagraphs = text => {
  text = text.replace(/\r\n?/g, '\n');
  const paras = text.split(/\n\s*\n/.test(text) ? /\n\s*\n/ : '\n').map(p => p.trim()).filter(Boolean);
  return paras.map(p => `<p>${escape(p).replace(/\n/g, ' ')}</p>`).join('');
};
const textSource = text => ({ meta: {}, cover: null, toc: null, sections: [{ load: () => ({ html: asParagraphs(text) }) }], resolve: () => null });

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
