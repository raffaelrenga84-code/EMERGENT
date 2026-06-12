import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';
import './styles-v3.css';

/**
 * Hard reset escape hatch — utile quando un utente è bloccato da:
 *   - Service Worker cached con bug fixati nelle versioni successive
 *   - localStorage con token invito già consumato che blocca il flow
 *   - Cookie / IndexedDB stale
 *
 * Trigger: apri l'URL con `?reset=1`. Esempio:
 *   https://www.farxer.com/?reset=1
 *
 * Esegue un wipe completo del client (lato browser only, niente DB) e
 * ricarica la home pulita. L'utente dovrà rifare il login normale.
 */
async function maybeHardReset() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') !== '1') return;

    // 1. Svuota localStorage e sessionStorage
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }

    // 2. Cancella tutti i Service Worker
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    // 3. Svuota tutte le cache (PWA cache)
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // 4. Cancella IndexedDB (se presente; alcuni browser non supportano databases())
    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map((d) => d.name && indexedDB.deleteDatabase(d.name)));
      }
    } catch { /* ignore */ }

    // 5. Redirect alla home pulita
    window.location.replace('/');
  } catch (e) {
    // Anche se qualcosa fallisce, va alla home pulita
    window.location.replace('/');
  }
}

maybeHardReset().finally(() => {
  // Se non c'era `?reset=1`, monta normalmente l'app
  if (!new URLSearchParams(window.location.search).has('reset')) {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );

    // ------------------------------------------------------------------
    // iOS Soft-Keyboard fix:
    // quando l'utente focalizza un input/textarea dentro a un .modal,
    // la tastiera virtuale appare ma iOS non scrolla automaticamente
    // l'input dentro l'area visibile del modal. Risultato: titoli e
    // bottoni in basso vengono nascosti dalla tastiera.
    //
    // Strategy:
    //  - Su focusin, se il target è dentro a un .modal, dopo 200ms
    //    (per dare il tempo alla tastiera di aprirsi) chiama
    //    scrollIntoView({ block: 'center' }).
    //  - Usa visualViewport (Safari iOS 13+) per leggere la nuova altezza
    //    visibile e calcolare correttamente il centro.
    // ------------------------------------------------------------------
    const handleFocus = (e) => {
      const el = e.target;
      if (!el || typeof el.scrollIntoView !== 'function') return;
      const isField = el.matches?.('input, textarea, [contenteditable="true"]');
      if (!isField) return;
      const inModal = el.closest?.('.modal');
      if (!inModal) return;
      setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch { /* ignore */ }
      }, 250);
    };
    document.addEventListener('focusin', handleFocus, { passive: true });

    // ------------------------------------------------------------------
    // iOS PWA white-screen watchdog:
    // al rientro da app esterne (share sheet, WhatsApp, fotocamera) WebKit
    // a volte ripristina la pagina in stato "morto" → schermo bianco che
    // costringe a chiudere l'app. Tre contromisure:
    //  1) pageshow con persisted=true (bfcache) → reload pulito
    //  2) al ritorno visibile, se il root React è vuoto → reload
    //  3) nudge di repaint (iOS può congelare il compositing al rientro)
    // ------------------------------------------------------------------
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) window.location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      setTimeout(() => {
        const root = document.getElementById('root');
        if (root && root.childElementCount === 0) {
          window.location.reload();
          return;
        }
        // Forza un repaint del compositor
        document.body.style.transform = 'translateZ(0)';
        requestAnimationFrame(() => { document.body.style.transform = ''; });
      }, 300);
    });
  }
});
