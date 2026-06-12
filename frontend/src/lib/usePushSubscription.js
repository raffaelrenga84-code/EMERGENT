import { useEffect } from 'react';
import { supabase } from './supabase.js';

/**
 * Hook che registra una Web Push subscription per l'utente loggato.
 * Funziona solo se:
 *  - Browser supporta Push API + Service Worker
 *  - User ha concesso Notification permission
 *  - VITE_VAPID_PUBLIC_KEY è settata (chiave pubblica VAPID)
 *
 * Una volta registrata la subscription, l'endpoint è salvato in `push_subscriptions`.
 * L'Edge Function `send-push` lo userà per inviare notifiche anche ad app chiusa.
 */
export function usePushSubscription(session) {
  useEffect(() => {
    if (!session?.user?.id) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!VAPID_PUBLIC_KEY) {
      // VAPID non configurato: niente push reale (le notifiche foreground continuano a funzionare)
      return;
    }

    const register = async () => {
      try {
        // Aspetta il service worker pronto
        const registration = await navigator.serviceWorker.ready;

        // Permesso notifiche? (in alcune webview Notification non esiste)
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;
        }

        // Subscription esistente?
        let subscription = await registration.pushManager.getSubscription();

        // SAFETY: alcune subscription possono essere "scadute" (es. dopo
        // pulizia cache del browser). Le unsubscribe e ne creiamo una nuova
        // se il browser dichiara `expirationTime` passato.
        if (subscription && subscription.expirationTime && subscription.expirationTime < Date.now()) {
          try { await subscription.unsubscribe(); } catch (_) {}
          subscription = null;
        }

        if (!subscription) {
          // Nuova subscription
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        // Estrai chiavi
        const keys = subscription.toJSON().keys || {};
        const payload = {
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
          // last_used_at ad ogni apertura → la diagnostica mostra "ultima:
          // oggi" e su backend possiamo eventualmente fare GC delle stale
          // (più di 60gg) senza rischiare di cancellare device attivi.
          last_used_at: new Date().toISOString(),
        };

        // Upsert su Supabase (idempotente grazie a UNIQUE(user_id, endpoint))
        await supabase.from('push_subscriptions').upsert(payload, {
          onConflict: 'user_id,endpoint',
          ignoreDuplicates: false,
        });
      } catch (err) {
        console.warn('Push subscription failed:', err);
      }
    };

    register();

    // PWA-only: anche al rientro nell'app (visibilitychange) verifichiamo
    // che la subscription sia ancora valida. Se Chrome o iOS hanno ruotato
    // l'endpoint (succede dopo aggiornamenti del SO), facciamo un re-register.
    const onVisible = () => {
      if (document.visibilityState === 'visible') register();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Listener per il messaggio dal SW quando l'endpoint cambia
    // ("pushsubscriptionchange" event). Vedi /public/sw.js
    const onSWMessage = async (e) => {
      if (e.data?.type !== 'PUSH_SUB_CHANGED') return;
      const sub = e.data.subscription;
      if (!sub) return;
      await supabase.from('push_subscriptions').upsert({
        user_id: session.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh,
        auth: sub.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 200),
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint', ignoreDuplicates: false });
    };
    navigator.serviceWorker.addEventListener('message', onSWMessage);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('message', onSWMessage);
    };
  }, [session?.user?.id]);
}

// Helper: converte chiave VAPID base64-url in Uint8Array
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
