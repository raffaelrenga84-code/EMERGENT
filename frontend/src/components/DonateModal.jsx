import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * DonateModal — "Offrici un caffè" per supportare FAMMY.
 *
 * COMPLIANCE LEGALE (Italia):
 * Le donazioni sono presentate come LIBERALITÀ (art. 783 c.c.), facoltative,
 * senza contropartita, di modico valore. Non danno diritto a alcun servizio
 * extra o vantaggio. Disclaimer visibile nel modal.
 *
 * PayPal Pool non accetta amount preimpostato in URL: gli importi mostrati
 * sono solo SUGGERIMENTI UX. L'utente sceglie a mano sul Pool.
 */
const POOL_URL = 'https://www.paypal.com/pool/9pOzycLGmt?sr=wccr';
const SUGGESTED = [
  { amount: 2,  emoji: '☕', labelKey: 'donate_amt_coffee' },
  { amount: 5,  emoji: '🥐', labelKey: 'donate_amt_snack' },
  { amount: 10, emoji: '🍕', labelKey: 'donate_amt_pizza' },
  { amount: 20, emoji: '❤️', labelKey: 'donate_amt_love' },
];

export default function DonateModal({ onClose }) {
  const { t } = useT();
  const [hovered, setHovered] = useState(null);

  const openPool = (suggested) => {
    // Tracking locale opzionale (es. analytics futura).
    try { localStorage.setItem('fammy_last_donate_suggested', String(suggested)); } catch { /* ignore */ }
    window.open(POOL_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      data-testid="donate-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(28,22,17,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="donate-modal"
        style={{
          width: '100%', maxWidth: 460, background: 'white',
          borderRadius: 22,
          padding: 'calc(22px + env(safe-area-inset-top, 0px)) 22px 22px',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, var(--ac), var(--am))',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, flexShrink: 0,
          }}>☕</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--k)' }}>
              {t('donate_title') || 'Offrici un caffè'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.4 }}>
              {t('donate_subtitle') || 'FAMMY è gratis e senza pubblicità. Se ti piace, puoi sostenerci liberamente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="donate-close-btn"
            aria-label="Chiudi"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '1px solid var(--sm)', background: 'white',
              cursor: 'pointer', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: 'var(--km)',
            }}>×</button>
        </div>

        {/* Importi suggeriti — solo UX, PayPal Pool non preimposta amount via URL */}
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--km)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          marginBottom: 8, marginTop: 4,
        }}>
          {t('donate_pick_amount') || 'Quanto vuoi offrire?'}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          marginBottom: 14,
        }}>
          {SUGGESTED.map((s) => (
            <button
              key={s.amount}
              type="button"
              onMouseEnter={() => setHovered(s.amount)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => openPool(s.amount)}
              data-testid={`donate-amount-${s.amount}`}
              style={{
                padding: '14px 12px', borderRadius: 14,
                border: `2px solid ${hovered === s.amount ? 'var(--ac)' : 'var(--sm)'}`,
                background: hovered === s.amount ? 'var(--ab)' : 'white',
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 180ms ease',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--k)' }}>€{s.amount}</div>
                <div style={{ fontSize: 11, color: 'var(--km)' }}>{t(s.labelKey) || ''}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Custom: "Altro importo" → apre Pool senza suggerimento */}
        <button
          type="button"
          onClick={() => openPool(null)}
          data-testid="donate-custom-btn"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 14,
            background: 'var(--ac)', color: 'white',
            border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 2px 8px rgba(193,98,75,0.3)',
            marginBottom: 14,
          }}>
          <span>{t('donate_open_paypal') || 'Apri PayPal'}</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>→</span>
        </button>

        {/* Disclaimer legale — fondamentale per la compliance "liberalità d'uso" */}
        <div style={{
          background: 'var(--ab)', borderRadius: 12,
          padding: '12px 14px', fontSize: 11, color: 'var(--km)',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--k)', marginBottom: 4 }}>
            {t('donate_legal_title') || 'Info'}
          </div>
          <p style={{ margin: 0 }}>
            {t('donate_legal_body') ||
              'Le offerte sono libere e facoltative, di modico valore, senza contropartita e non danno diritto ad alcun bene o servizio aggiuntivo. Rientrano nelle "liberalità d\'uso" (art. 783 c.c.) e nei doni di modico valore. FAMMY rimane gratuita per tutti.'}
          </p>
        </div>
      </div>
    </div>
  );
}
