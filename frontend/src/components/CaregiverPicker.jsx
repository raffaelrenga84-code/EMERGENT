import { useT } from '../lib/i18n.jsx';

/**
 * CaregiverPicker — multi-select dei membri della famiglia che sono
 * caregiver di un dato assistito.
 *
 * Props:
 *  - familyMembers: lista membri della famiglia dell'assistito (non null)
 *  - assistedMemberId: id dell'assistito (per escluderlo dalla lista)
 *  - value: uuid[] selezionati (cared_by)
 *  - onChange: (uuid[]) => void
 *  - disabled?: boolean
 *
 * UX: chip cliccabili (chip-style toggle) con avatar + nome.
 * Compatto, si adatta a wrap su mobile.
 */
export default function CaregiverPicker({
  familyMembers = [],
  assistedMemberId = null,
  value = [],
  onChange,
  disabled = false,
}) {
  const { t } = useT();
  const set = new Set(value || []);
  // Esclude l'assistito stesso e i placeholder senza account
  // (un caregiver "fantasma" senza account non riceve push → inutile)
  const candidates = familyMembers.filter((m) =>
    m.id !== assistedMemberId && m.user_id // solo membri con account auth
  );

  const toggle = (id) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange && onChange(Array.from(next));
  };

  if (candidates.length === 0) {
    return (
      <div style={{
        padding: 10, borderRadius: 10,
        background: 'var(--ab)', border: '1px dashed var(--sm)',
        fontSize: 12, color: 'var(--km)', lineHeight: 1.4,
      }}>
        {t('caregiver_picker_empty') ||
          'Nessun altro membro con account in questa famiglia. Invita prima qualcuno che possa essere caregiver.'}
      </div>
    );
  }

  return (
    <div
      data-testid="caregiver-picker"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {candidates.map((m) => {
        const active = set.has(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            disabled={disabled}
            data-testid={`caregiver-pick-${m.id}`}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px 6px 6px', borderRadius: 100,
              border: `1.5px solid ${active ? 'var(--gn)' : 'var(--sm)'}`,
              background: active ? 'var(--gnB)' : 'white',
              color: 'var(--k)',
              fontSize: 13, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              background: m.avatar_color || 'var(--ac)', color: 'white',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {m.avatar_letter || (m.name || '?').charAt(0).toUpperCase()}
            </span>
            <span>{m.name}</span>
            {active && <span style={{ color: 'var(--gn)', fontWeight: 800 }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}
