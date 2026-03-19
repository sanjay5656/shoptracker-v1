// ShopTracker Service Worker v1
const CACHE = 'shoptracker-v1';

const STATIC = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const apiPaths = ['/categories','/sales','/purchases','/dashboard','/api'];
  if (apiPaths.some(p => url.pathname.startsWith(p))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({error:'offline'}), {headers:{'Content-Type':'application/json'}})
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200)
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
