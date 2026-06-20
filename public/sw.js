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
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'MYISP', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || 'MYISP';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-192x192.png',
    tag: data.tag || 'myisp-default',
    data: data.data || { url: '/' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
