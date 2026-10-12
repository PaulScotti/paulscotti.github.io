// Bump alongside config.version. Updates wait until the user reloads, preserving an active snack.
const CACHE = 'paisano-v5';
const ART = ["./assets/c-stink.webp","./assets/c-uta.webp","./assets/c-whiptail.webp","./assets/c-zebra.webp","./assets/c-horned.webp","./assets/c-centipede.webp","./assets/c-scorpion.webp","./assets/c-rattler.webp","./assets/c-clicker.webp","./assets/c-cicada.webp","./assets/c-sphinx.webp","./assets/c-longhorn.webp","./assets/c-spadefoot.webp","./assets/c-paloverde.webp","./assets/egg.webp","./assets/seed.webp","./assets/p-flowers.webp","./assets/p-creosote.webp","./assets/p-prickly.webp","./assets/p-mesquite.webp","./assets/sprout.webp","./assets/saguaro.webp"];
const FILES = [...ART, './', './index.html', './paisano.js?v=5', './config.js?v=5', './figure.js?v=5', './paisano.css?v=5', './assets/mark.png', './assets/birds.webp', '../ebis/fonts/Libron-Regular.woff2', '../ebis/fonts/Libron-Italic.woff2'];
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
