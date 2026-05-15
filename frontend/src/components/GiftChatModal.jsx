import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import Avatar from './Avatar.jsx';

export default function GiftChatModal({ member, members, familyId, currentUserId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

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
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const submitMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setBusy(true);

    const { error } = await supabase.from('gift_messages').insert({
      family_id: familyId,
      birthday_member_id: member.id,
      author_member_id: currentUserId,
      message: newMessage.trim(),
    });

    if (!error) {
      setNewMessage('');
      await loadMessages();
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
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>Tutti i membri della famiglia possono aiutare</div>
          </div>
        </div>

        {/* Messages container */}
        <div style={{
          flex: 1, overflowY: 'auto', marginBottom: 12, paddingRight: 4,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--km)', fontSize: 12, margin: 'auto' }}>Caricamento...</div>
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
                      {new Date(msg.created_at).toLocaleDateString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

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
      </div>
    </div>
  );
}
