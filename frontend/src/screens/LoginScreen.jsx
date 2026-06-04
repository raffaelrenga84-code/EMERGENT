import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal.jsx';
import PhoneLoginModal from '../components/PhoneLoginModal.jsx';

export default function LoginScreen() {
  const { t, lang, setLang } = useT();
  const [errorMsg, setErrorMsg] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  const loginWithProvider = async (provider) => {
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) setErrorMsg(error.message);
  };

  return (
    <div className="login-wrap">
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 4 }}>
        {LANGS.map((l) => (
          <button key={l.id} onClick={() => setLang(l.id)}
            style={{
              background: 'none', border: 'none', fontSize: 18, padding: 6,
              opacity: lang === l.id ? 1 : 0.4, cursor: 'pointer',
            }}
            title={l.label}>
            {l.flag}
          </button>
        ))}
      </div>

      <div className="login-logo">🏡</div>
      <h1 className="login-h">FAMMY</h1>
      <p className="login-s" style={{ whiteSpace: 'pre-line' }}>{t('app_tagline')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button type="button" className="oauth-btn" onClick={() => loginWithProvider('google')}
          data-testid="login-with-google"
          style={{ padding: '12px 16px', fontSize: 14 }}>
          <GoogleIcon />
          <span>{t('login_with_google')}</span>
        </button>

        {/* Divider "oppure" */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '4px 0', color: 'var(--km)', fontSize: 11,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--sm)' }} />
          <span>{t('login_or') || 'oppure'}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--sm)' }} />
        </div>

        {/* Login con telefono (Twilio Verify SMS OTP) */}
        <button
          type="button"
          className="oauth-btn"
          data-testid="login-with-phone"
          onClick={() => setShowPhone(true)}
          style={{ padding: '12px 16px', fontSize: 14 }}>
          <span style={{ fontSize: 16 }}>📱</span>
          <span>{t('login_with_phone') || 'Continua con il telefono'}</span>
        </button>
      </div>

      {/* Warning anti-doppione: evita che lo stesso utente crei due account
          (uno con Google su gmail, uno con Apple su iCloud). */}
      <div style={{
        marginTop: 14, padding: '10px 14px', borderRadius: 12,
        background: 'var(--amB)', border: '1px solid var(--am)',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
        <span style={{ fontSize: 12, color: 'var(--k)', lineHeight: 1.4 }}>
          {t('login_warn_dup')}
        </span>
      </div>

      {errorMsg && <div className="login-msg error" style={{ marginTop: 12 }}>{errorMsg}</div>}

      <p style={{
        position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center',
        fontSize: 12, color: 'var(--km)', padding: '0 24px', lineHeight: 1.5,
      }}>
        {t('login_legal_pre')}{' '}
        <button
          type="button"
          onClick={() => setShowPrivacy(true)}
          data-testid="login-open-privacy"
          style={{
            background: 'none', border: 'none', padding: 0, font: 'inherit',
            color: 'var(--ac)', textDecoration: 'underline', cursor: 'pointer',
          }}
        >
          {t('privacy_h')}
        </button>
        .
      </p>

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showPhone && <PhoneLoginModal onClose={() => setShowPhone(false)} />}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
