import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * WeeklyEmailSyncToggle — toggle per attivare/disattivare il sync settimanale
 * del calendario via email.
 *
 * Comportamento:
 *  - Al mount carica `user_preferences.weekly_email_sync`
 *  - Toggle crea il record se non esiste (UPSERT)
 *  - Mostra anche l'email destinazione (di default `session.user.email`)
 *  - Mostra l'ultimo invio se presente
 */
export default function WeeklyEmailSyncToggle({ session }) {
  const { t } = useT();
  const userId = session?.user?.id;
  const userEmail = session?.user?.email || '';

  const [enabled, setEnabled] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // true se la tabella user_preferences non esiste in DB (migration mancante).
  // In quel caso mostriamo un messaggio educato invece dell'errore tecnico.
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('weekly_email_sync, weekly_email_last_sent_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error && error.code !== 'PGRST116') {
        // PGRST205 = table not found in schema cache
        // 42P01 = relation does not exist
        if (
          error.code === 'PGRST205' ||
          error.code === '42P01' ||
          (error.message || '').toLowerCase().includes('could not find the table')
        ) {
          setTableMissing(true);
        } else {
          setErr(error.message);
        }
      } else if (data) {
        setEnabled(!!data.weekly_email_sync);
        setLastSentAt(data.weekly_email_last_sent_at);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = async () => {
    if (!userId || tableMissing) return;
    setSaving(true); setErr('');
    const next = !enabled;
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        weekly_email_sync: next,
      }, { onConflict: 'user_id' });
    if (error) {
      if (
        error.code === 'PGRST205' || error.code === '42P01' ||
        (error.message || '').toLowerCase().includes('could not find the table')
      ) {
        setTableMissing(true);
      } else {
        setErr(error.message);
      }
    } else {
      setEnabled(next);
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: {
          text: next
            ? `📅 ${t('wsync_enabled_toast') || 'Riceverai il calendario ogni domenica sera'}`
            : (t('wsync_disabled_toast') || 'Sync disattivato'),
          tone: next ? 'success' : 'info',
        },
      }));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 14, color: 'var(--km)', fontSize: 13 }}>
        {t('loading') || 'Caricamento…'}
      </div>
    );
  }

  // Migration mancante: non mostriamo nulla. La funzionalità si renderizza
  // automaticamente non appena l'utente esegue fammy-weekly-sync.sql.
  if (tableMissing) return null;

  return (
    <div
      data-testid="weekly-sync-toggle"
      style={{
        padding: 16,
        background: 'white',
        border: enabled ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
        borderRadius: 16,
        boxShadow: enabled ? '0 4px 12px rgba(193,98,75,0.12)' : '0 1px 4px rgba(28,22,17,0.04)',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>📅</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
            {t('wsync_title') || 'Sync automatico settimanale'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.45 }}>
            {t('wsync_subtitle') || 'Ricevi un\'email ogni domenica sera con il calendario .ics da importare su iPhone o Google Calendar.'}
          </div>
        </div>
        <ToggleSwitch
          checked={enabled}
          disabled={saving}
          onChange={toggle}
          testid="weekly-sync-switch"
        />
      </div>

      {enabled && userEmail && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'var(--ab)', borderRadius: 10,
          fontSize: 12, color: 'var(--km)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>📧</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--k)' }}>
              {userEmail}
            </div>
            {lastSentAt ? (
              <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
                {t('wsync_last_sent') || 'Ultimo invio'}: {new Date(lastSentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
                {t('wsync_next_sunday') || 'Prima email: domenica sera'}
              </div>
            )}
          </div>
        </div>
      )}

      {err && (
        <div style={{
          marginTop: 8, padding: '6px 10px',
          background: 'rgba(231,76,60,0.10)', border: '1px solid var(--rd)',
          borderRadius: 8, color: 'var(--rd)', fontSize: 12, fontWeight: 600,
        }}>⚠️ {err}</div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange, testid }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      data-testid={testid}
      style={{
        width: 48, height: 28,
        borderRadius: 100, padding: 2,
        border: 'none', cursor: disabled ? 'wait' : 'pointer',
        background: checked ? 'var(--ac)' : 'var(--sm)',
        position: 'relative', flexShrink: 0,
        transition: 'background 200ms ease',
      }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        transform: checked ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 200ms cubic-bezier(.2,.8,.3,1)',
      }} />
    </button>
  );
}
