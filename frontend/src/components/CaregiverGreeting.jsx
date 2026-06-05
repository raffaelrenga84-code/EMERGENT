import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import MedicationsModal from './MedicationsModal.jsx';

/**
 * CaregiverGreeting — saluto contestuale in cima alla Bacheca quando
 * l'utente è caregiver di uno o più membri assistiti.
 *
 * Mostra: "🤝 Sei caregiver di Pina · oggi 3 medicine"
 *
 * Conta gli orari di medicine attive di tutti gli assistiti.
 * Tap su una card assistito → apre il suo Care Hub.
 *
 * Si nasconde automaticamente se l'utente non è caregiver di nessuno.
 *
 * Props:
 *  - session: Supabase session
 *  - members: lista membri completa
 *  - me: il member loggato (per onChanged)
 */
export default function CaregiverGreeting({ session, members = [], me }) {
  const { t } = useT();
  const [medsCountByMember, setMedsCountByMember] = useState({});
  const [careHubFor, setCareHubFor] = useState(null);

  // Calcola gli assistiti di cui io sono caregiver
  const myMemberIds = new Set(
    (members || []).filter((m) => m.user_id === session.user.id).map((m) => m.id)
  );
  const assistedByMe = (members || []).filter(
    (m) => m.is_assisted && Array.isArray(m.cared_by) &&
      m.cared_by.some((cgId) => myMemberIds.has(cgId))
  );

  // Carica il conteggio delle medicine di OGGI per ciascun assistito
  useEffect(() => {
    let cancelled = false;
    if (assistedByMe.length === 0) { setMedsCountByMember({}); return; }
    const ids = assistedByMe.map((m) => m.id);
    supabase.from('medications')
      .select('member_id, times_of_day')
      .in('member_id', ids)
      .eq('active', true)
      .then(({ data }) => {
        if (cancelled) return;
        const counts = {};
        (data || []).forEach((row) => {
          const n = Array.isArray(row.times_of_day) ? row.times_of_day.length : 0;
          counts[row.member_id] = (counts[row.member_id] || 0) + n;
        });
        setMedsCountByMember(counts);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistedByMe.length, assistedByMe.map((m) => m.id).join(',')]);

  if (assistedByMe.length === 0) return null;

  return (
    <>
      <div
        data-testid="caregiver-greeting"
        style={{
          margin: '12px 16px 4px',
          padding: '12px 14px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, var(--gnB) 0%, rgba(124,142,118,0.20) 100%)',
          border: '1px solid var(--gn)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--k)',
              letterSpacing: '-0.01em',
            }}>
              {assistedByMe.length === 1
                ? (t('cg_greet_one') || 'Oggi sei caregiver di {name}')
                    .replace('{name}', assistedByMe[0].name)
                : (t('cg_greet_many') || 'Oggi sei caregiver di {n} persone')
                    .replace('{n}', assistedByMe.length)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 1 }}>
              {t('cg_greet_sub') || 'Tap per aprire il Care Hub di chi vuoi'}
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: assistedByMe.length === 1
            ? '1fr'
            : 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 6,
        }}>
          {assistedByMe.map((m) => {
            const medCount = medsCountByMember[m.id] || 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setCareHubFor(m)}
                data-testid={`caregiver-greeting-card-${m.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 12,
                  background: 'white',
                  border: '1px solid rgba(124,142,118,0.35)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(124,142,118,0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                <span style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: m.avatar_color || 'var(--ac)', color: 'white',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                }}>
                  {m.avatar_letter || (m.name || '?').charAt(0).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--k)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 1 }}>
                    {medCount > 0
                      ? `💊 ${medCount} ${medCount === 1 ? (t('cg_med_one') || 'medicina') : (t('cg_med_many') || 'medicine')}`
                      : (t('cg_no_meds') || '🩺 Care Hub')}
                  </div>
                </div>
                <span style={{ fontSize: 14, color: 'var(--gn)' }}>›</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Care Hub aperto dal saluto */}
      {careHubFor && (
        <MedicationsModal
          member={careHubFor}
          me={me || (members || []).find((mm) => mm.user_id === session.user.id)}
          onClose={() => setCareHubFor(null)}
        />
      )}
    </>
  );
}
