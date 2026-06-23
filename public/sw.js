// public/sw.js — MYISP service worker.
// This file was referenced by index.html but never actually existed, so every
// /sw.js request fell through to the SPA catch-all rewrite and got served index.html
// instead of real JavaScript. That silently broke service worker registration, which
// meant push notifications could never reliably arrive (this is the root cause of the
// "notifications sometimes don't come" issue).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Real, live push notification — fires even if the app/tab is closed.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch (e) {
      data = { title: 'MYISP', body: event.data ? event.data.text() : 'New notification' };
    }

    const title = data.title || 'MYISP';
    const tag = data.tag || 'myisp-default';
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
