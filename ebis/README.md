# ebis

A quiet reader for books, papers and articles, at [paulscotti.com/ebis](https://www.paulscotti.com/ebis/).
Named for the ibis of Thoth, scribe of the gods; set in [Libron](https://github.com/nicoverbruggen/libron).

## How it works

Everything you add becomes the same thing: a package of chapters in a small, semantic HTML
that ebis typesets itself.

- `js/sources.js` reads a file or a link. Ebooks (EPUB, MOBI/AZW3, FB2, CBZ) go through
  [foliate-js](https://github.com/johnfactotum/foliate-js); web pages through Mozilla's Readability —
  and a paywalled page usually still ships its whole article in the raw HTML (a schema.org
  `articleBody` block, or the JSON state its app boots from), in which case that is read
  instead of the taste the page shows. An arXiv link opens the paper's HTML edition, which
  LaTeXML made from its LaTeX, so its tables are tables and its formulas MathML. PDFs go
  through `js/pdf.js`, which rebuilds paragraphs from PDF.js's positioned text and cuts
  figures, tables and displayed equations from the rendered page, each with its caption or
  number; line art cut in gray is drawn as ink, so it follows the theme.
- Formulas are MathML, set in [Latin Modern Math](https://www.gust.org.pl/projects/e-foundry/lm-math).
  TeX that a page leaves for MathJax or KaTeX to typeset in the browser is typeset as it is
  read, by [Temml](https://temml.org).
- `js/convert.js` mounts each document in a hidden frame so the browser resolves its CSS, then keeps
  only what a reader notices: structure, emphasis, alignment, images, links.
- `js/reader.js` lays out one chapter at a time as a single page you scroll. A position is
  `[chapter, block, character]`, so it survives any device, type size or theme.
- `js/store.js` keeps the library in IndexedDB and syncs it with the worker.

To keep a page you are reading — one a paywall shows only to a logged-in browser — drag the
"Save to Ebis" bookmarklet from the Add sheet to your bookmarks bar. Clicked on an article,
it opens ebis at `#/clip` and posts it the page's rendered HTML, which is read like any other page.

## Sync (Cloudflare, personal account)

ebis is Paul's alone. It opens once its password has been typed on a device, and every request
to the worker carries it. `worker/` is the `ebis` Worker at `ebis.scottibrain.workers.dev`:
records replicate last-write-wins through D1, book packages live in R2, and
`/fetch` reads web pages for the reader.

```
cd worker
npx wrangler deploy              # after changing src/index.js
npx wrangler secret put KEY      # to change the password
```

## Changing the app

Bump `VERSION` in `sw.js` whenever files change, so installed copies update.
Develop with any static server at the repository root; on `localhost` the app talks to
`npx wrangler dev` (with `KEY=…` in `worker/.dev.vars`) instead of the deployed worker.
