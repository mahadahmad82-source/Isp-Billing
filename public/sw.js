// public/sw.js — Bill Collector service worker.
// This file was referenced by index.html but never actually existed, so every
// /sw.js request fell through to the SPA catch-all rewrite and got served index.html
// instead of real JavaScript. That silently broke service worker registration, which
// meant push notifications could never reliably arrive (this is the root cause of the
// "notifications sometimes don't come" issue).

const MEDIA_CACHE = 'wabot-media-cache-v1';
// Matches every WhatsApp chat media file (images/voice/video, incoming or outgoing)
// stored in the public whatsapp-media bucket — same URL shape the WABot Inbox/
// Standalone PWA and the Android app both read from.
const MEDIA_URL_MARKER = '/storage/v1/object/public/whatsapp-media/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache-first for WhatsApp media — first view fetches from Supabase Storage and
// caches it; every view after that (same device, any tab, offline included) is
// served straight from the Cache Storage API with zero network/egress. Previously
// there was no fetch handler at all here, so every single scroll-past or thread
// reopen re-downloaded the same image/voice-note/video from Supabase again — this
// is what was driving Supabase egress up despite total stored media being small.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.includes(MEDIA_URL_MARKER)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const response = await fetch(req);
        if (response && response.ok) {
          cache.put(req, response.clone());
        }
        return response;
      } catch (e) {
        // Offline / network failure with nothing cached yet — nothing more we can do.
        return cached || Response.error();
      }
    })()
  );
});

// Real, live push notification — fires even if the app/tab is closed.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (e) {
      data = { title: 'Bill Collector', body: event.data ? event.data.text() : 'New notification' };
    }

    const title = data.title || 'Bill Collector';
    const tag = data.tag || 'bill-collector-default';
    let body = data.body || '';

    // WhatsApp-style stacking: if there's already a notification for this same
    // conversation (same tag) still sitting unseen, append the new message as a
    // new line instead of silently replacing it — so multiple unread messages
    // show line-by-line in one notification.
    try {
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length > 0 && existing[0].body) {
        const prevLines = existing[0].body.split('\n').filter(Boolean);
        body = [...prevLines, body].slice(-5).join('\n');
      }
    } catch (e) {}

    const options = {
      body,
      icon: data.icon || '/icon-192x192.png',
      badge: data.badge || '/icon-192x192.png',
      tag,
      data: data.data || { url: '/' },
      vibrate: [200, 100, 200],
      renotify: true,
    };

    return self.registration.showNotification(title, options);
  })());
});

// Tapping the notification focuses an existing tab if one is open, else opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
