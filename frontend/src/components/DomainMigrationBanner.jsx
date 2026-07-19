import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { APP_URL } from '../lib/appUrl.js';

const SNOOZE_KEY = 'fammy_domain_migration_snooze';
const SNOOZE_DAYS = 7;

/**
 * DomainMigrationBanner — 🚚 trasloco dominio.
 * Compare SOLO a chi sta usando l'app dal vecchio dominio (farxer.com):
 * su myfammy.app non esiste proprio. Rimandabile, ricompare dopo 7 giorni.
 * Serve per svuotare farxer.com prima della dismissione: quando su
 * Vercel Analytics il traffico farxer e' ~zero, si puo' spegnere.
 */
export default function DomainMigrationBanner() {
  const { t: __t0 } = useT();
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };

  const onOldDomain = typeof window !== 'undefined'
    && window.location.hostname.includes('farxer');

  const [hidden, setHidden] = useState(() => {
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      return Date.now() < until;
    } catch (_) { return false; }
  });

  if (!onOldDomain || hidden) return null;

  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    } catch (_) {}
    setHidden(true);
  };

  return (
    <div data-testid="domain-migration-banner" style={{
      margin: '0 16px 12px', padding: '14px 16px', borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(140,157,134,0.16), rgba(140,157,134,0.06))',
      border: '1.5px solid rgba(140,157,134,0.5)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--k)' }}>
        🚚 {t('dommig_h') || 'FAMMY ha un nuovo indirizzo!'}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--km)', marginTop: 4, lineHeight: 1.5 }}>
        {t('dommig_p') || 'Ci siamo trasferiti su myfammy.app. Questa versione continuera\u0300 a funzionare ancora per un po\u2019, ma prima o poi verra\u0300 spenta: apri il nuovo indirizzo, installa la nuova icona sulla Home e poi elimina questa. I tuoi dati restano identici, devi solo rifare il login.'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <a href={APP_URL} target="_blank" rel="noopener"
          data-testid="domain-migration-open"
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 12,
            background: 'var(--ac)', color: '#fff', fontWeight: 700,
            fontSize: 13, textAlign: 'center', textDecoration: 'none',
          }}>
          {t('dommig_open') || 'Apri myfammy.app'} →
        </a>
        <button type="button" onClick={snooze}
          data-testid="domain-migration-snooze"
          style={{
            padding: '10px 14px', borderRadius: 12,
            border: '1.5px solid var(--sm)', background: 'var(--s)',
            color: 'var(--km)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
          {t('dommig_later') || 'Piu\u0300 tardi'}
        </button>
      </div>
    </div>
  );
}
