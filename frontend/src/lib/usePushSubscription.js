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
  }, [session?.user?.id]);
}

// Helper: converte chiave VAPID base64-url in Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
