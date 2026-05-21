const CACHE = 'auth-cache-v1';
const URLS = ['/', '/index.html', '/css/style.css', '/js/totp.js', '/js/qr.js', '/js/ui.js', '/js/app.js', '/js/wallet.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
