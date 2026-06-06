import { useEffect, useState } from 'react';
import {
  detectDevice, isInstallPromptAvailable, triggerNativeInstall,
  markA2HDismissed,
} from '../lib/installPrompt.js';
import { useT } from '../lib/i18n.jsx';

/**
 * AddToHomePrompt — modal full-screen friendly che insegna all'utente
 * ad aggiungere FAMMY alla schermata Home, riconoscendo il device.
 *
 * Strategie per device:
 *  - android-chrome / desktop-chrome → pulsante che triggera il prompt nativo
 *    `beforeinstallprompt` (se disponibile), altrimenti istruzioni manuali
 *  - ios-safari   → istruzioni passo-passo con illustrazioni del Share Sheet
 *  - ios-chrome   → spiega che serve aprire in Safari per installarla
 *  - other        → istruzioni generiche
 *
 * Props:
 *  - onClose: chiamato quando l'utente dismette il modal
 */
export default function AddToHomePrompt({ onClose }) {
  const { t } = useT();
  const [device, setDevice] = useState(detectDevice());
  const [hasNativePrompt, setHasNativePrompt] = useState(isInstallPromptAvailable());
  const [busy, setBusy] = useState(false);

  // beforeinstallprompt arriva async; lo intercettiamo via custom event
  useEffect(() => {
    const onReady = () => setHasNativePrompt(true);
    window.addEventListener('fammy:install-prompt-ready', onReady);
    return () => window.removeEventListener('fammy:install-prompt-ready', onReady);
  }, []);

  // Auto-aggiornamento device se per qualche motivo cambia (rotation, ecc.)
  useEffect(() => {
    setDevice(detectDevice());
  }, []);

  const dismiss = () => {
    markA2HDismissed();
    onClose && onClose();
  };

  const handleNativeInstall = async () => {
    setBusy(true);
    const outcome = await triggerNativeInstall();
    setBusy(false);
    if (outcome === 'accepted') onClose && onClose();
  };

  return (
    <div
      data-testid="a2h-backdrop"
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(28,22,17,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="a2h-modal"
        style={{
          width: '100%', maxWidth: 460, background: 'white',
          borderRadius: 22,
          padding: 'calc(22px + env(safe-area-inset-top, 0px)) 22px 22px',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}>

        {/* Header */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'linear-gradient(135deg, var(--ac), var(--am))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, margin: '0 auto 14px',
        }}>📲</div>

        <h2 style={{
          margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--k)',
          textAlign: 'center',
        }}>{t('a2h_title') || 'Aggiungi FAMMY alla Home'}</h2>
        <p style={{
          margin: '6px 0 18px', fontSize: 14, color: 'var(--km)',
          textAlign: 'center', lineHeight: 1.5,
        }}>{t('a2h_subtitle') ||
          'Accedi più velocemente, ricevi notifiche, usa l\'app anche offline.'}</p>

        {/* Per-device content */}
        {device === 'android-chrome' && (
          <AndroidContent
            hasNative={hasNativePrompt}
            busy={busy}
            onInstall={handleNativeInstall}
            t={t}
          />
        )}
        {device === 'desktop-chrome' && (
          <DesktopChromeContent
            hasNative={hasNativePrompt}
            busy={busy}
            onInstall={handleNativeInstall}
            t={t}
          />
        )}
        {device === 'ios-safari' && <IOSSafariContent t={t} />}
        {device === 'ios-chrome' && <IOSChromeContent t={t} />}
        {device === 'other' && <GenericContent t={t} />}

        {/* Footer */}
        <button
          type="button"
          onClick={dismiss}
          data-testid="a2h-later"
          style={{
            width: '100%', marginTop: 14,
            padding: '12px', borderRadius: 12,
            border: '1px solid var(--sm)', background: 'white',
            fontSize: 14, fontWeight: 600, color: 'var(--km)',
            cursor: 'pointer',
          }}>
          {t('a2h_later') || 'Più tardi'}
        </button>
      </div>
    </div>
  );
}

// ---- Sub-components per device ---------------------------------------------

