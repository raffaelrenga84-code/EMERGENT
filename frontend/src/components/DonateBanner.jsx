import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * DonateBanner — banner soft mostrato in cima alla Bacheca ogni ~14 giorni.
 * Discreto, dismissibile, non blocca l'UX. Tappandolo apre DonateModal.
 *
 * Stato in localStorage:
 *   fammy_donate_banner_last_dismiss   timestamp ms ultima X
 *   fammy_donate_banner_first_seen     timestamp ms primo accesso utente
 *
 * Regola: mostra se sono passati >= MIN_DAYS dal primo accesso E
 *         >= INTERVAL_DAYS dall'ultima dismissione.
 */
const STORAGE_DISMISS = 'fammy_donate_banner_last_dismiss';
const STORAGE_FIRST_SEEN = 'fammy_donate_banner_first_seen';
const MIN_DAYS_AFTER_INSTALL = 7;      // non rompo le scatole nei primi 7gg
const INTERVAL_DAYS = 14;              // poi ogni 14gg max

export default function DonateBanner({ onOpen }) {
  const { t } = useT();

  // Lazy initial state: calcoliamo la visibilità ONCE al mount, evitando
  // il pattern "useEffect → setState" che fa lampeggiare il banner.
  const [visible, setVisible] = useState(() => {
    try {
      const now = Date.now();
      let firstSeen = parseInt(localStorage.getItem(STORAGE_FIRST_SEEN) || '0', 10);
      if (!firstSeen) {
        firstSeen = now;
        localStorage.setItem(STORAGE_FIRST_SEEN, String(firstSeen));
      }
      const daysSinceInstall = (now - firstSeen) / (1000 * 60 * 60 * 24);
      if (daysSinceInstall < MIN_DAYS_AFTER_INSTALL) return false;

      const lastDismiss = parseInt(localStorage.getItem(STORAGE_DISMISS) || '0', 10);
      if (!lastDismiss) return true;

      const daysSinceDismiss = (now - lastDismiss) / (1000 * 60 * 60 * 24);
      return daysSinceDismiss >= INTERVAL_DAYS;
    } catch {
      return false;
    }
  });

  const dismiss = (e) => {
    e.stopPropagation();
    try { localStorage.setItem(STORAGE_DISMISS, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-testid="donate-banner"
      onClick={() => onOpen && onOpen()}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: '0 16px 12px',
        padding: '14px 16px',
        borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(193,98,75,0.08), rgba(212,160,84,0.10))',
        border: '1px solid rgba(193,98,75,0.20)',
        cursor: 'pointer',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(193,98,75,0.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <span style={{ fontSize: 28, flexShrink: 0 }}>☕</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)', marginBottom: 2 }}>
          {t('donate_banner_title') || 'Ti piace FAMMY?'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.4 }}>
          {t('donate_banner_body') || 'Offrici un caffè per tenerla gratuita e senza pubblicità.'}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        data-testid="donate-banner-dismiss"
        aria-label="Chiudi"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '1px solid rgba(193,98,75,0.20)',
          background: 'white',
          fontSize: 16, color: 'var(--km)',
          cursor: 'pointer', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
    </div>
  );
}
