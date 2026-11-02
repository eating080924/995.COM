const CACHE_NAME = 'sw-static-v3';
const STATIC_ASSETS = ['/logo.png', '/icon-192.png', '/icon-512.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
    ])
  );
});

// Listen to messages from foreground main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200, 100, 200],
        renotify: true,
        ...options,
      }).catch((e) => console.warn('Foreground notification error:', e))
    );
  }
});

// Listen to push events from Web Push (background delivery when phone is locked or sleeping)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '任務通知 🚀', body: event.data.text() };
    }
  }

  const title = data.title || '新通知 🚀';
  const shortTag = data.tag || ('task-' + (data.taskNum || Date.now()));
  const options = {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: shortTag,
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      url: data.url || '/',
      taskId: data.taskId,
      taskNum: data.taskNum,
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('Standard showNotification failed, using fallback:', err);
      return self.registration.showNotification(title, {
        body: data.body || '',
        data: { url: '/' },
      });
    })
  );
});

// Handle notification click to focus existing tab or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
