// MedicationReminderToast — popup persistente in basso che mostra i
// reminder pendenti. Per ogni reminder:
//   - 💊 Nome + dose
//   - Per chi (se non sono io)
//   - Orario previsto + "in ritardo di X min" se applicabile
//   - 3 azioni: ✅ Presa  ·  ⏰ Posticipa (10/30/60 min)  ·  ⏭️ Salta
//
// Stile: card glassmorphism in basso, sopra la bottom-nav, una alla volta
// (se ci sono multiple, scrolla orizzontalmente).

import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

export default function MedicationReminderToast({ reminders, onTaken, onSnooze, onSkip }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [idx, setIdx] = useState(0);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // Pannello "Salta con nota": motivo rapido o testo libero (facoltativo)
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipNote, setSkipNote] = useState('');

  if (!reminders || reminders.length === 0) return null;
  const safeIdx = Math.min(idx, reminders.length - 1);
  const rem = reminders[safeIdx];
  if (!rem) return null;

  const lateText = rem.minutesLate >= 1
    ? t('med_late_fmt', { mins: rem.minutesLate }) || `In ritardo di ${rem.minutesLate} min`
    : (t('med_due_now') || 'Da prendere ora');

  return (
    <div
      data-testid="medication-reminder-toast"
      style={{
        position: 'fixed',
        bottom: 84, left: 12, right: 12,
        background: 'var(--w, #fff)',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        border: '2px solid var(--ac)',
        padding: 14,
        zIndex: 90,
        maxWidth: 480, margin: '0 auto',
      }}>
      {/* Header con paginazione se più di uno */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'var(--ac)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>💊</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {rem.minutesLate >= 1
              ? `⏰ ${lateText}`
              : `🔔 ${t('med_reminder_h') || 'Promemoria medicina'}`}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
            {rem.medication.name}
            {rem.medication.dose && (
              <span style={{ fontSize: 13, color: 'var(--km)', fontWeight: 500 }}> · {rem.medication.dose}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
            {rem.member?.name || ''} · 🕒 {rem.scheduledAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {reminders.length > 1 && (
          <div style={{
            fontSize: 11, color: 'var(--km)',
            background: 'var(--ab)', borderRadius: 100,
            padding: '3px 8px', fontWeight: 700,
          }}>
            {safeIdx + 1}/{reminders.length}
          </div>
        )}
      </div>

      {/* Note */}
      {rem.medication.notes && (
        <div style={{
          padding: '6px 10px', background: 'var(--ab)', borderRadius: 8,
          fontSize: 12, color: 'var(--km)', marginBottom: 10,
          fontStyle: 'italic',
        }}>
          💡 {rem.medication.notes}
        </div>
      )}

      {/* Azioni principali */}
      {!snoozeOpen && !skipOpen ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => onTaken(rem)}
            data-testid="med-reminder-taken"
            style={{
              flex: 2, padding: '10px 12px', borderRadius: 10,
              background: 'var(--gn)', color: 'white',
              border: 'none', fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
            }}>
            ✅ {t('med_taken_btn') || 'Presa'}
          </button>
          <button
            type="button"
            onClick={() => setSnoozeOpen(true)}
            data-testid="med-reminder-snooze"
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 10,
              background: 'var(--w, #fff)', color: 'var(--k)',
              border: '1px solid var(--sm)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}>
            ⏰ {t('med_snooze_btn') || 'Rimanda'}
          </button>
          <button
            type="button"
            onClick={() => { setSkipOpen(true); setSkipNote(''); }}
            data-testid="med-reminder-skip"
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 10,
              background: 'var(--w, #fff)', color: 'var(--km)',
              border: '1px solid var(--sm)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}>
            ⏭️ {t('med_skip_btn') || 'Salta'}
          </button>
        </div>
      ) : skipOpen ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--km)', marginBottom: 6 }}>
            {t('med_skip_why') || 'Perché la salti? (facoltativo, utile per il medico)'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {[
              `🤢 ${t('med_skip_r1') || 'Non mi sento bene'}`,
              `📦 ${t('med_skip_r2') || 'Medicina finita'}`,
              `🚗 ${t('med_skip_r3') || 'Fuori casa'}`,
              `🩺 ${t('med_skip_r4') || 'Indicazione del medico'}`,
            ].map((r) => (
              <button key={r} type="button"
                onClick={() => setSkipNote(r)}
                style={{
                  padding: '5px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                  border: skipNote === r ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
                  background: skipNote === r ? 'rgba(193,98,75,0.10)' : 'white',
                  color: 'var(--k)', cursor: 'pointer',
                }}>
                {r}
              </button>
            ))}
          </div>
          <input type="text" value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder={t('med_skip_note_ph') || 'Oppure scrivi una nota…'}
            data-testid="med-reminder-skip-note"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px',
              borderRadius: 10, border: '1px solid var(--sm)', fontSize: 13,
              marginBottom: 8, outline: 'none',
            }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button"
              onClick={() => { onSkip(rem, skipNote); setSkipOpen(false); setSkipNote(''); }}
              data-testid="med-reminder-skip-confirm"
              style={{
                flex: 2, padding: '10px 12px', borderRadius: 10,
                background: 'var(--ac)', color: 'white',
                border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
              ⏭️ {t('med_skip_confirm') || 'Salta'}
            </button>
            <button type="button" onClick={() => { setSkipOpen(false); setSkipNote(''); }}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10,
                background: 'var(--w, #fff)', border: '1px solid var(--sm)',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--km)',
              }}>
              {t('cancel') || 'Annulla'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          {[10, 30, 60].map((mins) => (
            <button key={mins}
              type="button"
              onClick={() => { onSnooze(rem, mins); setSnoozeOpen(false); }}
              data-testid={`med-reminder-snooze-${mins}`}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 10,
                background: 'var(--ac)', color: 'white',
                border: 'none', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
              }}>
              {mins < 60 ? `${mins} min` : `1 ${t('hour_short') || 'h'}`}
            </button>
          ))}
          <button type="button" onClick={() => setSnoozeOpen(false)}
            style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--w, #fff)', border: '1px solid var(--sm)',
              cursor: 'pointer', fontSize: 13,
            }}>✕</button>
        </div>
      )}

      {/* Paginazione (se più di un reminder pending) */}
      {reminders.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
          <button type="button" onClick={() => setIdx(Math.max(0, safeIdx - 1))}
            disabled={safeIdx === 0}
            style={{
              padding: '2px 10px', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--km)', opacity: safeIdx === 0 ? 0.3 : 1, fontSize: 14,
            }}>‹</button>
          <button type="button"
            onClick={() => setIdx(Math.min(reminders.length - 1, safeIdx + 1))}
            disabled={safeIdx === reminders.length - 1}
            style={{
              padding: '2px 10px', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--km)', opacity: safeIdx === reminders.length - 1 ? 0.3 : 1, fontSize: 14,
            }}>›</button>
        </div>
      )}
    </div>
  );
}
