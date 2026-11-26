/* =====================================================================
   HealthyRemake AI — service worker
   - L'app (index.html) est toujours prise sur le réseau en priorité :
     chaque ouverture affiche la dernière version publiée. Sans réseau,
     la dernière version gardée en cache s'ouvre (mode hors ligne).
   - Polices et photos des recettes : gardées en cache pour le hors ligne.
   - Le serveur IA / comptes et les flux YouTube ne passent jamais par le cache.
   ===================================================================== */
const APP_CACHE = 'hr-app-v2';
const ASSET_CACHE = 'hr-assets-v1';
const IMG_CACHE = 'hr-img-v1';
const IMG_MAX = 160;
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [APP_CACHE, ASSET_CACHE, IMG_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (_) { return Response.error(); }
}

async function staleImage(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then(async res => {
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - IMG_MAX; i++) await cache.delete(keys[i]);
    }
    return res;
  }).catch(() => hit || Response.error());
  return hit || update;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname))) { e.respondWith(networkFirst(req)); return; }
  if (same && /\.(png|webmanifest|js)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, ASSET_CACHE)); return; }
  if (url.hostname === 'images.unsplash.com' || url.hostname.endsWith('ytimg.com')) { e.respondWith(staleImage(req)); return; }
  // Tout le reste (serveur IA, comptes, flux vidéos) : réseau direct
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open', url: target }); return c.focus(); } }
    return self.clients.openWindow(target);
  })());
});
