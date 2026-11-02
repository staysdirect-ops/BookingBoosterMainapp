// Bookingbooster host app service worker. Keeps the console and phone view opening when the signal drops:
// pages come from the network first and fall back to the last copy; hashed assets are cached for good.
// Account data (/api/) is never cached here.
const CACHE = 'bb-app-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/app/offline']).catch(() => {}))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (/^\/assets\/(app|prod)\.[a-z0-9]+\.(css|js)$/.test(u.pathname) || u.pathname.startsWith('/assets/icons/')) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; })));
    return;
  }
  if (r.mode === 'navigate' && (u.pathname === '/app' || u.pathname === '/app/phone')) {
    e.respondWith(fetch(r).then(res => { if (res.ok && !res.redirected) { const c = res.clone(); caches.open(CACHE).then(x => x.put(u.pathname, c)); } return res; })
      .catch(() => caches.match(u.pathname).then(hit => hit || caches.match('/app/offline'))));
  }
});
