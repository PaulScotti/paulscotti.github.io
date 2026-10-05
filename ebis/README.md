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
  instead of the taste the page shows; PDFs through `js/pdf.js`, which rebuilds paragraphs
  from PDF.js's positioned text and cuts figures (and text set like a figure: tables,
  equations) from the rendered page.
- `js/convert.js` mounts each document in a hidden frame so the browser resolves its CSS, then keeps
  only what a reader notices: structure, emphasis, alignment, images, links.
- `js/reader.js` lays out one chapter at a time as a single page you scroll. A position is
  `[chapter, block, character]`, so it survives any device, type size or theme.
- `js/store.js` keeps the library in IndexedDB and syncs it with the worker.

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
