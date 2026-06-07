// ZSKY service worker：离线壳缓存 + Web Push 通知。
const CACHE = 'zsky-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 静态资源网络优先、失败回退缓存；API 不缓存。
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/'))),
  );
});

// 她想你了 —— app 关着也推到通知中心。
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(d.title || 'ZSKY', {
      body: d.body || '',
      tag: d.life || 'zsky',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: d,
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) return c.focus();
      return self.clients.openWindow('/');
    }),
  );
});
