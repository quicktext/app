// QuickText Voice Pro - Service Worker
const CACHE_NAME = 'quicktext-v1.0.0';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/speech.js',
  '/js/translation.js',
  '/js/ai.js',
  '/js/storage.js',
  '/js/pdf-handler.js',
  '/js/audio-export.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Installation
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Strategie Network First avec fallback cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Ignorer les requetes API
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('openrouter.ai') ||
      event.request.url.includes('translate.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            return new Response('Hors ligne', { status: 503 });
          });
      })
  );
});
