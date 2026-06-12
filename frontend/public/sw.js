// Service Worker for FAMMY - Notifications & Caching
//
// CACHE_NAME — auto-bumpato a ogni build di produzione dal plugin Vite
// `swCacheBust` (vedi vite.config.js). In dev mode resta literal
// `__BUILD_VERSION__` (innocuo, il SW non viene installato).
//
// Quando il browser scarica un sw.js diverso → entra in "waiting" →
// UpdateBanner del client mostra il toast "App aggiornata · ricarica".
const BUILD_VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `fammy-${BUILD_VERSION}`;
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

// Fetch strategy: NETWORK-FIRST per index.html e API
//   La causa #1 di "ho fatto deploy ma la app non si aggiorna" è che il
//   browser serve dalla cache vecchia. Con network-first sull'HTML, ad ogni
//   apertura proviamo prima il network → se OK aggiorna anche la cache.
//   Per gli altri asset (JS/CSS hashed da Vite) il caching va bene.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Network-first per il documento HTML principale.
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Aggiorna la cache in background
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        } catch (_) {}
        return res;
      } catch (_) {
        // Offline → ripiega su cache
        const cached = await caches.match(req);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  // Per il resto: cache-first è OK perché Vite mette gli hash nei
  // filename (vendor.abc123.js), quindi cambia il nome ad ogni build.
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

    event.waitUntil((async () => {
      // 1) Mostra la notifica
      await self.registration.showNotification(data.title || 'Fammy', options);

      // 2) Incrementa il badge sull'icona dell'app (numerino rosso).
      //    Funziona su Chrome/Edge Android & macOS, e su iOS quando l'app
      //    è installata come PWA (Add to Home Screen, iOS 16.4+).
      try {
        if ('setAppBadge' in self.navigator) {
          // Conta le notifiche FAMMY ancora visibili come "non lette".
          const visible = await self.registration.getNotifications();
          const count = (visible || []).length || 1;
          await self.navigator.setAppBadge(count);
        }
      } catch (e) { /* badge api not available */ }
    })());
  } catch (e) {
    console.error('Push notification error:', e);
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  // Pulisci il badge quando l'utente clicca su una notifica.
  // Nota: alcune piattaforme richiedono `clearAppBadge`, altre supportano
  // anche `setAppBadge(0)`. Proviamo entrambi.
  try {
    if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge();
    else if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(0);
  } catch (e) { /* silent */ }

  if (event.action === 'close') {
    return;
  }

  // Per le notifiche con actions (es. follow-up urgenti), inoltra
  // l'action al client. Default = 'open'.
  const action = event.action || 'open';
  const data = event.notification.data || {};
  // Priorità: data.url custom > task_id/taskId > default home
  const customUrl = data.url || (
    data.task_id || data.taskId
      ? `/?task=${encodeURIComponent(data.task_id || data.taskId)}`
      : null
  );
  const targetUrl = customUrl || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Cerca una finestra FAMMY già aperta
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              action,
              data,
            });
            return client.focus();
          }
        }
        // Altrimenti apri nuova finestra al target diretto
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
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    try {
      if ('clearAppBadge' in self.navigator) self.navigator.clearAppBadge();
      else if ('setAppBadge' in self.navigator) self.navigator.setAppBadge(0);
    } catch (e) { /* silent */ }
    // Rimuovi anche le notifiche già consegnate: se restano nel centro
    // notifiche, il prossimo push le riconta e il badge riparte dal totale.
    try {
      const p = self.registration.getNotifications()
        .then((ns) => (ns || []).forEach((n) => n.close()))
        .catch(() => {});
      if (event.waitUntil) event.waitUntil(p);
    } catch (e) { /* silent */ }
  }
});

// Quando il browser ruota l'endpoint (es. aggiornamento del SO, cambio
// del push service), Chrome/Firefox emettono `pushsubscriptionchange`.
// Re-sottoscriviamo immediatamente con la stessa applicationServerKey,
// poi notifichiamo i client aperti per fare l'upsert nella tabella DB.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const oldSub = event.oldSubscription;
      // Reuse l'application server key dal vecchio sub
      let appServerKey = null;
      if (oldSub) {
        appServerKey = oldSub.options?.applicationServerKey || null;
      }
      if (!appServerKey) return; // Senza key non possiamo re-sottoscrivere

      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });

      // Notifica tutti i client aperti che c'è una nuova subscription da salvare
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({
          type: 'PUSH_SUB_CHANGED',
          subscription: newSub.toJSON(),
        });
      }
    } catch (e) {
      // Silent: il prossimo open dell'app farà di nuovo register()
    }
  })());
});

