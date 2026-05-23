/**
 * DetailTabs — strip orizzontale di tab per modali di dettaglio.
 *
 * Props:
 *  - tabs: [{ id, label, icon?, count? }]
 *  - active: id della tab attiva
 *  - onChange: (id) => void
 *  - testidPrefix: stringa per i data-testid
 *  - sticky: bool — se true, fa stick in alto (per modali scrollabili)
 */
export default function DetailTabs({ tabs, active, onChange, testidPrefix = 'detail-tabs', sticky = true }) {
  return (
    <div
      data-testid={testidPrefix}
      style={{
        display: 'flex',
        gap: 4,
        padding: '6px 2px',
        borderBottom: '1px solid var(--sm)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        position: sticky ? 'sticky' : 'static',
        top: 0,
        background: 'inherit',
        zIndex: 5,
        marginBottom: 12,
      }}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`${testidPrefix}-${tab.id}`}
            onClick={() => onChange(tab.id)}
            style={{
              flex: '0 0 auto',
              padding: '9px 14px',
              borderRadius: 100,
              border: '1.5px solid',
              borderColor: isActive ? 'var(--k)' : 'transparent',
              background: isActive ? 'var(--k)' : 'transparent',
              color: isActive ? 'white' : 'var(--km)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}>
            {tab.icon && <span style={{ fontSize: 14 }}>{tab.icon}</span>}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.22)' : 'var(--ab)',
                color: isActive ? 'white' : 'var(--km)',
                fontSize: 10, fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 100,
                minWidth: 18,
                textAlign: 'center',
              }}>{tab.count}</span>
            )}
            {tab.dot && (
              <span
                data-testid={`${testidPrefix}-${tab.id}-dot`}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#C1624B',
                  boxShadow: isActive ? '0 0 0 2px var(--k)' : '0 0 0 2px white',
                  flexShrink: 0,
                  animation: 'fammy-pulse 1.6s ease-in-out infinite',
                }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
