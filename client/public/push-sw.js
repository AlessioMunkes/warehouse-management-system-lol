// ─────────────────────────────────────────────────────────────
// client/public/push-sw.js
//
// Phone notifications, loaded into the service worker Workbox builds
// (vite.config.js: workbox.importScripts). Workbox's own worker only
// caches; this file adds the two events a push needs:
//
//   push              show the notification, and tell any open copy of
//                     the app so its bell and Packing dot refresh now
//                     rather than on the next poll.
//   notificationclick open the app where the notification points (the
//                     Packing tab), reusing an open window if there is
//                     one rather than starting a second copy.
// ─────────────────────────────────────────────────────────────
/* eslint-env serviceworker */

const DEFAULT_URL = '/noc/packing';

const tellOpenApps = async (message) => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((w) => w.postMessage(message));
  return windows;
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'New work on the floor';
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/pwa-192.png',
      // Same tag replaces the last floor alert instead of stacking a
      // pile of them; renotify still buzzes for the new one.
      tag: data.tag || 'floor-slips',
      renotify: true,
      data: { url: data.url || DEFAULT_URL },
    }),
    tellOpenApps({ type: 'push-received' }),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || DEFAULT_URL;
  const url = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      // The app moves itself there (no reload, nothing half-typed lost).
      open.postMessage({ type: 'push-open', url: path });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
