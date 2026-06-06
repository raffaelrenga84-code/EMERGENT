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
  }
});
