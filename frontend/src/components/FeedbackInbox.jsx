import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * FeedbackInbox — modal che elenca tutti i feedback ricevuti.
 * Visibile solo agli admin (vedi isAdminEmail in ProfileTab).
 *
 * Mostra rating, messaggio, autore (display_name + email/phone), data,
 * lingua app e numero famiglie. Permette di marcare un feedback come "letto".
 */
const RATING_LABEL = {
  5: '🥰 Adoro',
  4: '🙂 Bello',
  3: '😐 Neutro',
  2: '😕 Migliorabile',
  1: '😞 Non mi piace',
  0: '—',
};

function fmtDate(iso, lang) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function FeedbackInbox({ onClose }) {
  const { t, lang } = useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all'); // all | unread

  const load = async () => {
    setLoading(true); setErr('');
    try {
      // Step 1: feedback con join profilo per nome
      let q = supabase
        .from('feedback_log')
        .select('id, user_id, rating, message, app_lang, created_at, read_at, is_anonymous')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data: feedbacks, error } = await q;
      if (error) throw error;

      // Step 2: arricchimento con display_name SOLO per feedback non anonimi.
      const userIds = [...new Set(
        feedbacks.filter((f) => !f.is_anonymous).map((f) => f.user_id).filter(Boolean)
      )];
      const profilesById = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, phone')
          .in('id', userIds);
        (profs || []).forEach((p) => { profilesById[p.id] = p; });
      }

      setRows(feedbacks.map((f) => ({
        ...f,
        author_name: f.is_anonymous
          ? (t('inbox_anonymous') || 'Anonimo')
          : (profilesById[f.user_id]?.display_name || '?'),
        author_phone: f.is_anonymous ? null : (profilesById[f.user_id]?.phone || null),
      })));
    } catch (e) {
      setErr(e?.message || 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    const optimistic = rows.map((r) => r.id === id ? { ...r, read_at: new Date().toISOString() } : r);
    setRows(optimistic);
    await supabase.from('feedback_log')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  };

  const shown = filter === 'unread' ? rows.filter((r) => !r.read_at) : rows;
  const unreadCount = rows.filter((r) => !r.read_at).length;

  return (
    <div
      data-testid="feedback-inbox-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(28,22,17,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="feedback-inbox"
        style={{
          width: '100%', maxWidth: 560, background: 'var(--bg)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 'calc(20px + env(safe-area-inset-top, 0px)) 0 calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        }}>
        {/* Header sticky */}
        <div style={{
          padding: '0 20px 14px',
          borderBottom: '1px solid var(--sm)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 26 }}>📬</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--k)' }}>
              {t('inbox_title') || 'Feedback ricevuti'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
              {rows.length} {t('inbox_total') || 'totali'}
              {unreadCount > 0 && <> · <strong style={{ color: 'var(--ac)' }}>{unreadCount} {t('inbox_unread') || 'da leggere'}</strong></>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="feedback-inbox-close"
            aria-label="Chiudi"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '1px solid var(--sm)', background: 'white',
              cursor: 'pointer', fontSize: 18, color: 'var(--km)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
        </div>

        {/* Filtri */}
        <div style={{ padding: '10px 20px 6px', display: 'flex', gap: 8 }}>
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('inbox_all') || 'Tutti'} · {rows.length}
          </FilterPill>
          <FilterPill active={filter === 'unread'} onClick={() => setFilter('unread')}>
            {t('inbox_unread') || 'Da leggere'} · {unreadCount}
          </FilterPill>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--km)' }}>
              <span className="spin dark" />
            </div>
          )}
          {err && (
            <div style={{
              background: 'var(--amB)', border: '1px solid var(--am)',
              borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--ac)',
            }}>{err}</div>
          )}
          {!loading && shown.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: 'var(--km)', fontSize: 14,
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
              {filter === 'unread'
                ? (t('inbox_empty_unread') || 'Nessun feedback non letto.')
                : (t('inbox_empty') || 'Nessun feedback ancora.')}
            </div>
          )}
          {!loading && shown.map((r) => (
            <FeedbackCard
              key={r.id}
              row={r}
              lang={lang}
              onMarkRead={() => !r.read_at && markRead(r.id)}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterPill({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 100,
        border: active ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
        background: active ? 'var(--ab)' : 'white',
        color: active ? 'var(--ac)' : 'var(--km)',
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>
      {children}
    </button>
  );
}

function FeedbackCard({ row, lang, onMarkRead, t }) {
  const unread = !row.read_at;
  return (
    <div
      data-testid={`feedback-card-${row.id}`}
      onClick={onMarkRead}
      style={{
        background: 'white',
        border: `1px solid ${unread ? 'var(--ac)' : 'var(--sm)'}`,
        borderLeft: `4px solid ${unread ? 'var(--ac)' : 'var(--sm)'}`,
        borderRadius: 14, padding: '14px 16px',
        marginBottom: 10, cursor: unread ? 'pointer' : 'default',
        boxShadow: unread ? '0 2px 8px rgba(193,98,75,0.08)' : 'none',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>
          {row.is_anonymous ? '🕵️' : (RATING_LABEL[row.rating] || RATING_LABEL[0])}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--k)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: row.is_anonymous ? 'italic' : 'normal',
          }}>{row.author_name}</div>
          <div style={{ fontSize: 11, color: 'var(--km)' }}>
            {!row.is_anonymous && (RATING_LABEL[row.rating] || RATING_LABEL[0])}
            {!row.is_anonymous && ' · '}
            {fmtDate(row.created_at, lang)}
            {row.app_lang && <> · <span style={{ textTransform: 'uppercase' }}>{row.app_lang}</span></>}
          </div>
        </div>
        {unread && (
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: 'var(--ac)', flexShrink: 0,
          }} title="Non letto" />
        )}
      </div>
      {row.message && (
        <div style={{
          fontSize: 14, color: 'var(--k)', lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{row.message}</div>
      )}
      {!row.message && (
        <div style={{ fontSize: 13, color: 'var(--kl)', fontStyle: 'italic' }}>
          {t('inbox_no_message') || '(nessun messaggio, solo rating)'}
        </div>
      )}
    </div>
  );
}
