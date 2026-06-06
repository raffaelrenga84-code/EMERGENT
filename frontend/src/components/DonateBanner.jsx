import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * DonateBanner — banner soft mostrato in cima alla Bacheca.
 * Strategia UX: appare in momenti di valore percepito alto (più probabilità
 * di donazione, meno fastidio):
 *  - dopo MIN_DAYS_AFTER_INSTALL dal primo accesso
 *  - ogni INTERVAL_DAYS dall'ultima dismissione
 *  - extra trigger: dopo COMPLETED_TASKS_TRIGGER task completati dall'utente
 *    bypassa l'intervallo (l'utente ha appena "vinto" qualcosa → donazione naturale)
 *
 * Tappandolo apre DonateModal.
 */
const STORAGE_DISMISS = 'fammy_donate_banner_last_dismiss';
const STORAGE_FIRST_SEEN = 'fammy_donate_banner_first_seen';
const STORAGE_LAST_MILESTONE = 'fammy_donate_banner_last_milestone';
const MIN_DAYS_AFTER_INSTALL = 3;           // primi 3gg lascio in pace
const INTERVAL_DAYS = 7;                    // poi ogni 7gg
const MILESTONE_COOLDOWN_DAYS = 4;          // milestone trigger ogni 4gg al massimo

export default function DonateBanner({ onOpen, completedTaskCount = 0 }) {
  const { t } = useT();

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
      const daysSinceDismiss = lastDismiss ? (now - lastDismiss) / (1000 * 60 * 60 * 24) : Infinity;

      // Trigger 1: intervallo standard (7 giorni)
      if (daysSinceDismiss >= INTERVAL_DAYS) return true;

      // Trigger 2 (milestone): >= 10 task completati e cooldown rispettato.
      // Bypassa l'intervallo solo se non l'abbiamo usato negli ultimi 4gg.
      if (completedTaskCount >= 10) {
        const lastMilestone = parseInt(localStorage.getItem(STORAGE_LAST_MILESTONE) || '0', 10);
        const daysSinceMilestone = lastMilestone ? (now - lastMilestone) / (1000 * 60 * 60 * 24) : Infinity;
        if (daysSinceMilestone >= MILESTONE_COOLDOWN_DAYS && daysSinceDismiss >= 2) {
          localStorage.setItem(STORAGE_LAST_MILESTONE, String(now));
          return true;
        }
      }

      return false;
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
