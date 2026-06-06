/**
 * TabHeaderActions — coppia di pulsanti (🔍 search + ✨ AI verde + ➕ aggiungi rosso)
 * pensata per stare in alto a destra in ogni tab della home, sostituendo
 * il vecchio FAB flottante con un'azione più coerente in stile Apple.
 *
 * Props:
 *  - onAdd: () => void   se assente, il "+" non viene mostrato
 *  - onAI:  () => void   se assente, il "✨" non viene mostrato
 *  - onSearch: () => void se assente, il "🔍" non viene mostrato
 *  - addLabel / aiLabel / searchLabel: stringhe per a11y / title
 *  - pulse: boolean → quando true, il "+" pulsa per attirare l'attenzione
 *  - testidPrefix: prefisso per data-testid (es. "family", "profile")
 */
export default function TabHeaderActions({
  onAdd, onAI, onSearch,
  addLabel = 'Nuovo',
  aiLabel = 'Assistente AI',
  searchLabel = 'Cerca',
  pulse = false,
  testidPrefix = 'tab',
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {onSearch && (
        <button
          type="button"
          data-testid={`${testidPrefix}-search-btn`}
          onClick={() => onSearch()}
          title={searchLabel}
          aria-label={searchLabel}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'white', border: '1px solid var(--sm)',
            color: 'var(--km)', fontSize: 16,
            cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          🔍
        </button>
      )}
      {onAI && (
        <button
          type="button"
          data-testid={`${testidPrefix}-ai-btn`}
          onClick={() => onAI()}
          title={aiLabel}
          aria-label={aiLabel}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--gn)', border: 'none',
            color: 'white', fontSize: 17,
            cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(124,142,118,0.35)',
          }}>
          ✨
        </button>
      )}
      {onAdd && (
        <button
          type="button"
          data-testid={`${testidPrefix}-add-btn`}
          className={pulse ? 'fammy-pulse-attract' : ''}
          onClick={() => onAdd()}
          title={addLabel}
          aria-label={addLabel}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--ac)', border: 'none',
            color: 'white', fontSize: 22, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, lineHeight: 1,
            boxShadow: '0 2px 6px rgba(193,98,75,0.35)',
          }}>
          +
        </button>
      )}
    </div>
  );
}
