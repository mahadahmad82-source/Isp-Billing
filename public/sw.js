
const CACHE_NAME = 'mahadnet-offline-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use a more robust addAll that doesn't fail the whole installation if one asset is missing
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // 2. IMPORTANT: Skip Supabase API calls to avoid "Failed to fetch" errors caused by 
  // service worker interception of authenticated requests or incompatible headers.
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Cache dynamic assets from esm.sh or cdns as they are loaded
        if (response.status === 200 && (event.request.url.includes('esm.sh') || event.request.url.includes('cdn'))) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    }).catch((err) => {
      console.error('SW Fetch Error:', err);
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
