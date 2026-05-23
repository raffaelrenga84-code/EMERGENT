import { useEffect, useState } from 'react';

/**
 * ToastListener — ascolta gli eventi `fammy_toast` (custom event window)
 * e mostra una snackbar in basso per ~3.5s.
 * Coda interna se arrivano più toast in rapida sequenza.
 *
 * Uso: <ToastListener /> in App.jsx, poi da qualsiasi punto del codice:
 *   window.dispatchEvent(new CustomEvent('fammy_toast', {
 *     detail: { text: 'Ciao!', tone: 'success' }
 *   }))
 *
 * Tone: 'success' | 'info' | 'warning' | 'error' (default 'info').
 */
export default function ToastListener() {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail || {};
      if (!detail.text) return;
      setQueue((q) => [...q, {
        id: Date.now() + Math.random(),
        text: detail.text,
        tone: detail.tone || 'info',
      }]);
    };
    window.addEventListener('fammy_toast', handler);
    return () => window.removeEventListener('fammy_toast', handler);
  }, []);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const next = queue[0];
    setQueue((q) => q.slice(1));
    setActive(next);
    // Auto-dismiss: usiamo sia setTimeout (preferibile, tipico) sia un
    // fallback basato su `expiresAt` per quando la tab è in background
    // e setTimeout viene throttled (iOS PWA).
    const expiresAt = Date.now() + 3500;
    const tick = () => {
      if (Date.now() >= expiresAt) {
        setActive(null);
      } else {
        timer = window.setTimeout(tick, 500);
      }
    };
    let timer = window.setTimeout(tick, 3500);
    return () => window.clearTimeout(timer);
  }, [queue, active]);

  if (!active) return null;

  const toneStyles = {
    success: { background: '#1F4D2C', color: 'white' },
    info:    { background: '#1C1611', color: 'white' },
    warning: { background: '#B36E00', color: 'white' },
    error:   { background: '#8B2A1F', color: 'white' },
  };

  return (
    <div
      role="status"
      data-testid="fammy-toast"
      onClick={() => setActive(null)}
      style={{
        position: 'fixed',
        bottom: 'calc(74px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4000,
        ...toneStyles[active.tone],
        padding: '12px 18px',
        borderRadius: 100,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 14,
        fontWeight: 600,
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
        lineHeight: 1.35,
        animation: 'fammy-toast-in 200ms ease-out',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 10,
      }}>
      <span style={{ flex: 1 }}>{active.text}</span>
      <span aria-hidden="true" style={{
        fontSize: 14, opacity: 0.75, fontWeight: 700,
      }}>✕</span>
    </div>
  );
}
