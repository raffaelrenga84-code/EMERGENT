import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { APP_URL } from '../lib/appUrl.js';

const SNOOZE_KEY = 'fammy_domain_migration_snooze';
const SNOOZE_DAYS = 7;

/**
 * DomainMigrationBanner — 🚚 trasloco dominio, versione a SCHERMO INTERO.
 * Compare SOLO su farxer.com (vecchio dominio); su myfammy.app non esiste.
 * Problema che risolve: farxer.com e myfammy.app sono lo stesso deploy →
 * stessa icona → l'utente vede due icone identiche e non sa quale usare.
 * Qui glielo diciamo in modo inconfondibile, con il trucco per distinguerle
 * ("quella giusta è l'unica che NON mostra questo avviso"). Rimandabile 7gg
 * così non blocchiamo chi non può migrare subito.
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

  const steps = [
    t('dommig_step1') || 'Apri myfammy.app (col bottone qui sotto)',
    t('dommig_step2') || 'Aggiungila alla schermata Home',
    t('dommig_step3') || 'Elimina questa vecchia icona',
  ];

  return (
    <div data-testid="domain-migration-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(28,22,17,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--s)',
        borderRadius: 24, padding: '26px 22px',
        boxShadow: '0 24px 60px rgba(28,22,17,0.28)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>🚚</div>
        <h2 style={{
          margin: 0, textAlign: 'center', fontSize: 21, fontWeight: 800,
          color: 'var(--k)', lineHeight: 1.15,
        }}>
          {t('dommig_h') || 'FAMMY ha un nuovo indirizzo!'}
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--km)', lineHeight: 1.55, marginTop: 10, textAlign: 'center' }}>
          {t('dommig_p') || 'Ci siamo trasferiti su myfammy.app. Questa vecchia versione verrà spenta. I tuoi dati restano identici: devi solo rifare il login.'}
        </p>

        {/* Passi */}
        <ol style={{
          margin: '16px 0', padding: 0, listStyle: 'none',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {steps.map((s, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                flex: '0 0 26px', width: 26, height: 26, borderRadius: '50%',
                background: 'var(--ac)', color: '#fff', fontWeight: 800, fontSize: 13,
                display: 'grid', placeItems: 'center',
              }}>{i + 1}</span>
              <span style={{ fontSize: 14, color: 'var(--k)', fontWeight: 500 }}>{s}</span>
            </li>
          ))}
        </ol>

        {/* Trucco per distinguere le due icone identiche */}
        <div style={{
          background: 'rgba(212,163,91,0.14)', border: '1px solid rgba(212,163,91,0.5)',
          borderRadius: 14, padding: '12px 14px', fontSize: 12.5,
          color: 'var(--k)', lineHeight: 1.5, marginBottom: 18,
        }}>
          💡 {t('dommig_icon_tip') || 'Le due icone sembrano identiche: quella giusta è l\u2019unica che NON mostra questo avviso. Se aprendo un\u2019icona vedi questo messaggio, è la vecchia — eliminala.'}
        </div>

        <a href={APP_URL} target="_blank" rel="noopener"
          data-testid="domain-migration-open"
          style={{
            display: 'block', padding: '14px', borderRadius: 14,
            background: 'var(--ac)', color: '#fff', fontWeight: 800,
            fontSize: 15, textAlign: 'center', textDecoration: 'none',
          }}>
          {t('dommig_open') || 'Apri myfammy.app'} →
        </a>
        <button type="button" onClick={snooze}
          data-testid="domain-migration-snooze"
          style={{
            width: '100%', marginTop: 10, padding: '11px', borderRadius: 14,
            border: '1.5px solid var(--sm)', background: 'transparent',
            color: 'var(--km)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
          {t('dommig_later') || 'Continua per ora'}
        </button>
      </div>
    </div>
  );
}
