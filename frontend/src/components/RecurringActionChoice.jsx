/**
 * RecurringActionChoice — piccolo prompt "Cosa vuoi fare?":
 * - Solo questa occorrenza
 * - Tutta la serie
 *
 * Usato quando l'utente elimina o modifica una istanza ricorrente.
 *
 * Props:
 *   action: "edit" | "delete"
 *   onSingle / onSeries / onClose
 */
export default function RecurringActionChoice({ action, onSingle, onSeries, onClose }) {
  const verb = action === 'delete' ? 'eliminare' : 'modificare';
  const Verb = action === 'delete' ? 'Eliminare' : 'Modificare';
  const accent = action === 'delete' ? 'var(--rd)' : 'var(--ac)';

  return (
    <div className="modal-bg" onClick={onClose} data-testid="recurring-action-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 42, marginBottom: 6 }}>🔁</div>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--fs)', fontWeight: 500, letterSpacing: '-0.015em' }}>
            {Verb} ricorrenza
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.45 }}>
            Questo fa parte di una serie ricorrente.<br />Cosa vuoi {verb}?
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" onClick={onSingle}
            data-testid="recurring-action-single"
            style={{
              padding: '14px 18px', borderRadius: 14,
              border: `2px solid ${accent}`, background: 'white',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
            <span style={{ fontSize: 22 }}>📍</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>Solo questa occorrenza</div>
              <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
                Le altre date restano invariate
              </div>
            </span>
          </button>

          <button type="button" onClick={onSeries}
            data-testid="recurring-action-series"
            style={{
              padding: '14px 18px', borderRadius: 14,
              border: '2px solid var(--sm)', background: 'white',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
            <span style={{ fontSize: 22 }}>🔁</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>Tutte le occorrenze</div>
              <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
                {Verb} l'intera serie ricorrente
              </div>
            </span>
          </button>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button type="button" onClick={onClose}
            data-testid="recurring-action-cancel"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--km)', fontSize: 13, fontWeight: 600,
              padding: '6px 12px', cursor: 'pointer',
            }}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
