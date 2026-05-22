import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * SwipeableRow — wrapper di riga con swipe iOS-Mail style.
 *
 * Gesti supportati:
 *  - Swipe LEFT corto  → rivela i pulsanti `rightActions` (es. Completa + Elimina)
 *  - Swipe LEFT lungo  → auto-trigger dell'ultima azione (Elimina)
 *  - Swipe RIGHT corto → rivela il pulsante `leftAction` (es. azione veloce)
 *  - Swipe RIGHT lungo → auto-trigger dell'azione veloce
 *  - Tap sui pulsanti rivelati → esegue azione e richiude
 *  - Tap fuori dalla riga → richiude senza fare nulla
 *
 * Props:
 *  - rightActions: [{ id, label, color, icon, testid, onAction }]  (max 2 consigliati)
 *  - leftAction:   { id, label, color, icon, testid, onAction }    (singola azione)
 *  - disabled:     bool
 *  - children:     ReactNode (la card)
 */
const ACTION_W = 84;
const TRIGGER_AUTO_LEFT  = 220;
const TRIGGER_AUTO_RIGHT = 160;
const TAP_THRESHOLD      = 6;

export default function SwipeableRow({
  rightActions = [],
  leftAction = null,
  disabled = false,
  children,
  testidContainer,
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const axisLock = useRef(null); // null | 'x' | 'y'
  const containerRef = useRef(null);

  const revealRight = rightActions.length * ACTION_W;
  const revealLeft  = leftAction ? ACTION_W : 0;

  const close = useCallback(() => {
    setAnimating(true);
    setDx(0);
  }, []);

  const onTouchStart = (e) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axisLock.current = null;
    setAnimating(false);
  };

  const onTouchMove = (e) => {
    if (disabled || startX.current === null) return;
    const tx = e.touches[0].clientX - startX.current;
    const ty = e.touches[0].clientY - startY.current;
    if (axisLock.current === null) {
      if (Math.abs(tx) < TAP_THRESHOLD && Math.abs(ty) < TAP_THRESHOLD) return;
      axisLock.current = Math.abs(tx) > Math.abs(ty) ? 'x' : 'y';
    }
    if (axisLock.current !== 'x') return;
    let next = tx;
    // Resistenza dove non ci sono azioni
    if (revealRight === 0 && next < 0) next = next * 0.25;
    if (revealLeft === 0 && next > 0) next = next * 0.25;
    next = Math.max(-320, Math.min(220, next));
    setDx(next);
  };

  const onTouchEnd = () => {
    if (axisLock.current !== 'x') {
      startX.current = null;
      axisLock.current = null;
      return;
    }
    setAnimating(true);
    if (dx <= -TRIGGER_AUTO_LEFT && rightActions.length > 0) {
      const last = rightActions[rightActions.length - 1];
      setDx(-window.innerWidth);
      window.setTimeout(() => {
        last.onAction?.();
        setDx(0);
      }, 220);
    } else if (dx >= TRIGGER_AUTO_RIGHT && leftAction) {
      setDx(window.innerWidth);
      window.setTimeout(() => {
        leftAction.onAction?.();
        setDx(0);
      }, 220);
    } else if (dx <= -revealRight / 2 && revealRight > 0) {
      setDx(-revealRight);
    } else if (dx >= revealLeft / 2 && revealLeft > 0) {
      setDx(revealLeft);
    } else {
      setDx(0);
    }
    startX.current = null;
    axisLock.current = null;
  };

  // Chiudi al click fuori
  useEffect(() => {
    if (dx === 0) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close();
      }
    };
    // delay per non auto-chiudere subito dopo lo swipe (touchend → click)
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 50);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [dx, close]);

  return (
    <div
      ref={containerRef}
      data-testid={testidContainer}
      style={{
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'pan-y',
        WebkitTapHighlightColor: 'transparent',
        marginBottom: 12,
        borderRadius: 20,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Azioni a DESTRA (rivelate dallo swipe a sinistra) */}
      {rightActions.length > 0 && (
        <div
          aria-hidden={dx === 0}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'stretch',
            zIndex: 1,
          }}>
          {rightActions.map((a) => (
            <button
              key={a.id}
              type="button"
              data-testid={a.testid}
              onClick={(e) => {
                e.stopPropagation();
                close();
                a.onAction?.();
              }}
              style={{
                width: ACTION_W,
                border: 'none', cursor: 'pointer',
                background: a.color,
                color: 'white',
                fontSize: 11, fontWeight: 700,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 4, padding: '6px 4px',
                lineHeight: 1.1,
              }}>
              {a.icon && <span style={{ fontSize: 20 }}>{a.icon}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Azione a SINISTRA (rivelata dallo swipe a destra) */}
      {leftAction && (
        <div
          aria-hidden={dx === 0}
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            display: 'flex', alignItems: 'stretch',
            zIndex: 1,
          }}>
          <button
            type="button"
            data-testid={leftAction.testid}
            onClick={(e) => {
              e.stopPropagation();
              close();
              leftAction.onAction?.();
            }}
            style={{
              width: ACTION_W,
              border: 'none', cursor: 'pointer',
              background: leftAction.color,
              color: 'white',
              fontSize: 11, fontWeight: 700,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4, padding: '6px 4px',
              lineHeight: 1.1,
            }}>
            {leftAction.icon && <span style={{ fontSize: 20 }}>{leftAction.icon}</span>}
            <span>{leftAction.label}</span>
          </button>
        </div>
      )}

      {/* Contenuto in primo piano che scorre */}
      <div
        className="swipe-row-inner"
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: animating ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)' : 'none',
          willChange: 'transform',
          position: 'relative',
          zIndex: 2,
          background: '#F7F5F0',  /* FIX: sfondo solido per coprire i bottoni sotto */
          borderRadius: 20,
        }}
        onClickCapture={(e) => {
          // Se la riga è aperta (swiped), il click chiude lo swipe
          // invece di propagare alla card sottostante.
          if (dx !== 0) {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        onTransitionEnd={() => setAnimating(false)}
      >
        {children}
      </div>
    </div>
  );
}
