// Hook che pulisce il "numerino rosso" (App Badge) quando l'utente
// apre/torna sull'app. Il badge viene impostato dal Service Worker
// alla ricezione di una push notification.
//
// Supporto:
//  - Chrome/Edge desktop & Android
//  - iOS 16.4+ (solo quando l'app è installata come PWA "Add to Home Screen")
//
// Senza una PWA installata, il browser ignora setAppBadge() silenziosamente.

import { useEffect } from 'react';

async function clearBadge() {
  // 1) Azzera il numerino rosso
  try {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    } else if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      await navigator.setAppBadge(0);
    }
  } catch (e) { /* silent */ }

  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // 2) Rimuovi anche le notifiche già consegnate (stile WhatsApp).
    //    FONDAMENTALE su iOS: se restano nel centro notifiche, al push
    //    successivo il SW le riconta tutte (getNotifications().length)
    //    e il badge "riparte" dal totale accumulato (es. 16) invece che da 1.
    const ns = await reg.getNotifications();
    (ns || []).forEach((n) => { try { n.close(); } catch (_) { /* ignore */ } });

    // 3) Belt & suspenders: chiedi anche al SW di azzerare il badge
    //    (reg.active copre il caso in cui controller non è ancora pronto).
    const target = navigator.serviceWorker.controller || reg.active;
    if (target) target.postMessage({ type: 'CLEAR_BADGE' });
  } catch (e) { /* silent */ }
}

export function useAppBadgeClear() {
  useEffect(() => {
    // Clear immediato al mount (utente ha aperto l'app)
    clearBadge();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') clearBadge();
    };
    const onFocus = () => clearBadge();
    // iOS PWA: al resume dallo standby a volte arriva solo pageshow
    const onPageShow = () => clearBadge();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}

export { clearBadge };
