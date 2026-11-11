// Service worker: shows notifications and opens the app when one is tapped.
// If push alerts are switched on (NOTIFICATIONS.md), it also receives
// Firebase Cloud Messaging alerts while the app is closed.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Firebase Cloud Messaging (only when hub.html registers us with ?c=<config>)
try {
  const c = new URL(self.location.href).searchParams.get('c');
  if (c) {
    const config = JSON.parse(c);
    importScripts('https://www.gstatic.com/firebasejs/13.2.0/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging-compat.js');
    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    // Messages sent with a "notification" part are shown automatically.
    // Data-only messages are shown here.
    messaging.onBackgroundMessage(m => {
      if (m.notification) return;
      const d = m.data || {};
      self.registration.showNotification(d.title || 'New update', {body: d.body || '', tag: d.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', data: {url: d.url || 'hub.html'}});
    });
  }
} catch (e) { /* push stays off; pop-ups while the app is open still work */ }

self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || (e.notification.data && e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.data && e.notification.data.FCM_MSG.data.url) || 'hub.html';
  // [SEC-10] only ever open pages of this site
  try { if (new URL(url, self.location.href).origin !== self.location.origin) url = 'hub.html'; } catch { url = 'hub.html'; }
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const w of all) { if (w.url.includes('hub.html') || w.url.endsWith('/')) { await w.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
