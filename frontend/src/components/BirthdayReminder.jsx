import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getAge } from '../lib/birthdayUtils.js';
import { useT } from '../lib/i18n.jsx';
import GiftChatModal from './GiftChatModal.jsx';
import BirthdayWishesModal from './BirthdayWishesModal.jsx';

/**
 * Componente che mostra un reminder di compleanno domani
 * Da mostrare nella Bacheca il giorno prima del compleanno
 */
export default function BirthdayReminder({ members, session, familyId, families = [] }) {
  const { t: __t0 } = useT();
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  const [dismissed, setDismissed] = useState({});
  const [giftChatMember, setGiftChatMember] = useState(null);
  const [wishesMember, setWishesMember] = useState(null);
  const [wishCounts, setWishCounts] = useState({}); // member_id -> n auguri

  // Trova chi ha il compleanno domani
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const birthdayTomorrow = members.filter((m) => {
    if (!m.birth_date || dismissed[m.id]) return false;
    const birth = new Date(m.birth_date + 'T00:00:00Z');
    return birth.getMonth() === tomorrow.getMonth() && birth.getDate() === tomorrow.getDate();
  });

  // 🎂 Chi compie gli anni OGGI → chat auguri
  const today = new Date();
  const birthdayToday = members.filter((m) => {
    if (!m.birth_date || dismissed['today-' + m.id]) return false;
    const birth = new Date(m.birth_date + 'T00:00:00Z');
    return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
  });

  // Conteggio auguri già scritti (badge sul pulsante, e per il festeggiato)
  useEffect(() => {
    if (birthdayToday.length === 0) return;
    (async () => {
      try {
        const { data } = await supabase.from('birthday_wishes')
          .select('birthday_member_id')
          .in('birthday_member_id', birthdayToday.map((m) => m.id))
          .eq('year', today.getFullYear());
        const counts = {};
        for (const r of (data || [])) counts[r.birthday_member_id] = (counts[r.birthday_member_id] || 0) + 1;
        setWishCounts(counts);
      } catch (_) { /* migration assente */ }
    })();
  }, [members.length, wishesMember]);

  if (birthdayTomorrow.length === 0 && birthdayToday.length === 0) return null;

  const dismissReminder = (memberId) => {
    setDismissed((prev) => ({ ...prev, [memberId]: true }));
  };

  const openGiftChat = (member) => {
    setGiftChatMember(member);
  };

  const myUserId = session?.user?.id || null;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        {birthdayToday.map((member) => {
          const age = getAge(member.birth_date);
          const isMe = !!member.user_id && member.user_id === myUserId;
          const n = wishCounts[member.id] || 0;
          return (
            <div key={'today-' + member.id} data-testid={'bday-today-' + member.id}
              style={{
                padding: 14,
                background: 'linear-gradient(135deg, #FFC1D8 0%, #FFD9E6 100%)',
                border: '2px solid #FF6B9D',
                borderRadius: 12,
                marginBottom: 12,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🎉</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {isMe
                        ? (t('wish_banner_own') || 'Oggi è il TUO compleanno — auguri!')
                        : (t('wish_banner_today') || 'Compleanno oggi!')}
                    </div>
                    <div style={{ fontSize: 12, color: '#333' }}>
                      {isMe
                        ? `${age} 🎂`
                        : `${member.name} compie ${age} anni`}
                    </div>
                  </div>
                </div>
                <button onClick={() => dismissReminder('today-' + member.id)}
                  style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#666' }}
                  title="Chiudi">✕</button>
              </div>
              <button
                onClick={() => setWishesMember(member)}
                data-testid={'bday-wishes-btn-' + member.id}
                style={{
                  width: '100%', padding: '9px 12px',
                  background: '#FF6B9D', color: 'white', border: 'none',
                  borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                }}>
                {isMe
                  ? `💌 ${t('wish_read_btn') || 'Leggi gli auguri'}${n > 0 ? ` (${n})` : ''}`
                  : `🎉 ${t('wish_write_btn') || 'Fai gli auguri'}${n > 0 ? ` · ${n} 💌` : ''}`}
              </button>
            </div>
          );
        })}

        {birthdayTomorrow.map((member) => {
          const age = getAge(member.birth_date);
          return (
            <div
              key={member.id}
              style={{
                padding: 14,
                background: 'linear-gradient(135deg, #FFD89B 0%, #FFC87C 100%)',
                border: '2px solid #FFB84D',
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🎂</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      Compleanno domani!
                    </div>
                    <div style={{ fontSize: 12, color: '#333' }}>
                      {member.name} compie {age + 1} anni
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => dismissReminder(member.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: '#666',
                  }}
                  title="Chiudi"
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => openGiftChat(member)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: '#FF6B9D',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  💝 Organizza regalo
                </button>
                <button
                  onClick={() => dismissReminder(member.id)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    color: '#333',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Ricordato! ✓
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {wishesMember && (
        <BirthdayWishesModal
          member={wishesMember}
          members={members}
          session={session}
          onClose={() => setWishesMember(null)}
        />
      )}

      {giftChatMember && (
        <GiftChatModal
          member={giftChatMember}
          members={members}
          familyId={familyId}
          currentUserId={session?.user?.id}
          onClose={() => setGiftChatMember(null)}
        />
      )}
    </>
  );
}
