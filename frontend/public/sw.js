// Service Worker for FAMMY - Notifications & Caching

const CACHE_NAME = 'fammy-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
];

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(() => {}) // Ignore errors, offline support is optional
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Push notification handler
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nuovo evento in Fammy',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: data.tag || 'fammy-notification',
      requireInteraction: false,
      actions: [
        { action: 'open', title: 'Apri' },
        { action: 'close', title: 'Chiudi' },
      ],
      data: data.data || {},
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Fammy', options)
    );
  } catch (e) {
    console.error('Push notification error:', e);
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Cerca una finestra FAMMY già aperta
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICK', data: event.notification.data || {} });
            return client.focus();
          }
        }
        // Altrimenti apri nuova finestra
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// Sync per le notifiche programmate (quando il device torna online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-event-notifications') {
    event.waitUntil(syncEventNotifications());
  }
});

async function syncEventNotifications() {
  // Questa funzione verrà chiamata periodicamente per verificare gli eventi
  // Il client invierà i dati necessari tramite postMessage
}

// Message handler per comunicazioni dal client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
