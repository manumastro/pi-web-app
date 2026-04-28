const CACHE_NAME = 'pi-web-v2';
const CORE_ASSETS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api') || url.pathname.startsWith('/events'))) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const isStaticPwaAsset = url.origin === self.location.origin
          && response.ok
          && response.type === 'basic'
          && (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/'));

        if (isStaticPwaAsset) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }

        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  );
});
