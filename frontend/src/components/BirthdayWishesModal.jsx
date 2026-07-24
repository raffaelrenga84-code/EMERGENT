birthdimport { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import Avatar from './Avatar.jsx';

/**
 * BirthdayWishesModal — 🎂 chat degli auguri il GIORNO del compleanno.
 * A differenza della chat regalo (segreta), qui partecipano TUTTI,
 * festeggiato compreso: la famiglia scrive gli auguri, lui riceve la
 * push al primo messaggio e puo' rispondere.
 * Thread per famiglia + anno (birthday_wishes).
 */
export default function BirthdayWishesModal({ member, members, session, onClose }) {
  const { t: __t0 } = useT();
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  const [wishes, setWishes] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);

  const famId = member.family_id;
  const year = new Date().getFullYear();
  const myMember =
    members.find((m) => m.user_id === session?.user?.id && m.family_id === famId) ||
    members.find((m) => m.user_id === session?.user?.id) || null;
  const iAmBirthday = !!member.user_id && member.user_id === session?.user?.id;

  const load = async () => {
    try {
      const { data } = await supabase.from('birthday_wishes')
        .select('id, author_member_id, message, created_at')
        .eq('birthday_member_id', member.id)
        .eq('year', year)
        .order('created_at', { ascending: true });
      setWishes(data || []);
      setTimeout(() => listRef.current?.scrollTo(0, 99999), 50);
    } catch (_) { /* migration non ancora eseguita */ }
  };
  useEffect(() => { load(); }, [member.id]);

  const send = async (msg) => {
    const clean = (msg ?? text).trim();
    if (!clean) return;
    if (!myMember) {
      setErr(t('gift_send_err') || 'Il tuo account non è collegato a un membro di questa famiglia.');
      return;
    }
    setBusy(true); setErr('');
    const { error } = await supabase.from('birthday_wishes').insert({
      family_id: famId,
      birthday_member_id: member.id,
      year,
      author_member_id: myMember.id,
      message: clean,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setText('');
    load();
  };

  const authorOf = (id) => members.find((m) => m.id === id);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', height: '80dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {iAmBirthday
                ? `🎉 ${t('wish_h_own') || 'I tuoi auguri!'}`
                : `🎂 ${t('wish_h') || 'Auguri per'} ${member.name}!`}
            </h2>
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
              {t('wish_sub') || 'Tutta la famiglia può scrivere — anche il festeggiato risponde qui.'}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi"
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              border: '1px solid var(--sm)', background: 'var(--s)',
              color: 'var(--km)', fontSize: 15, cursor: 'pointer',
            }}>✕</button>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '4px 0' }}>
          {wishes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--km)', fontSize: 13, padding: '32px 12px' }}>
              {iAmBirthday
                ? (t('wish_empty_own') || 'Ancora nessun augurio… arriveranno! 🎈')
                : (t('wish_empty') || 'Nessun augurio ancora — scrivi tu il primo! 🎈')}
            </div>
          ) : wishes.map((w) => {
            const a = authorOf(w.author_member_id);
            const mine = a && myMember && a.id === myMember.id;
            return (
              <div key={w.id} style={{
                display: 'flex', gap: 8, marginBottom: 10,
                flexDirection: mine ? 'row-reverse' : 'row',
              }}>
                <Avatar name={a?.name || '?'} avatarColor={a?.avatar_color || '#1C1611'}
                  avatarLetter={a?.avatar_letter || (a?.name || '?').charAt(0)} size={28} />
                <div style={{
                  maxWidth: '75%', padding: '8px 12px', borderRadius: 14,
                  background: mine ? 'var(--ab)' : 'var(--s)',
                  border: '1px solid var(--sm)',
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--km)' }}>
                    {a?.name || '?'}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--k)', lineHeight: 1.4 }}>{w.message}</div>
                </div>
              </div>
            );
          })}
        </div>

        {err && <div style={{ color: 'var(--rd, #B4432F)', fontSize: 12, marginBottom: 6 }}>{err}</div>}

        {!iAmBirthday && wishes.length === 0 && (
          <button type="button" disabled={busy}
            onClick={() => send(`🎉 ${t('wish_quick') || 'Tanti auguri'} ${member.name}! 🎂`)}
            data-testid="wish-quick-btn"
            style={{
              marginBottom: 8, padding: '10px 12px', borderRadius: 12,
              border: '1.5px dashed var(--ac)', background: 'var(--ab)',
              color: 'var(--ac)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
            🎉 {t('wish_quick') || 'Tanti auguri'} {member.name}! 🎂
          </button>
        )}

        <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1 }}
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('wish_ph') || 'Scrivi i tuoi auguri…'}
            data-testid="wish-input" />
          <button type="submit" className="btn" disabled={busy || !text.trim()}
            style={{ width: 52, flexShrink: 0 }}>
            {busy ? '…' : '→'}
          </button>
        </form>
      </div>
    </div>
  );
}
