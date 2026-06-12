import { useState, useEffect } from 'react';

/**
 * Banner aggiornamento app — toast compatto in basso (non invasivo).
 * Monitora il Service Worker per nuove versioni disponibili.
 *
 * I testi sono HARD-CODED in 4 lingue qui dentro (NO i18n.jsx) per essere
 * robusti anche quando il bundle i18n in cache PWA è vecchio. Il banner
 * deve funzionare in ogni stato, anche prima del primo refresh post-deploy.
 */
const STRINGS = {
  it: { title: 'App aggiornata',  tap: '· tocca per ricaricare', reload: 'Ricarica' },
  en: { title: 'App updated',     tap: '· tap to reload',        reload: 'Reload' },
  fr: { title: 'App mise à jour', tap: '· tapote pour recharger',reload: 'Recharger' },
  de: { title: 'App aktualisiert',tap: '· tippe zum Neuladen',   reload: 'Neu laden' },
};

function pickLang() {
  try {
    const raw = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    const code = raw.split('-')[0];
    return STRINGS[code] ? code : 'en';
  } catch { return 'en'; }
}

export default function UpdateBanner({ onDismiss }) {
  const [showBanner, setShowBanner] = useState(false);
  const s = STRINGS[pickLang()];

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    let registration = null;
    const loadedAt = Date.now();

    // Auto-reload silenzioso se l'update arriva nei primi secondi dall'avvio
    // (nessun lavoro in corso da perdere). Banner solo per update mid-session.
    // Guard anti-loop: max 1 auto-reload per minuto.
    const maybeAutoReload = () => {
      if (Date.now() - loadedAt > 15000) return false;
      try {
        const last = Number(sessionStorage.getItem('fammy_auto_reload_at') || 0);
        if (Date.now() - last < 60000) return false;
        sessionStorage.setItem('fammy_auto_reload_at', String(Date.now()));
      } catch (_) { /* sessionStorage non disponibile: meglio non rischiare loop */ return false; }
      window.location.reload();
      return true;
    };

    const checkInterval = setInterval(async () => {
      try {
        const r = await navigator.serviceWorker.getRegistrations();
        if (r && r.length > 0) {
          registration = r[0];
          await registration.update();
        }
      } catch (e) { console.error('Error checking for SW updates:', e); }
    }, 30000);

    // Check anche al rientro sull'app (visibility change). Cattura il caso
    // PWA installata: l'utente apre la home, l'app era in background, e
    // nel frattempo è stato deployato un update.
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) await r.update();
      } catch (e) { /* silent */ }
    };
    document.addEventListener('visibilitychange', onVisible);

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      if (!maybeAutoReload()) setShowBanner(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const checkForUpdates = async () => {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) {
          registration = r;
          if (r.waiting) {
            // Update già pronto all'avvio: attivalo; il controllerchange
            // farà l'auto-reload silenzioso (o mostrerà il banner se tardi).
            r.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          r.addEventListener('updatefound', () => {
            const newWorker = r.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (!maybeAutoReload()) setShowBanner(true);
              }
            });
          });
        }
      } catch (e) { console.error('Error setting up SW listener:', e); }
    };
    checkForUpdates();

    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const handleReload = () => window.location.reload();
  const handleDismiss = () => { setShowBanner(false); onDismiss?.(); };

  if (!showBanner) return null;

  return (
    <div
      data-testid="update-banner"
      style={{
        position: 'fixed',
        // Sopra la tab-bar (che è fissa in basso) ma sotto il FAB AI
        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        left: 12, right: 12,
        background: 'var(--k)',
        color: 'white',
        padding: '12px 14px',
        borderRadius: 14,
        fontSize: 13,
        lineHeight: 1.4,
        boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
        zIndex: 950,
        display: 'flex', alignItems: 'center', gap: 10,
        animation: 'slideUpFade 0.28s ease-out',
        maxWidth: 480, margin: '0 auto',
      }}
    >
      <style>{`
        @keyframes slideUpFade {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <span style={{ fontSize: 18 }}>✨</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</strong>
        <span style={{ opacity: 0.85, marginLeft: 6, fontSize: 12 }}>{s.tap}</span>
      </div>
      <button
        onClick={handleReload}
        data-testid="update-banner-reload"
        style={{
          background: 'var(--ac)',
          border: 'none', color: 'white',
          padding: '7px 12px', borderRadius: 100,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
        🔄 {s.reload}
      </button>
      <button
        onClick={handleDismiss}
        data-testid="update-banner-dismiss"
        aria-label="Chiudi"
        style={{
          background: 'transparent', border: 'none', color: 'white',
          fontSize: 16, cursor: 'pointer', padding: '4px 6px',
          opacity: 0.7, lineHeight: 1,
        }}>
        ✕
      </button>
    </div>
  );
}
