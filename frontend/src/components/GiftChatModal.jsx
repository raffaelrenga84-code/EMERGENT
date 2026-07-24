import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import Avatar from './Avatar.jsx';
import GiftIdeasModal from './GiftIdeasModal.jsx';

export default function GiftChatModal({ member, members, familyId, currentUserId, onClose }) {
  const { t: __t0 } = useT();
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showGiftIdeas, setShowGiftIdeas] = useState(false);
  const [participants, setParticipants] = useState([]); // member_id[]
  const listRef = useRef(null);

  // FIX invio: la famiglia è quella del festeggiato (in vista "Tutte" la
  // prop familyId è null → prima l'insert falliva in silenzio per NOT NULL),
  // e l'autore dev'essere un MEMBER id, non l'auth uid (FK su members).
  const famId = member.family_id || familyId;
  const myMember =
    members.find((m) => m.user_id === currentUserId && m.family_id === famId) ||
    members.find((m) => m.user_id === currentUserId) || null;

  // Candidati partecipanti: la famiglia del festeggiato, escluso il
  // festeggiato stesso (niente spoiler a chi compie gli anni).
  const candidates = members.filter(
    (m) => m.family_id === famId && m.id !== member.id
  );
  const toggleParticipant = async (mid) => {
    const selected = participants.includes(mid);
    setParticipants((p) => selected ? p.filter((x) => x !== mid) : [...p, mid]);
    // Persistenza best-effort (se la migration non è ancora eseguita,
    // la selezione resta solo per la sessione corrente).
    try {
      if (selected) {
        await supabase.from('gift_participants').delete()
          .eq('birthday_member_id', member.id).eq('member_id', mid);
      } else {
        await supabase.from('gift_participants').insert({
          birthday_member_id: member.id,
          family_id: famId,
          member_id: mid,
          added_by: myMember?.id || null,
        });
      }
    } catch (_) { /* tabella assente: ok */ }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('gift_participants')
          .select('member_id').eq('birthday_member_id', member.id);
        if (data) setParticipants(data.map((r) => r.member_id));
      } catch (_) { /* tabella assente */ }
    })();
  }, [member.id]);

  // Auto-scroll in fondo all'apertura e su nuovi messaggi
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length, loading]);

  useEffect(() => {
    loadMessages();
    // Setup realtime subscription
    const subscription = supabase
      .channel(`gift_${member.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'gift_messages',
        filter: `birthday_member_id=eq.${member.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages((prev) => [...prev, payload.new]);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [member.id]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('gift_messages')
      .select('*')
      .eq('birthday_member_id', member.id)
      .eq('family_id', famId)
      .order('created_at', { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const submitMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    if (!famId || !myMember) {
      setErr(t('gift_send_err') || 'Impossibile inviare: il tuo account non è collegato a un membro di questa famiglia.');
      return;
    }
    setBusy(true); setErr('');

    const { error } = await supabase.from('gift_messages').insert({
      family_id: famId,
      birthday_member_id: member.id,
      author_member_id: myMember.id,
      message: newMessage.trim(),
    });

    if (!error) {
      setNewMessage('');
      await loadMessages();
    } else {
      setErr(error.message);
    }
    setBusy(false);
  };

  const getAuthor = (memberId) => {
    return members.find((m) => m.id === memberId);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', height: '80vh', maxHeight: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--sm)' }}>
          <button type="button" onClick={onClose} className="link-btn" style={{ fontSize: 20 }}>‹</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>💝 Organizziamo il regalo per {member.name}</h2>
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>{t('gift_chat_all_help') || 'Tutti i membri della famiglia possono aiutare'}</div>
          </div>
          <button type="button" onClick={() => setShowGiftIdeas(true)}
            data-testid="gift-chat-ai-ideas"
            title={t('gift_ideas_btn') || 'Idee regalo AI'}
            style={{
              border: '1.5px dashed var(--ac)', background: 'var(--ab)',
              color: 'var(--ac)', borderRadius: 100, padding: '7px 12px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            ✨ {t('gift_ideas_btn') || 'Idee regalo AI'}
          </button>
        </div>

        {/* 👥 Chi partecipa al regalo (escluso il festeggiato) */}
        {candidates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--k)', marginBottom: 6 }}>
              👥 {t('gift_participants_h') || 'Chi partecipa al regalo'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {candidates.map((m) => {
                const sel = participants.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => toggleParticipant(m.id)}
                    data-testid={`gift-participant-${m.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 100, fontSize: 12,
                      border: `1.5px solid ${sel ? 'var(--ac)' : 'var(--sm)'}`,
                      background: sel ? 'var(--ab)' : 'var(--s)',
                      color: sel ? 'var(--ac)' : 'var(--km)',
                      fontWeight: sel ? 700 : 500, cursor: 'pointer',
                    }}>
                    {sel && <span>✓</span>}
                    <Avatar name={m.name} avatarColor={m.avatar_color || '#1C1611'}
                      avatarLetter={m.avatar_letter || m.name.charAt(0).toUpperCase()} size={18} />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages container */}
        <div ref={listRef} className="chat-scroll" style={{
          flex: 1, marginBottom: 12, paddingRight: 4,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--km)', fontSize: 12, margin: 'auto' }}>{t('loading') || 'Caricamento...'}</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--km)', fontSize: 12, margin: 'auto' }}>
              Nessun messaggio ancora. Inizia la conversazione!
            </div>
          ) : (
            messages.map((msg) => {
              const author = getAuthor(msg.author_member_id);
              return (
                <div key={msg.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {author && (
                    <Avatar
                      name={author.name}
                      avatarColor={author.avatar_color || '#1C1611'}
                      avatarLetter={author.avatar_letter || author.name.charAt(0).toUpperCase()}
                      size={28}
                      style={{ flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)' }}>
                      {author?.name || 'Anonimo'}
                    </div>
                    <div style={{
                      fontSize: 12, marginTop: 2, padding: '8px 10px',
                      background: 'var(--ab)', borderRadius: 8, wordWrap: 'break-word',
                    }}>
                      {msg.message}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--km)', marginTop: 3 }}>
                      {new Date(msg.created_at).toLocaleDateString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {err && (
          <div style={{ color: 'var(--rd, #B4432F)', fontSize: 12, marginBottom: 8 }}>{err}</div>
        )}

        {/* Message input */}
        <form onSubmit={submitMessage} style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <textarea
            className="input"
            style={{ flex: 1, resize: 'none', minHeight: 40 }}
            placeholder="Scrivi un'idea per il regalo..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={busy}
            rows={2}
          />
          <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }} disabled={busy || !newMessage.trim()}>
            {busy ? <span className="spin" /> : '→'}
          </button>
        </form>

        {showGiftIdeas && (
          <GiftIdeasModal
            member={{ ...member, birthdate: member.birth_date }}
            onClose={() => setShowGiftIdeas(false)}
          />
        )}
      </div>
    </div>
  );
}
