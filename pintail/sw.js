// Bump VERSION with every change to the app. An installed copy then offers "Update" and reloads into it.
const VERSION = 3;
const CACHE = 'pintail-' + VERSION;
const FILES = ['./', 'pintail.js', 'todo.js', 'pintail.css', 'manifest.webmanifest', 'icons/pintail.svg', 'icons/icon-192.png', '../ebis/fonts/Libron-Regular.woff2', '../ebis/fonts/Libron-Italic.woff2'];
// The HTTP cache may still hold the previous release's files.
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))));
self.addEventListener('message', e => { if (e.data === 'activate') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('pintail-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(cache => cache.match(e.request, { ignoreSearch: true })).then(hit => hit || fetch(e.request)));
});
