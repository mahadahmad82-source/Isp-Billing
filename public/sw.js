// Cache version — update karne se purana cache automatically delete hoga
const CACHE_VERSION = 'myisp-v' + Date.now();
const STATIC_CACHE = CACHE_VERSION;

// Install — minimal caching
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Immediately activate new SW
});

// Activate — purane sare caches delete karo
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Sab purane caches delete karo
          console.log('[SW] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[SW] All old caches cleared');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch — Network First strategy
// Pehle network se lo, agar internet nahi toh cache se
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls — kabhi cache mat karo
  if (event.request.url.includes('supabase.co')) return;

  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension')) return;

  // HTML pages ke liye — hamesha network se lo (cache-busting)
  if (event.request.mode === 'navigate' || 
      event.request.url.endsWith('.html') ||
      event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS/CSS assets — network first, cache fallback
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Baaki sab — network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
