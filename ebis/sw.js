// Keeps ebis on the device so it opens without a connection, and receives what Android
// shares to it. Change VERSION whenever the app's files change.

const VERSION = 'ebis-9';
const APP = [
  './', 'ebis.css', 'manifest.webmanifest', 'icons/ibis.svg', 'icons/icon-192.png',
  'js/app.js', 'js/reader.js', 'js/store.js', 'js/convert.js', 'js/sources.js', 'js/pdf.js', 'js/settings.js', 'js/ui.js',
  'fonts/Libron-Regular.woff2', 'fonts/Libron-Italic.woff2', 'fonts/Libron-Bold.woff2', 'fonts/Libron-BoldItalic.woff2',
  'vendor/fflate.js', 'vendor/readability.js', 'vendor/foliate/epub.js', 'vendor/foliate/epubcfi.js',
  'vendor/foliate/mobi.js', 'vendor/foliate/fb2.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'ebis-shared').map(k => caches.delete(k)))));
});

self.addEventListener('message', event => {
  if (event.data === 'update') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.method === 'POST' && url.pathname.endsWith('/share')) return event.respondWith(receive(request));
  if (request.method !== 'GET') return;
  // The app's own files come from the cache; anything else it asks for is kept once fetched.
  const key = request.mode === 'navigate' ? './' : request;
  event.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  }));
});

// A link or a file shared from another app waits in a cache until the library picks it up.
async function receive(request) {
  const form = await request.formData();
  const cache = await caches.open('ebis-shared');
  for (const file of form.getAll('file')) {
    if (file.size) await cache.put(`shared/${crypto.randomUUID()}`, new Response(file, { headers: { 'x-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' } }));
  }
  const text = [form.get('url'), form.get('text'), form.get('title')].filter(Boolean).join(' ');
  if (text) await cache.put(`shared/${crypto.randomUUID()}`, new Response(text));
  return Response.redirect('./#/shared', 303);
}
