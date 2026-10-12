// Bump alongside config.version. Updates wait until the user reloads, preserving an active snack.
const CACHE = 'paisano-v4';
const FILES = ['./', './index.html', './paisano.js?v=4', './config.js?v=4', './figure.js?v=4', './paisano.css?v=4', './paisano.svg', '../ebis/fonts/Libron-Regular.woff2', '../ebis/fonts/Libron-Italic.woff2'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('message', e => { if (e.data === 'activate') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('paisano-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(e.request, { ignoreSearch: true });
    return cached || fetch(e.request);
  })());
});
