// Habitat service worker: full offline play.
// Strategy: network-first for the game page (so updates arrive when online),
// falling back to cache when offline; cache-first for icons/manifest.
// v3: purge any v2 cache that may hold a bad page cached mid-deploy
const CACHE = 'habitat-v3';
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
      // 'no-cache' = revalidate with the server (GitHub Pages sends a 10-min
      // max-age; without this, updates lag behind the HTTP cache)
      fetch(e.request, { cache: 'no-cache' }).then((res) => {
        // never cache a bad page (a 404/partial cached mid-deploy = poisoned
        // PWA that stays broken offline)
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => { c.put('./index.html', copy.clone()); c.put('./', copy); });
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // everything else (icons, manifest): cache-first
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});

// ---- care nudges: read the save, project hunger forward, notify if needed ----
const SAVE_KEY = 'fishtank_save_v2';
function idbGet(key) {
  return new Promise((res) => {
    try {
      const r = indexedDB.open('habitat', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => {
        try {
          const q = r.result.transaction('kv').objectStore('kv').get(key);
          q.onsuccess = () => res(q.result || null);
          q.onerror = () => res(null);
        } catch (e) { res(null); }
      };
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}

async function careCheck() {
  const raw = await idbGet(SAVE_KEY);
  if (!raw) return;
  let s; try { s = JSON.parse(raw); } catch (e) { return; }
  const hours = (Date.now() - (s.lastSeen || Date.now())) / 3.6e6;
  if (hours < 6) return;                       // played recently — leave them be
  let hungry = false, danger = false, water = 1;
  for (const which of ['fresh', 'salt']) {
    const t = s.tanks && s.tanks[which]; if (!t) continue;
    water = Math.min(water, t.water ?? 1);
    for (const f of t.fish || []) {
      const h = Math.min(1, (f.hunger || 0) + hours / 16);   // mirrors SIM.HUNGER_HOURS
      if (h > 0.8) hungry = true;
      if (h >= 1 || (f.health ?? 1) < 0.45) danger = true;
    }
  }
  const show = (title, body) =>
    self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-180.png', tag: 'habitat-care' });
  if (danger) return show('😟 Your fish really need you!', 'Somebody is starving or sick — come help!');
  if (hungry) return show('🐟 Feeding time!', 'Your fish are getting hungry.');
  if (water < 0.4) return show('💧 Water check', 'The tank water is getting dirty.');
}

// Android/Chrome: fires every ~6+ hours with the app fully closed
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'care-check') e.waitUntil(careCheck());
});

// Push server (see push-server/): payload-less pings — we work out the right
// message locally from the real save, so the server never needs tank data.
self.addEventListener('push', (e) => {
  e.waitUntil(careCheck());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) =>
    list.length ? list[0].focus() : clients.openWindow('./')));
});
