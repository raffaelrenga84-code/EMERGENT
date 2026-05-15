import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getAge } from '../lib/birthdayUtils.js';
import GiftChatModal from './GiftChatModal.jsx';

/**
 * Componente che mostra un reminder di compleanno domani
 * Da mostrare nella Bacheca il giorno prima del compleanno
 */
export default function BirthdayReminder({ members, session, familyId, families = [] }) {
  const [dismissed, setDismissed] = useState({});
  const [giftChatMember, setGiftChatMember] = useState(null);

  // Trova chi ha il compleanno domani
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const birthdayTomorrow = members.filter((m) => {
    if (!m.birth_date || dismissed[m.id]) return false;
    const birth = new Date(m.birth_date + 'T00:00:00Z');
    return birth.getMonth() === tomorrow.getMonth() && birth.getDate() === tomorrow.getDate();
  });

  if (birthdayTomorrow.length === 0) return null;

  const dismissReminder = (memberId) => {
    setDismissed((prev) => ({ ...prev, [memberId]: true }));
  };

  const openGiftChat = (member) => {
    setGiftChatMember(member);
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
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
