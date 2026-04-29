const CACHE_NAME = 'pi-web-v2';
const CORE_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function() {
      self.skipWaiting();
    }).catch(function(err) {
      console.warn('[SW] install failed, continuing:', err);
      self.skipWaiting();
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        return key !== CACHE_NAME;
      }).map(function(key) {
        return caches.delete(key);
      }));
    }).then(function() {
      return self.clients.claim();
    }).catch(function(err) {
      console.warn('[SW] activate failed:', err);
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && (url.pathname.startsWith('/api') || url.pathname.startsWith('/events'))) {
    return;
  }

  const onFetchSuccess = function(response) {
    if (
      url.origin === self.location.origin &&
      response.ok &&
      response.type === 'basic' &&
      (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/'))
    ) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, copy);
      }).catch(function() {});
    }
    return response;
  };

  const onFetchError = function() {
    return caches.match(event.request).catch(function() {
      return null;
    }).then(function(cached) {
      if (cached) return cached;
      return caches.match('/').catch(function() {
        return null;
      }).then(function(root) {
        if (root) return root;
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      });
    });
  };

  event.respondWith(fetch(event.request).then(onFetchSuccess).catch(onFetchError));
});