import { useState, useEffect } from 'react';

/**
 * Banner aggiornamento app — toast compatto in basso (non invasivo).
 * Monitora il Service Worker per nuove versioni disponibili.
 */
export default function UpdateBanner({ onDismiss }) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    let registration = null;

    const checkInterval = setInterval(async () => {
      try {
        const r = await navigator.serviceWorker.getRegistrations();
        if (r && r.length > 0) {
          registration = r[0];
          await registration.update();
        }
      } catch (e) { console.error('Error checking for SW updates:', e); }
    }, 30000);

    const onControllerChange = () => {
      if (!refreshing) { refreshing = true; setShowBanner(true); }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const checkForUpdates = async () => {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) {
          registration = r;
          if (r.waiting) {
            setShowBanner(true);
            r.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          r.addEventListener('updatefound', () => {
            const newWorker = r.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowBanner(true);
              }
            });
          });
        }
      } catch (e) { console.error('Error setting up SW listener:', e); }
    };
    checkForUpdates();

    return () => {
      clearInterval(checkInterval);
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
        <strong style={{ fontSize: 13, fontWeight: 700 }}>App aggiornata</strong>
        <span style={{ opacity: 0.85, marginLeft: 6, fontSize: 12 }}>· tocca per ricaricare</span>
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
        🔄 Ricarica
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
