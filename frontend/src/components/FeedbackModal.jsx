import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * FeedbackModal — l'utente esprime un rating (1-5) + messaggio libero.
 * Invia a Edge Function `send-feedback-email` che inoltra via Resend
 * all'indirizzo di Raffael (default: raffael.renga84@gmail.com).
 */
const RATINGS = [
  { value: 1, emoji: '😞', labelKey: 'feedback_r1' },
  { value: 2, emoji: '😕', labelKey: 'feedback_r2' },
  { value: 3, emoji: '😐', labelKey: 'feedback_r3' },
  { value: 4, emoji: '🙂', labelKey: 'feedback_r4' },
  { value: 5, emoji: '🥰', labelKey: 'feedback_r5' },
];

export default function FeedbackModal({ onClose }) {
  const { t } = useT();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setErr('');
    if (!rating && !message.trim()) {
      setErr(t('feedback_err_empty') || 'Aggiungi una valutazione o un messaggio.');
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('not_authenticated');

      // INSERT diretto in feedback_log (la RLS controlla user_id = auth.uid()).
      // Gli admin (Raffael, Rex) leggono tutto dalla sezione "Feedback ricevuti".
      const { data: profile } = await supabase
        .from('profiles')
        .select('language')
        .eq('id', session.user.id)
        .maybeSingle();

      const { error } = await supabase.from('feedback_log').insert({
        user_id: session.user.id,
        rating: rating || 0,
        message: message.trim(),
        app_lang: profile?.language || null,
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e?.message || 'Errore di invio. Riprova più tardi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="feedback-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(28,22,17,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="feedback-modal"
        style={{
          width: '100%', maxWidth: 460, background: 'white',
          borderRadius: 22,
          padding: 'calc(22px + env(safe-area-inset-top, 0px)) 22px 22px',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, var(--gn), var(--ac))',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, flexShrink: 0,
          }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--k)' }}>
              {t('feedback_title') || 'Dacci un feedback'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.4 }}>
              {t('feedback_subtitle') || 'Cosa pensi di FAMMY? Ci aiuti a migliorare.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="feedback-close-btn"
            aria-label="Chiudi"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '1px solid var(--sm)', background: 'white',
              cursor: 'pointer', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: 'var(--km)',
            }}>×</button>
        </div>

        {sent ? (
          <div style={{
            background: 'var(--gnB)', border: '1px solid var(--gn)',
            borderRadius: 14, padding: '22px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--k)', marginBottom: 4 }}>
              {t('feedback_sent_h') || 'Grazie!'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--km)', marginBottom: 16 }}>
              {t('feedback_sent_p') || 'Abbiamo ricevuto il tuo feedback. Lo leggiamo personalmente.'}
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="feedback-sent-close"
              style={{
                padding: '10px 22px', borderRadius: 100,
                background: 'var(--ac)', color: 'white', border: 'none',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{t('close') || 'Chiudi'}</button>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--km)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 8,
            }}>
              {t('feedback_rate_h') || 'Quanto ti piace FAMMY?'}
            </div>
            <div style={{
              display: 'flex', gap: 6, marginBottom: 16,
              justifyContent: 'space-between',
            }}>
              {RATINGS.map((r) => {
                const active = rating === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRating(r.value)}
                    data-testid={`feedback-rating-${r.value}`}
                    style={{
                      flex: 1,
                      padding: '12px 6px', borderRadius: 14,
                      border: `2px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
                      background: active ? 'var(--ab)' : 'white',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 180ms ease',
                      transform: active ? 'scale(1.05)' : 'scale(1)',
                    }}>
                    <span style={{ fontSize: 28 }}>{r.emoji}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--km)' }}>
                      {t(r.labelKey) || ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--km)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 8,
            }}>
              {t('feedback_msg_h') || 'Vuoi dirci qualcosa?'}
            </div>
            <textarea
              data-testid="feedback-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback_msg_placeholder') || 'Cosa ti piace? Cosa potremmo migliorare? Hai un\'idea?'}
              maxLength={2000}
              rows={5}
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: 12, border: '1px solid var(--sm)',
                fontSize: 14, fontFamily: 'inherit', color: 'var(--k)',
                resize: 'vertical', minHeight: 110, marginBottom: 4,
                background: 'var(--ab)', outline: 'none',
              }} />
            <div style={{ fontSize: 11, color: 'var(--kl)', textAlign: 'right', marginBottom: 14 }}>
              {message.length}/2000
            </div>

            {err && (
              <div style={{
                background: 'var(--amB)', border: '1px solid var(--am)',
                borderRadius: 10, padding: '10px 12px',
                fontSize: 13, color: 'var(--ac)', marginBottom: 12,
              }}>{err}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              data-testid="feedback-submit-btn"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 14,
                background: 'var(--ac)', color: 'white',
                border: 'none', cursor: busy ? 'wait' : 'pointer',
                fontSize: 15, fontWeight: 700,
                opacity: busy ? 0.7 : 1,
                boxShadow: '0 2px 8px rgba(193,98,75,0.3)',
              }}>
              {busy ? (t('feedback_sending') || 'Invio...') : (t('feedback_send') || 'Invia feedback')}
            </button>

            <p style={{
              margin: '12px 0 0', fontSize: 11, color: 'var(--kl)',
              lineHeight: 1.5, textAlign: 'center',
            }}>
              {t('feedback_privacy') ||
                'Riceveremo email, nome e contatti del tuo profilo per poterti rispondere. Niente di più.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
