import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import JoinFamilyByCodeModal from './JoinFamilyByCodeModal.jsx';

const WELCOME_HIDE_KEY = 'fammy_welcome_hidden';

export function getWelcomeHidden() {
  try { return localStorage.getItem(WELCOME_HIDE_KEY) === '1'; } catch { return false; }
}
export function setWelcomeHidden(v) {
  try { localStorage.setItem(WELCOME_HIDE_KEY, v ? '1' : '0'); } catch {}
}

/**
 * WelcomeHubModal — la schermata di avvio come modal rivedibile.
 * Usata da HelpMenu (utenti già attivi) e dall App.jsx per i nuovi.
 * Ha la spunta "Non mostrare più" in basso: reversibile dal Profilo
 * (pulsante "? Aiuto" che azzera il flag) o da HelpMenu stesso.
 */
export default function WelcomeHubModal({ session, profile, families = [], onClose, onCreated }) {
  const { t } = useT();
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [dontShow, setDontShow] = useState(getWelcomeHidden());
  const isExistingUser = families.length > 0;

  const handleClose = () => {
    setWelcomeHidden(dontShow);
    onClose && onClose();
  };

  const actions = [
    {
      emoji: '👨‍👩‍👧‍👦',
      title: t('hub_card_family_t') || 'Crea una famiglia',
      sub: t('hub_card_family_s') || 'Dai un nome e invita i tuoi',
      href: null,
      action: () => { handleClose(); /* apre NewFamilyModal via evento */ window.dispatchEvent(new CustomEvent('fammy_new_family')); },
      testid: 'whm-family',
    },
    {
      emoji: '🎟️',
      title: t('welcome_card_invite_t') || 'Ho un codice invito',
      sub: t('welcome_card_invite_s') || 'Unisciti a una famiglia esistente',
      action: () => setShowJoinCode(true),
      testid: 'whm-join',
    },
    {
      emoji: '📱',
      title: t('help_install') || "Installa l'app",
      sub: t('help_install_sub') || 'Guida per iPhone e Android',
      action: () => window.open('/ios-install.html', '_blank'),
      testid: 'whm-install',
    },
    {
      emoji: '📖',
      title: t('help_tour') || 'Tour rapido',
      sub: t('help_tour_sub') || 'Rivedi le funzioni principali',
      action: () => { handleClose(); window.dispatchEvent(new CustomEvent('fammy_open_tour')); },
      testid: 'whm-tour',
    },
  ];

  return (
    <div className="modal-bg" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        {/* Chiudi */}
        <button type="button" onClick={handleClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--sm)', background: 'var(--s)',
            color: 'var(--km)', fontSize: 15, cursor: 'pointer' }}>✕</button>

        <h2 style={{ marginTop: 0, fontSize: 18, marginBottom: 4 }}>
          {isExistingUser ? (t('whm_h_existing') || 'Come possiamo aiutarti?') : (t('whm_h_new') || '🚀 Da dove partiamo?')}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--km)', marginBottom: 16, lineHeight: 1.5 }}>
          {isExistingUser
            ? (t('whm_sub_existing') || "Aggiungi una famiglia, unisciti a una esistente o installa l'app.")
            : (t('whm_sub_new') || 'Scegli da dove iniziare — puoi sempre cambiare dopo.')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {actions.map((a) => (
            <button key={a.testid} type="button" onClick={a.action}
              data-testid={a.testid}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 14,
                border: '1px solid var(--sm)', background: 'var(--s)',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{a.emoji}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--km)' }}>{a.sub}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'var(--km)', fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>

        {/* Spunta "Non mostrare più" */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, color: 'var(--km)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            data-testid="whm-dont-show"
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--ac)' }} />
          {t('whm_dont_show') || 'Non mostrare più automaticamente'}
        </label>

        {showJoinCode && (
          <JoinFamilyByCodeModal
            profile={profile}
            onClose={() => setShowJoinCode(false)}
            onJoined={() => { setShowJoinCode(false); onCreated && onCreated(); handleClose(); }}
          />
        )}
      </div>
    </div>
  );
}
