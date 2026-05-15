import { useEffect, useRef, useState } from 'react';

/**
 * usePullToRefresh — hook per "tira giù il dito" (pull-to-refresh)
 *
 * Funziona solo su touchscreen quando l'elemento contenitore è scrollato in cima
 * (scrollTop === 0). Tira giù di più del threshold → triggera onRefresh().
 *
 * Uso:
 *   const { containerRef, indicator } = usePullToRefresh(onRefresh);
 *   return <div ref={containerRef}>{indicator}{children}</div>;
 *
 * Note implementative:
 *  - Solo touch (no mouse: il browser supporta già ctrl+R su desktop)
 *  - Soglia 70px (sufficiente perché un tap accidentale non triggeri)
 *  - Lock di 1 secondo dopo refresh per evitare doppi trigger
 */
export function usePullToRefresh(onRefresh, { threshold = 70, maxPull = 120 } = {}) {
  const containerRef = useRef(null);
  const startYRef = useRef(null);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (refreshing) return;
      // Solo se siamo in cima al contenitore (o al document se è body)
      const scrollTop = el.scrollTop ?? window.scrollY ?? 0;
      if (scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e) => {
      if (!pullingRef.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      const dy = currentY - startYRef.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      // Resistenza progressiva
      const eased = Math.min(maxPull, dy * 0.55);
      setPullDistance(eased);
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const fired = pullDistance >= threshold;
      setPullDistance(0);
      if (fired) {
        setRefreshing(true);
        try { await onRefresh?.(); } catch (e) { /* swallow */ }
        // breve lock per UX
        setTimeout(() => setRefreshing(false), 600);
      }
    };

    // Document-level binding così funziona anche su contenitori non-scroll
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh, threshold, maxPull, refreshing, pullDistance]);

  const visible = pullDistance > 6 || refreshing;
  const ready = pullDistance >= threshold;
  const indicator = (
    <div
      aria-hidden={!visible}
      data-testid="pull-to-refresh-indicator"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: refreshing ? 56 : Math.min(maxPull, pullDistance),
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
        transition: pullingRef.current ? 'none' : 'height 220ms ease, opacity 220ms ease',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'white',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: refreshing
            ? 'rotate(360deg)'
            : `rotate(${Math.min(360, (pullDistance / threshold) * 270)}deg)`,
          transition: refreshing ? 'transform 1s linear infinite' : 'transform 60ms linear',
          animation: refreshing ? 'fammy-spin 0.9s linear infinite' : 'none',
        }}
      >
        <span style={{
          fontSize: 18,
          color: ready ? 'var(--k)' : 'var(--km)',
          fontWeight: 700,
        }}>
          {refreshing ? '⟳' : ready ? '↑' : '↓'}
        </span>
      </div>
    </div>
  );

  return { containerRef, indicator, refreshing, pullDistance };
}
