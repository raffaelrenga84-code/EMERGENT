import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import OnboardingTour from './OnboardingTour.jsx';
import WelcomeHubModal from './WelcomeHubModal.jsx';

/**
 * HelpMenu — pulsante "?" nell header Bacheca.
 * Apre un mini-menu con: tour, schermata avvio, guida installazione.
 */
export default function HelpMenu({ session, profile, families }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showHub, setShowHub] = useState(false);

  const items = [
    {
      icon: '📖',
      label: t('help_tour') || 'Tour rapido',
      sub: t('help_tour_sub') || 'Rivedi le funzioni principali',
      action: () => { setOpen(false); setShowTour(true); },
      testid: 'help-tour',
    },
    {
      icon: '🚀',
      label: t('help_welcome') || 'Schermata di avvio',
      sub: t('help_welcome_sub') || 'Crea famiglia, aggiungi incarichi o demo',
      action: () => { setOpen(false); setShowHub(true); },
      testid: 'help-welcome',
    },
    {
      icon: '📱',
      label: t('help_install') || "Installa l'app",
      sub: t('help_install_sub') || 'Guida per iPhone e Android',
      action: () => { setOpen(false); window.open('/ios-install.html', '_blank'); },
      testid: 'help-install',
    },
  ];

  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)}
        data-testid="help-menu-btn"
        aria-label={t('help_btn') || 'Aiuto'}
        title={t('help_btn') || 'Aiuto'}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: open ? 'var(--k)' : 'white',
          border: '1px solid var(--sm)',
          color: open ? 'white' : 'var(--km)',
          fontSize: 15, fontWeight: 800, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s',
        }}>?</button>

      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
          {/* Menu */}
          <div style={{
            position: 'absolute', top: 50, right: 12, zIndex: 99,
            background: 'white', borderRadius: 16,
            border: '1px solid var(--sm)',
            boxShadow: '0 8px 32px rgba(28,22,17,0.13)',
            minWidth: 230, overflow: 'hidden',
          }} data-testid="help-menu-panel">
            <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 700,
              color: 'var(--km)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('help_menu_title') || 'Aiuto'}
            </div>
            {items.map((it) => (
              <button key={it.testid} type="button" onClick={it.action}
                data-testid={it.testid}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  borderTop: '1px solid var(--sm)',
                }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{it.icon}</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--k)' }}>{it.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--km)' }}>{it.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {showTour && <OnboardingTour onClose={() => setShowTour(false)} />}
      {showHub && (
        <WelcomeHubModal
          session={session} profile={profile} families={families}
          onClose={() => setShowHub(false)}
        />
      )}
    </>
  );
}
