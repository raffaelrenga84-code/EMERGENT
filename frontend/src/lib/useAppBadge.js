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

function clearBadge() {
  try {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge();
    } else if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      navigator.setAppBadge(0);
    }
    // Notifica anche il SW (cleanup belt-and-suspenders)
    if (typeof navigator !== 'undefined' &&
        navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' });
    }
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

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}

export { clearBadge };
