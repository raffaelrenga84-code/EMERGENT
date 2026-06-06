import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * CalendarFeedCard — sezione nel Profilo che permette di generare un
 * link ICS pubblico (URL personale segreto) da incollare in Apple Calendar
 * o Google Calendar per sincronizzazione automatica.
 *
 * Flow:
 *  1. All'apertura, RPC `get_calendar_token` verifica se l'utente ha già un token
 *  2. Se sì, mostra il link copiabile + bottone "Rigenera" (rotation per sicurezza)
 *  3. Se no, mostra bottone "Genera link" → RPC `rotate_calendar_token`
 *  4. Bottone "Copia link" + istruzioni veloci per i 2 calendar client
 *
 * IMPORTANTE: la URL del link deve puntare al backend FastAPI, NON al frontend.
 * In produzione (Vercel) il backend è su un altro dominio (configurato in
 * VITE_BACKEND_URL). In dev/preview, usa il REACT_APP_BACKEND_URL.
 */
export default function CalendarFeedCard({ session }) {
  const { t } = useT();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);

  // Backend URL: in produzione deve essere settato esplicitamente
  // (le PWA su Vercel hanno frontend e backend separati).
  const backendUrl = import.meta.env.VITE_BACKEND_URL
    || import.meta.env.REACT_APP_BACKEND_URL
    || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_calendar_token');
      if (!cancelled) {
        if (error) {
          // RPC non installata → mostra messaggio amichevole
          if (error.message?.includes('does not exist') || error.code === '42883') {
            setErr(t('cal_feed_sql_missing') || 'Funzione SQL non installata. Esegui fammy-calendar-tokens.sql su Supabase.');
          } else {
            setErr(error.message);
          }
        } else {
          setToken(data || null);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const generateOrRotate = async () => {
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('rotate_calendar_token');
    if (error) setErr(error.message);
    else setToken(data);
    setBusy(false);
  };

  const fullUrl = token && backendUrl
    ? `${backendUrl}/api/calendar/${token}.ics`
    : null;

  const copyToClipboard = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setErr(t('copy_failed') || 'Copia fallita');
    }
  };

  return (
    <div data-testid="calendar-feed-card" style={{
      padding: 14, background: 'white',
      border: '1px solid var(--sm)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>🗓️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--k)' }}>
            {t('cal_feed_h') || 'Link calendario (ICS)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 1 }}>
            {t('cal_feed_subtitle') || 'Sincronizza FAMMY con Apple Calendar o Google Calendar'}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--km)' }}>…</div>
      ) : err ? (
        <div style={{
          padding: '8px 10px', background: '#FDECEC', borderRadius: 8,
          fontSize: 12, color: '#A93B2B', fontWeight: 600,
        }}>
          ⚠️ {err}
        </div>
      ) : !token ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--km)', margin: 0, lineHeight: 1.5 }}>
            {t('cal_feed_intro') || 'Genera un link personale: contiene eventi e incarichi delle tue famiglie. Il link è segreto, condividilo solo con te stesso.'}
          </p>
          <button type="button" onClick={generateOrRotate} disabled={busy}
            data-testid="cal-feed-generate"
            className="btn full primary"
            style={{ fontSize: 13 }}>
            {busy ? '…' : (t('cal_feed_generate') || 'Genera link calendario')}
          </button>
        </>
      ) : (
        <>
          {!backendUrl && (
            <div style={{
              padding: '8px 10px', background: '#FFF6E5', borderRadius: 8,
              fontSize: 11, color: '#7A4E00', fontWeight: 600, lineHeight: 1.5,
            }}>
              ⚠️ {t('cal_feed_no_backend') || 'URL del backend non configurato. Aggiungi VITE_BACKEND_URL al frontend.'}
            </div>
          )}
          {fullUrl && (
            <div style={{
              padding: '8px 10px', background: 'var(--ab)',
              borderRadius: 8, border: '1px solid var(--sm)',
              fontFamily: 'monospace', fontSize: 11, color: 'var(--km)',
              wordBreak: 'break-all', lineHeight: 1.4,
              userSelect: 'all',
            }} data-testid="cal-feed-url">
              {fullUrl}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={copyToClipboard} disabled={!fullUrl}
              data-testid="cal-feed-copy"
              className="btn primary"
              style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}>
              {copied ? `✓ ${t('copied') || 'Copiato!'}` : `📋 ${t('cal_feed_copy') || 'Copia link'}`}
            </button>
            <button type="button" onClick={generateOrRotate} disabled={busy}
              data-testid="cal-feed-rotate"
              className="btn secondary"
              style={{ fontSize: 12, padding: '8px 12px' }}
              title={t('cal_feed_rotate_hint') || 'Invalida il vecchio e genera nuovo (se sospetti che sia stato condiviso per errore)'}>
              {busy ? '…' : `🔄 ${t('cal_feed_rotate') || 'Rigenera'}`}
            </button>
          </div>

          <button type="button" onClick={() => setShowInstructions((v) => !v)}
            data-testid="cal-feed-toggle-instructions"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--ac)', fontSize: 12, fontWeight: 700,
              padding: 0, textAlign: 'left',
            }}>
            {showInstructions ? '▾' : '▸'} {t('cal_feed_how') || 'Come usare il link'}
          </button>
          {showInstructions && (
            <div style={{
              padding: 10, borderRadius: 8, background: 'var(--ab)',
              border: '1px solid var(--sm)', fontSize: 11, lineHeight: 1.55,
              color: 'var(--k)',
            }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>📱 Apple Calendar (iPhone/Mac)</div>
              <ul style={{ margin: '0 0 10px 16px', padding: 0 }}>
                <li>Impostazioni → Calendario → Account → Aggiungi account → Altro</li>
                <li>"Aggiungi calendario sottoscritto" → incolla il link copiato</li>
              </ul>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>📅 Google Calendar</div>
              <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                <li>calendar.google.com → "Altri calendari" → "Da URL"</li>
                <li>Incolla il link, premi "Aggiungi calendario"</li>
              </ul>
              <div style={{
                marginTop: 8, padding: '6px 8px',
                background: '#FFF6E5', borderRadius: 6,
                fontSize: 10.5, color: '#7A4E00',
              }}>
                ⏱️ Il calendario si aggiorna in automatico ogni ~1h (Apple) / 12-24h (Google).
                Per refresh immediato, tieni premuto sul calendario → "Aggiorna".
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
