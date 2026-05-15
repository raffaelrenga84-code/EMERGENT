import { useState, useEffect } from 'react';

/**
 * Banner che mostra quando l'app è stata aggiornata
 * Monitora il Service Worker per nuove versioni disponibili
 */
export default function UpdateBanner({ onDismiss }) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    let registration = null;

    // Controlla gli aggiornamenti del SW ogni 30 secondi
    const checkInterval = setInterval(async () => {
      try {
        const r = await navigator.serviceWorker.getRegistrations();
        if (r && r.length > 0) {
          registration = r[0];
          await registration.update();
        }
      } catch (e) {
        console.error('Error checking for SW updates:', e);
      }
    }, 30000);

    // Listener per quando un nuovo SW è in attesa
    const onControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        setShowBanner(true);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Listener sul registration per SW waiting
    const checkForUpdates = async () => {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) {
          registration = r;
          // Se c'è un SW in waiting, mostrava banner
          if (r.waiting) {
            setShowBanner(true);
            // Comunica al SW in waiting di prendere il controllo
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
      } catch (e) {
        console.error('Error setting up SW listener:', e);
      }
    };

    checkForUpdates();

    return () => {
      clearInterval(checkInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const handleReload = () => {
    // Ricarica la pagina per applicare il nuovo SW
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowBanner(false);
    onDismiss?.();
  };

  if (!showBanner) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--am) 0%, var(--tc) 100%)',
        color: 'white',
        padding: '16px 16px',
        borderRadius: '12px 12px 0 0',
        margin: '-16px -16px 16px -16px',
        fontSize: 14,
        lineHeight: 1.6,
        animation: 'slideDown 0.3s ease-out',
        boxShadow: '0 4px 12px rgba(232, 165, 0, 0.2)',
      }}
    >
      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: 4, fontSize: 16, fontWeight: 700 }}>✨ App aggiornata!</strong>
          <div style={{ fontSize: 13, opacity: 0.95, marginBottom: 10, lineHeight: 1.4 }}>
            Nuove funzionalità e miglioramenti disponibili.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleReload}
              style={{
                background: 'rgba(255,255,255,0.25)',
                border: '1px solid rgba(255,255,255,0.4)',
                color: 'white',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.35)'}
              onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.25)'}
            >
              🔄 Ricarica ora
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: 0.85,
              }}
            >
              Dopo
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: 20,
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