function AndroidContent({ hasNative, busy, onInstall, t }) {
  if (hasNative) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--km)', marginBottom: 14 }}>
          {t('a2h_android_ready') || 'Tocca il pulsante qui sotto: Chrome ti chiederà conferma.'}
        </p>
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          data-testid="a2h-android-install"
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            background: 'var(--ac)', color: 'white', border: 'none',
            fontSize: 16, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(193,98,75,0.35)',
            opacity: busy ? 0.7 : 1,
          }}>
          {busy ? (t('a2h_installing') || 'Installazione...') : `📥 ${t('a2h_install_now') || 'Installa adesso'}`}
        </button>
      </div>
    );
  }
  // Fallback manuale (Chrome senza beforeinstallprompt o già scartato)
  return (
    <Steps steps={[
      { icon: '⋮', text: t('a2h_android_step1') || 'Tocca il menu Chrome (⋮ in alto a destra)' },
      { icon: '📲', text: t('a2h_android_step2') || 'Scegli "Aggiungi alla schermata Home" / "Installa app"' },
      { icon: '✅', text: t('a2h_android_step3') || 'Conferma "Aggiungi"' },
    ]} />
  );
}

function DesktopChromeContent({ hasNative, busy, onInstall, t }) {
  if (hasNative) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--km)', marginBottom: 14 }}>
          {t('a2h_desktop_ready') || 'Tocca il pulsante: Chrome ti chiederà di installare FAMMY come app desktop.'}
        </p>
        <button
          type="button"
          onClick={onInstall}
          disabled={busy}
          data-testid="a2h-desktop-install"
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            background: 'var(--ac)', color: 'white', border: 'none',
            fontSize: 16, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(193,98,75,0.35)',
            opacity: busy ? 0.7 : 1,
          }}>
          {busy ? (t('a2h_installing') || 'Installazione...') : `💻 ${t('a2h_install_now') || 'Installa adesso'}`}
        </button>
      </div>
    );
  }
  return (
    <Steps steps={[
      { icon: '⊕', text: t('a2h_desktop_step1') || 'Cerca l\'icona "Installa" (⊕ o computer) nella barra URL' },
      { icon: '👆', text: t('a2h_desktop_step2') || 'Clicca e poi "Installa"' },
    ]} />
  );
}

function IOSSafariContent({ t }) {
  return (
    <Steps steps={[
      { icon: '⬆️', text: t('a2h_ios_step1') || 'Tocca il pulsante Condividi in basso (▢ con freccia ⬆️)' },
      { icon: '➕', text: t('a2h_ios_step2') || 'Scorri verso il basso e scegli "Aggiungi alla schermata Home"' },
      { icon: '✅', text: t('a2h_ios_step3') || 'Tocca "Aggiungi" in alto a destra' },
    ]} />
  );
}

function IOSChromeContent({ t }) {
  return (
    <div>
      <div style={{
        background: 'var(--amB)', border: '1px solid var(--am)',
        borderRadius: 12, padding: '12px 14px', marginBottom: 14,
        fontSize: 13, color: 'var(--k)', lineHeight: 1.5,
      }}>
        <strong>{t('a2h_ios_chrome_warn_h') || 'Importante:'}</strong>{' '}
        {t('a2h_ios_chrome_warn_p') ||
          'Su iPhone, Chrome non permette di installare app. Apri questo link in Safari per installare FAMMY.'}
      </div>
      <Steps steps={[
        { icon: '🦄', text: t('a2h_ios_chrome_step1') || 'Tocca i tre puntini di Chrome (⋯)' },
        { icon: '🧭', text: t('a2h_ios_chrome_step2') || 'Scegli "Apri in Safari"' },
        { icon: '➕', text: t('a2h_ios_chrome_step3') || 'In Safari segui i passi "Aggiungi alla Home"' },
      ]} />
    </div>
  );
}

function GenericContent({ t }) {
  return (
    <Steps steps={[
      { icon: '⋮', text: t('a2h_other_step1') || 'Apri il menu del tuo browser' },
      { icon: '📲', text: t('a2h_other_step2') || 'Cerca "Aggiungi alla schermata Home" o "Installa app"' },
    ]} />
  );
}

function Steps({ steps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((s, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 14px', borderRadius: 12,
          background: 'var(--ab)', border: '1px solid var(--sm)',
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'white', border: '1px solid var(--sm)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'var(--ac)',
          }}>{i + 1}</span>
          <div style={{ flex: 1, fontSize: 14, color: 'var(--k)', lineHeight: 1.45 }}>
            {s.text} <span style={{ fontSize: 18 }}>{s.icon}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
