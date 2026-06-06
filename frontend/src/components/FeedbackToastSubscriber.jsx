import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const ADMIN_EMAILS = new Set([
  'raffael.renga84@gmail.com',
  'rjphillpott@gmail.com',
]);

/**
 * FeedbackToastSubscriber — sottoscrive realtime a feedback_log e mostra un
 * toast in-app quando arriva un nuovo feedback. Visibile solo agli admin.
 * Per le push notification quando l'app è chiusa, c'è il trigger DB che
 * chiama send-push (vedi fammy-feedback-notify.sql).
 */
export default function FeedbackToastSubscriber({ session, onOpenInbox }) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const email = (session?.user?.email || '').toLowerCase();
    if (!ADMIN_EMAILS.has(email)) return;
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('feedback-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feedback_log' },
        async (payload) => {
          const row = payload?.new || {};
          // Skip se è feedback del mio stesso account
          if (row.user_id === session.user.id) return;

          let authorName = 'Anonimo';
          if (!row.is_anonymous) {
            try {
              const { data: prof } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', row.user_id)
                .maybeSingle();
              authorName = prof?.display_name || 'Utente';
            } catch {
              authorName = 'Utente';
            }
          }

          const ratingEmoji =
            row.rating >= 5 ? '🥰' :
            row.rating >= 4 ? '🙂' :
            row.rating >= 3 ? '😐' :
            row.rating >= 2 ? '😕' :
            row.rating >= 1 ? '😞' : '💬';

          setToast({
            id: row.id,
            emoji: ratingEmoji,
            author: authorName,
            preview: (row.message || '').slice(0, 100),
            anonymous: !!row.is_anonymous,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, session?.user?.email]);

  // Auto-dismiss dopo 7 secondi
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      data-testid="feedback-toast"
      style={{
        position: 'fixed',
        bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 'calc(100% - 32px)', width: 420,
        background: 'var(--k)', color: 'white',
        borderRadius: 16,
        padding: '12px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        animation: 'fammy-toast-up 220ms cubic-bezier(.2,.8,.3,1)',
      }}>
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>📬</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
          {toast.emoji} Nuovo feedback {toast.anonymous ? '· Anonimo' : `da ${toast.author}`}
        </div>
        <div style={{
          fontSize: 12, opacity: 0.85, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {toast.preview || '(solo rating)'}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setToast(null);
          onOpenInbox && onOpenInbox();
        }}
        data-testid="feedback-toast-open"
        style={{
          padding: '6px 12px', borderRadius: 100,
          background: 'var(--ac)', color: 'white',
          border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>Apri</button>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Chiudi"
        data-testid="feedback-toast-close"
        style={{
          padding: 0, width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', color: 'white',
          border: 'none', cursor: 'pointer',
          fontSize: 14, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
    </div>
  );
}
