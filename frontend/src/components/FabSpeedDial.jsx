import { useEffect, useRef, useState } from 'react';

/**
 * FabSpeedDial — bottone + flottante che apre un mini-menu radiale.
 *
 * Props:
 *  - actions: [{ id, icon, label, onClick, testid }]
 *  - testid: string per il root FAB
 *  - className: override className del FAB (default 'fab')
 *
 * Comportamento:
 *  - Tap su + → apre menu (actions appaiono in cascata animata sopra)
 *  - Tap fuori → chiude
 *  - Tap su un'azione → onClick + chiude
 *  - Se passi solo 1 action → degrada a bottone normale (no menu)
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
      {/* Menu actions */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 20, bottom: 100,
            display: 'flex', flexDirection: 'column',
            gap: 12, alignItems: 'flex-end',
            pointerEvents: 'auto',
          }}>
          {actions.map((a, idx) => (
            <button
              key={a.id}
              data-testid={a.testid}
              onClick={() => { a.onClick?.(); setOpen(false); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                background: 'white',
                border: '1px solid var(--sm)',
                borderRadius: 100,
                boxShadow: '0 6px 18px rgba(28,22,17,0.18)',
                fontSize: 14, fontWeight: 700, color: 'var(--k)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                animation: `fammy-fab-pop 220ms cubic-bezier(.2,.8,.3,1) ${idx * 40}ms both`,
              }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%',
                background: a.color || 'var(--ac)',
                color: 'white', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700,
              }}>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Backdrop semi-trasparente quando aperto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(28,22,17,0.15)',
            zIndex: -1,
          }} />
      )}
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
