import { useEffect, useRef, useState } from 'react';

/**
 * FabSpeedDial — bottone + flottante che apre un mini-menu radiale.
 *
 * Props:
 *  - actions: [{ id, icon, label, onClick, testid, color }]
 *  - testid: string per il root FAB
 *  - className: override className del FAB (default 'fab')
 */
export default function FabSpeedDial({ actions = [], testid = 'fab-speeddial', className = 'fab' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 50);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Single-action: shortcut diretto
  if (actions.length === 1) {
    const a = actions[0];
    return (
      <button
        className={className}
        onClick={() => a.onClick?.()}
        data-testid={a.testid || testid}>
        +
      </button>
    );
  }

  return (
    <div ref={rootRef} style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 900 }}>

      {/* Backdrop semi-trasparente quando aperto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(28,22,17,0.2)',
            backdropFilter: 'blur(2px)',
            zIndex: -1,
          }} />
      )}

      {/* Menu actions */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 16, bottom: 100,
            display: 'flex', flexDirection: 'column',
            gap: 10, alignItems: 'flex-end',
            pointerEvents: 'auto',
          }}>
          {actions.map((a, idx) => (
            <button
              key={a.id}
              data-testid={a.testid}
              onClick={() => { a.onClick?.(); setOpen(false); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '10px 16px 10px 10px',
                marginRight: 68,
                background: 'white',
                border: '1px solid rgba(229,225,216,0.8)',
                borderRadius: 100,
                boxShadow: '0 8px 24px rgba(28,22,17,0.14)',
                fontSize: 15, fontWeight: 700, color: 'var(--k)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                animation: `fammy-fab-pop 220ms cubic-bezier(.2,.8,.3,1) ${idx * 50}ms both`,
                minWidth: 180,
              }}>
              {/* Cerchio icona più grande e leggibile */}
              <span style={{
                width: 42, height: 42, borderRadius: '50%',
                background: a.color || 'var(--ac)',
                color: 'white',
                display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
                boxShadow: `0 4px 10px ${(a.color || 'var(--ac)')}44`,
              }}>{a.icon}</span>
              <span style={{ letterSpacing: '-0.01em' }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB principale */}
      <button
        className={className}
        onClick={() => setOpen((v) => !v)}
        data-testid={testid}
        style={{
          transform: open ? 'rotate(45deg)' : 'rotate(0)',
          transition: 'transform 220ms cubic-bezier(.2,.8,.3,1)',
        }}>
        +
      </button>
    </div>
  );
}
