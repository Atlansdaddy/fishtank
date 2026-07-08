// Habitat service worker: full offline play.
// Strategy: network-first for the game page (so updates arrive when online),
// falling back to cache when offline; cache-first for icons/manifest.
const CACHE = 'habitat-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // let cross-origin pass through

  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    // game page: freshest wins, cache as fallback + refresh the copy
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => { c.put('./index.html', copy.clone()); c.put('./', copy); });
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // everything else (icons, manifest): cache-first
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
