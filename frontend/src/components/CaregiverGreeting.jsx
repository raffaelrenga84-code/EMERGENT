import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { dedupeByUser } from '../lib/memberDedupe.js';
import MedicationsModal from './MedicationsModal.jsx';

/**
 * CaregiverGreeting v2 — ingresso al Care Hub in cima alla Bacheca.
 *
 * SEMPRE visibile (non serve più attivare "assistito" dal profilo):
 *  - con assistiti → card con il loro elenco e le medicine di oggi
 *  - senza assistiti → card compatta che apre il MIO Care Hub
 *
 * Design: una sola card salvia con badge circolare 🩺, titolo "Care Hub",
 * sottotitolo dinamico e riga di persone. Un tocco apre il Care Hub
 * (con più assistiti, tocchi la persona che vuoi).
 */
export default function CaregiverGreeting({ session, members = [], me }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [medsCountByMember, setMedsCountByMember] = useState({});
  const [careHubFor, setCareHubFor] = useState(null);

  const myMemberIds = new Set(
    (members || []).filter((m) => m.user_id === session.user.id).map((m) => m.id)
  );
  const mySelfAssisted = (members || []).filter(
    (m) => m.is_assisted && m.user_id === session.user.id
  );
  const othersIAssist = (members || []).filter(
    (m) => m.is_assisted && m.user_id !== session.user.id &&
      Array.isArray(m.cared_by) &&
      m.cared_by.some((cgId) => myMemberIds.has(cgId))
  );
  const assistedByMe = dedupeByUser([...mySelfAssisted, ...othersIAssist])
    .sort((a, b) => {
      const aSelf = a.user_id === session.user.id ? 0 : 1;
      const bSelf = b.user_id === session.user.id ? 0 : 1;
      if (aSelf !== bSelf) return aSelf - bSelf;
      return (a.name || '').localeCompare(b.name || '');
    });

  // Fallback: nessun assistito → il Care Hub è comunque a un tocco, per ME
  const selfMember =
    (members || []).find((m) => m.user_id === session.user.id) || null;
  const targets = assistedByMe.length > 0
    ? assistedByMe
    : (selfMember ? [selfMember] : []);

  // Conteggio medicine di OGGI per persona
  useEffect(() => {
    let cancelled = false;
    if (targets.length === 0) { setMedsCountByMember({}); return; }
    const ids = targets.map((m) => m.id);
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
  }, [targets.length, targets.map((m) => m.id).join(',')]);

  if (targets.length === 0) return null;

  const single = targets.length === 1;
  const onlySelf = single && targets[0].user_id === session.user.id;
  const totalMeds = targets.reduce((s, m) => s + (medsCountByMember[m.id] || 0), 0);

  const subtitle = onlySelf
    ? (totalMeds > 0
        ? `💊 ${totalMeds} ${totalMeds === 1 ? (t('cg_med_one') || 'medicina') : (t('cg_med_many') || 'medicine')} ${t('cg_today') || 'oggi'}`
        : (t('care_hub_sub_self') || 'Le tue medicine, il profilo medico e il diario'))
    : single
      ? `${targets[0].name}${totalMeds > 0 ? ` · 💊 ${totalMeds} ${t('cg_today') || 'oggi'}` : ''}`
      : `${targets.length} ${t('cg_people') || 'persone'}${totalMeds > 0 ? ` · 💊 ${totalMeds} ${t('cg_today') || 'oggi'}` : ''}`;

  return (
    <>
      <button
        type="button"
        data-testid="caregiver-greeting"
        onClick={() => { if (single) setCareHubFor(targets[0]); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: 'calc(100% - 32px)', margin: '12px 16px 4px',
          padding: '12px 14px', borderRadius: 18,
          background: 'linear-gradient(135deg, var(--gnB) 0%, rgba(124,142,118,0.22) 100%)',
          border: '1px solid rgba(124,142,118,0.45)',
          cursor: single ? 'pointer' : 'default', textAlign: 'left',
          boxShadow: '0 2px 10px rgba(124,142,118,0.15)',
        }}>
        <span style={{
          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gn)', color: 'white',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, boxShadow: '0 2px 6px rgba(124,142,118,0.4)',
        }}>🩺</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 800, color: 'var(--k)',
            letterSpacing: '-0.01em',
          }}>
            {t('care_hub_title') || 'Care Hub'}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--km)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </div>
        </div>
        {single ? (
          <span style={{ fontSize: 18, color: 'var(--gn)', flexShrink: 0 }}>›</span>
        ) : (
          <span style={{ display: 'flex', flexShrink: 0 }}>
            {targets.slice(0, 4).map((m, i) => (
              <span key={m.id} style={{
                width: 28, height: 28, borderRadius: '50%',
                background: m.avatar_color || 'var(--ac)', color: 'white',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12,
                border: '2px solid var(--gnB)',
                marginLeft: i === 0 ? 0 : -8,
              }}>
                {m.user_id === session.user.id ? '👤' : (m.avatar_letter || (m.name || '?').charAt(0).toUpperCase())}
              </span>
            ))}
          </span>
        )}
      </button>

      {/* Con più persone: riga di scelta compatta sotto la card */}
      {!single && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          margin: '6px 16px 0',
        }}>
          {targets.map((m) => {
            const isSelf = m.user_id === session.user.id;
            const displayName = isSelf
              ? (t('meds_picker_self_name') || 'Per me')
              : m.name;
            const medCount = medsCountByMember[m.id] || 0;
            return (
              <button key={m.id} type="button"
                onClick={() => setCareHubFor(m)}
                data-testid={`caregiver-greeting-card-${m.id}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 100,
                  background: 'var(--w, #fff)',
                  border: `1.5px solid ${isSelf ? 'var(--ac)' : 'rgba(124,142,118,0.45)'}`,
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--k)',
                }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: m.avatar_color || 'var(--ac)', color: 'white',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 10, flexShrink: 0,
                }}>
                  {isSelf ? '👤' : (m.avatar_letter || (m.name || '?').charAt(0).toUpperCase())}
                </span>
                {displayName}
                {medCount > 0 && (
                  <span style={{ color: 'var(--km)', fontWeight: 600 }}>💊{medCount}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
