/**
 * QuickActionsSheet — bottom-sheet "azioni rapide" identico a quello dell'Agenda.
 * Mostra fino a 3 azioni: Nuovo incarico, Nuova assenza, Nuova medicina.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onNewTask: () => void
 *  - onNewAbsence: () => void
 *  - onNewMed: () => void   se assente, la voce "medicina" non viene mostrata
 *  - t: funzione i18n
 *  - testidPrefix: prefisso per i data-testid (default 'quick-actions')
 */
export default function QuickActionsSheet({
  open, onClose,
  onNewTask, onNewAbsence, onNewMed,
  t, testidPrefix = 'quick-actions',
}) {
  if (!open) return null;
  return (
    <div
      data-testid={`${testidPrefix}-backdrop`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(28,22,17,0.35)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testidPrefix}-sheet`}
        style={{
          width: '100%', maxWidth: 520, background: 'white',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 6,
          animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
        }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--sm)', margin: '0 auto 12px' }} />

        {onNewTask && (
          <ActionRow icon="📋" label={t('fab_new_task') || 'Nuovo incarico'}
            testid={`${testidPrefix}-task`}
            onClick={() => { onClose(); onNewTask(); }} />
        )}
        {onNewAbsence && (
          <ActionRow icon="✈️" label={t('fab_new_absence') || 'Nuova assenza'}
            testid={`${testidPrefix}-absence`}
            onClick={() => { onClose(); onNewAbsence(); }} />
        )}
        {onNewMed && (
          <ActionRow icon="💊" label={t('fab_new_med') || 'Nuova medicina'}
            accent="var(--gn)"
            testid={`${testidPrefix}-med`}
            onClick={() => { onClose(); onNewMed(); }} />
        )}

        <button
          type="button"
          onClick={onClose}
          data-testid={`${testidPrefix}-cancel`}
          style={{
            marginTop: 6, padding: '12px', borderRadius: 12,
            border: '1px solid var(--sm)', background: 'white',
            fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
          }}>{t('cancel') || 'Annulla'}</button>
      </div>
    </div>
  );
}

function ActionRow({ icon, label, onClick, accent, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 14,
        border: '1px solid var(--sm)', background: 'white',
        textAlign: 'left', cursor: 'pointer',
        borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--sm)',
      }}>
      <span style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--ab)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--k)' }}>{label}</span>
    </button>
  );
}
