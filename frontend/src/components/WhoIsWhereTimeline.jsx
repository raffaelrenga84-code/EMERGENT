import { useMemo } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * WhoIsWhereTimeline — pannello "🌍 Chi è dove" per la FamilyTab.
 *
 * Mostra una timeline orizzontale dei 30 giorni successivi a oggi con:
 *  • una riga per membro (header con avatar + nome)
 *  • barre orizzontali colorate per ogni assenza nel periodo
 *  • etichetta sopra la barra (es. "🏖️ Messico · 18→25")
 *  • tap su una barra → onEditAbsence(abs) (se è la mia assenza)
 *
 * Se non ci sono assenze nel range, mostra un empty state sintetico.
 *
 * Props:
 *  - absences:   array assenze visibili a questa famiglia
 *  - members:    membri della famiglia (di cui mostrare le righe)
 *  - familyId:   id della famiglia corrente (per filtrare absences.visible_to_families)
 *  - onEditAbsence: (abs) => void
 */
const DAYS_AHEAD = 30;
const ROW_H = 36;
const DAY_W = 26; // pixel per giorno

export default function WhoIsWhereTimeline({ absences = [], members = [], familyId, onEditAbsence }) {
  const { t, lang } = useT();

  const REASON = {
    vacation: { icon: '🏖️', color: '#2E7D52' },
    work:     { icon: '💼', color: '#2A6FDB' },
    health:   { icon: '🏥', color: '#C0392B' },
    other:    { icon: '✈️', color: '#7C3AED' },
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const endDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + DAYS_AHEAD - 1);
    return d;
  }, [today]);

  // Filtra assenze rilevanti: condivise con questa famiglia + overlap col range
  const relevantAbsences = useMemo(() => {
    const startIso = today.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);
    return (absences || []).filter((a) => {
      // RLS già filtra ma manteniamo coerenza UI: mostro solo se la famiglia
      // corrente è esplicitamente nell'elenco condiviso.
      if (familyId && Array.isArray(a.visible_to_families) && !a.visible_to_families.includes(familyId)) {
        return false;
      }
      return a.start_date <= endIso && a.end_date >= startIso;
    });
  }, [absences, familyId, today, endDate]);

  if (relevantAbsences.length === 0) {
    return (
      <div data-testid="who-is-where-empty"
        style={{
          margin: '12px 16px',
          padding: '14px 16px',
          background: 'var(--ab)',
          border: '1px solid var(--sm)',
          borderRadius: 14,
          textAlign: 'center', color: 'var(--km)', fontSize: 13,
        }}>
        🌍 {t('who_is_where_empty') || 'Tutti in sede per i prossimi 30 giorni'}
      </div>
    );
  }

  const membersWithAbsences = members.filter((m) =>
    relevantAbsences.some((a) => a.user_id === m.user_id)
  );

  const labelOf = (i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  };

  // Position helpers
  const dayFromIso = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return Math.max(0, Math.round((d - today) / (24 * 3600 * 1000)));
  };

  return (
    <div
      data-testid="who-is-where-timeline"
      style={{
        margin: '12px 16px',
        padding: '14px 0',
        background: 'white',
        border: '1px solid var(--sm)',
        borderRadius: 16,
      }}>
      <div style={{
        padding: '0 16px 8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
          🌍 {t('who_is_where_h') || 'Chi è dove'}
        </h3>
        <span style={{ fontSize: 11, color: 'var(--km)' }}>
          {t('who_is_where_window') || 'Prossimi 30 giorni'}
        </span>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: DAY_W * DAYS_AHEAD + 120, padding: '0 16px' }}>
          {/* Header: ticks ogni 5 giorni */}
          <div style={{ position: 'relative', height: 20, marginLeft: 96 }}>
            {Array.from({ length: DAYS_AHEAD }).map((_, i) =>
              i % 5 === 0 || i === DAYS_AHEAD - 1 ? (
                <div key={i} style={{
                  position: 'absolute', left: i * DAY_W,
                  fontSize: 10, color: 'var(--km)', fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}>{labelOf(i)}</div>
              ) : null
            )}
          </div>

          {membersWithAbsences.map((m) => {
            const memberAbsences = relevantAbsences.filter((a) => a.user_id === m.user_id);
            return (
              <div key={m.id} style={{
                position: 'relative', height: ROW_H, marginBottom: 6,
                display: 'flex', alignItems: 'center',
              }}>
                {/* Nome + avatar */}
                <div style={{
                  width: 96, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 700,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 8,
                    background: m.avatar_color || '#1C1611',
                    color: 'white', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {m.avatar_letter || m.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>{m.name}</span>
                </div>

                {/* Track + barre */}
                <div style={{
                  flex: 1, position: 'relative', height: ROW_H,
                  background: 'var(--ab)', borderRadius: 8,
                }}>
                  {memberAbsences.map((a) => {
                    const startIdx = dayFromIso(a.start_date);
                    const endIdx = Math.min(DAYS_AHEAD - 1, dayFromIso(a.end_date));
                    const left = startIdx * DAY_W;
                    const width = Math.max(DAY_W, (endIdx - startIdx + 1) * DAY_W);
                    const meta = REASON[a.reason] || REASON.other;
                    return (
                      <button key={a.id}
                        type="button"
                        data-testid={`who-is-where-bar-${a.id}`}
                        onClick={(e) => { e.stopPropagation(); onEditAbsence?.(a); }}
                        title={`${meta.icon} ${a.location || ''} (${a.start_date} → ${a.end_date})`}
                        style={{
                          position: 'absolute', top: 4, bottom: 4,
                          left, width: width - 2,
                          background: `linear-gradient(135deg, ${meta.color} 0%, ${meta.color}dd 100%)`,
                          color: 'white',
                          border: 'none', borderRadius: 8,
                          padding: '0 8px',
                          fontSize: 11, fontWeight: 700,
                          textAlign: 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: onEditAbsence ? 'pointer' : 'default',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        }}>
                        {meta.icon} {a.location || (t('absence_label_fallback') || 'Assenza')}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: '10px 16px 0', fontSize: 11, color: 'var(--km)',
        display: 'flex', gap: 12, flexWrap: 'wrap',
      }}>
        <LegendDot color={REASON.vacation.color} label={`🏖️ ${t('absence_reason_vacation') || 'Vacanza'}`} />
        <LegendDot color={REASON.work.color}     label={`💼 ${t('absence_reason_work') || 'Lavoro'}`} />
        <LegendDot color={REASON.health.color}   label={`🏥 ${t('absence_reason_health') || 'Salute'}`} />
        <LegendDot color={REASON.other.color}    label={`✈️ ${t('absence_reason_other') || 'Altro'}`} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}
