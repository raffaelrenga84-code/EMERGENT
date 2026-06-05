import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * AbsenceCommentsThread — thread di commenti per un'assenza.
 *
 * Funzionalità minimal (MVP):
 *  - Lista commenti ordinati cronologicamente
 *  - Input testuale + invia
 *  - Avatar+nome dell'autore (snapshot da display_name)
 *  - Auto-refresh ogni 4s (no realtime per semplicità)
 *  - Empty state friendly
 *
 * Richiede migration SQL `fammy-absence-comments.sql`.
 */
export default function AbsenceCommentsThread({ absenceId, session, profile }) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [profilesByUser, setProfilesByUser] = useState({});
  const scrollRef = useRef(null);

  const load = async () => {
    const { data, error } = await supabase.from('absence_responses')
      .select('*')
      .eq('absence_id', absenceId)
      .order('created_at', { ascending: true });
    if (error) {
      // Tabella non esiste → migration non eseguita, fail silente
      if (/absence_responses/i.test(error.message)) {
        setErr(t('absence_comments_missing_sql') ||
          'Esegui fammy-absence-comments.sql per attivare i commenti.');
      }
      return;
    }
    setItems(data || []);
    // Carica display_name dei profili autori (batch)
    const authors = Array.from(new Set((data || []).map((r) => r.author_id)));
    if (authors.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', authors);
      const map = {};
      (profs || []).forEach((p) => { map[p.id] = p; });
      setProfilesByUser(map);
    }
  };

  useEffect(() => {
    if (!absenceId) return;
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absenceId]);

  // Auto-scroll in fondo quando arrivano nuovi messaggi
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('absence_responses').insert({
      absence_id: absenceId,
      author_id: session.user.id,
      text,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDraft('');
    load();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div data-testid="absence-comments-thread" style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--km)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        marginBottom: 8,
      }}>
        💬 {t('absence_comments_h') || 'Commenti'} {items.length > 0 && `(${items.length})`}
      </div>

      {err && (
        <div style={{
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(231, 76, 60, 0.10)', color: 'var(--rd)',
          fontSize: 12, fontWeight: 600, marginBottom: 8,
        }}>{err}</div>
      )}

      <div
        ref={scrollRef}
        style={{
          maxHeight: 280, overflowY: 'auto',
          background: 'var(--ab)', border: '1px solid var(--sm)',
          borderRadius: 12, padding: 10, marginBottom: 8,
        }}>
        {items.length === 0 ? (
          <div style={{
            padding: '24px 12px', textAlign: 'center',
            color: 'var(--km)', fontSize: 12,
          }}>
            {t('absence_comments_empty') ||
              'Nessun commento ancora. Lascia info di viaggio, contatti o raccomandazioni.'}
          </div>
        ) : (
          items.map((r) => {
            const isMine = r.author_id === session.user.id;
            const author = profilesByUser[r.author_id] || {};
            const name = isMine
              ? (t('you') || 'Tu')
              : (author.display_name || 'Membro');
            return (
              <div
                key={r.id}
                data-testid={`absence-comment-${r.id}`}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginBottom: 8,
                }}>
                <div style={{
                  fontSize: 10, color: 'var(--km)', marginBottom: 2,
                  padding: '0 8px',
                }}>{name}</div>
                <div style={{
                  padding: '8px 12px', borderRadius: 14,
                  background: isMine ? 'var(--ac)' : 'white',
                  color: isMine ? 'white' : 'var(--k)',
                  fontSize: 14, lineHeight: 1.4,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap',
                  border: isMine ? 'none' : '1px solid var(--sm)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>{r.text}</div>
                <div style={{ fontSize: 10, color: 'var(--km)', marginTop: 2, padding: '0 8px' }}>
                  {new Date(r.created_at).toLocaleString(undefined, {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('absence_comments_placeholder') || 'Scrivi un commento...'}
          data-testid="absence-comment-input"
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !draft.trim()}
          data-testid="absence-comment-send-btn"
          style={{
            padding: '0 16px', borderRadius: 12,
            background: 'var(--ac)', color: 'white',
            border: 'none', fontSize: 14, fontWeight: 700,
            cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !draft.trim() ? 0.5 : 1,
            flexShrink: 0,
          }}>
          {busy ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}
