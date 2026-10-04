# ebis

A quiet reader for books, papers and articles, at [paulscotti.com/ebis](https://www.paulscotti.com/ebis/).
Named for the ibis of Thoth, scribe of the gods; set in [Libron](https://github.com/nicoverbruggen/libron).

## How it works

Everything you add becomes the same thing: a package of chapters in a small, semantic HTML
that ebis typesets itself.

- `js/sources.js` reads a file or a link. Ebooks (EPUB, MOBI/AZW3, FB2, CBZ) go through
  [foliate-js](https://github.com/johnfactotum/foliate-js); web pages through Mozilla's Readability;
  PDFs through `js/pdf.js`, which rebuilds paragraphs from PDF.js's positioned text and cuts
  figures (and text set like a figure: tables, equations) from the rendered page.
- `js/convert.js` mounts each document in a hidden frame so the browser resolves its CSS, then keeps
  only what a reader notices: structure, emphasis, alignment, images, links.
- `js/reader.js` lays out one chapter at a time in CSS columns. A position is
  `[chapter, block, character]`, so it survives any device, type size or theme.
- `js/store.js` keeps the library in IndexedDB and, when signed in, syncs it with the worker.

## Sync (Cloudflare, personal account)

`worker/` is the `ebis` Worker at `ebis.scottibrain.workers.dev`: one D1 table of records
(books, positions, highlights, open tabs) replicated last-write-wins, book packages in the R2
bucket `ebis-library`, and `/fetch`, which reads web pages for the reader.

```
cd worker
npx wrangler deploy              # after changing src/index.js
npx wrangler secret put KEY      # to change the library key
```

The key is in `worker/LIBRARY-KEY.txt` (not committed). Opening `/ebis/#key=…` once signs a device in.

## Changing the app

Bump `VERSION` in `sw.js` whenever files change, so installed copies update.
Develop with any static server at the repository root; on `localhost` the app talks to
`npx wrangler dev` (with `KEY=…` in `worker/.dev.vars`) instead of the deployed worker.
