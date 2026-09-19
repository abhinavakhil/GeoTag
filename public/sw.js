// App shell cache so GeoTag opens offline. Reports already live in localStorage; AI models are cached by their own libraries.
// ponytail: cache-first for our own build files, network-first for everything else. Bump CACHE to drop old files.
const CACHE = 'geotag-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/app', '/manifest.webmanifest', '/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = url.origin === location.origin;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (own && (url.pathname.startsWith('/assets/') || url.pathname === '/icon.svg')) {
      const hit = await cache.match(e.request); if (hit) return hit;
      const res = await fetch(e.request); if (res.ok) cache.put(e.request, res.clone()); return res;
    }
    try {
      const res = await fetch(e.request);
      if (own && res.ok && e.request.mode === 'navigate') cache.put('/app', res.clone());
      return res;
    } catch {
      return (await cache.match(e.request)) || (e.request.mode === 'navigate' ? cache.match('/app') : Response.error());
    }
  })());
});
