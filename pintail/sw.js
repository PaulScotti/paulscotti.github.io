// Bump VERSION and the label in index.html with every change. An installed copy then offers "Update" and reloads into it.
const VERSION = 13;
const CACHE = 'pintail-' + VERSION;
// Not the manifest: Chrome reads it to install the app, so it always comes fresh from the network.
const FILES = ['./', 'pintail.js', 'todo.js', 'pintail.css', 'icons/pintail.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', '../ebis/fonts/Libron-Regular.woff2', '../ebis/fonts/Libron-Italic.woff2'];
// The HTTP cache may still hold the previous release's files.
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))));
self.addEventListener('message', e => { if (e.data === 'activate') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('pintail-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/pintail/api/')) return; // the worker's answers are never kept
  e.respondWith(caches.open(CACHE).then(cache => cache.match(e.request, { ignoreSearch: true })).then(hit => hit || fetch(e.request)));
});
