/* DayForge V2 push service worker. Must be available at the site root. */
self.addEventListener('push', (event) => {
  let item = {};
  try { item = event.data ? event.data.json() : {}; } catch { item = {}; }
  const title = String(item.title || 'DayForge Reminder').slice(0, 120);
  const body = String(item.body || 'Waktunya cek progres kamu di DayForge.').slice(0, 240);
  const reminderId = typeof item.reminderId === 'string' ? item.reminderId : '';
  const deliveryId = typeof item.deliveryId === 'string' ? item.deliveryId : '';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/dayforge-notification-icon.svg',
    badge: '/dayforge-notification-icon.svg',
    tag: `dayforge-${deliveryId || reminderId || 'reminder'}`,
    renotify: false,
    data: {url: `/?reminder=${encodeURIComponent(reminderId)}`},
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const url = new URL(typeof raw === 'string' ? raw : '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const client = clients.find(c => new URL(c.url).origin === url.origin);
    if (client) { await client.focus(); if ('navigate' in client) await client.navigate(url.href); }
    else await self.clients.openWindow(url.href);
  })());
});
