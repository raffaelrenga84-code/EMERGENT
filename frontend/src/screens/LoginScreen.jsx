import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';

export default function LoginScreen() {
  const { t, lang, setLang } = useT();
  const [errorMsg, setErrorMsg] = useState('');

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
        <button type="button" className="oauth-btn" onClick={() => loginWithProvider('google')} style={{ padding: '12px 16px', fontSize: 14 }}>
          <GoogleIcon />
          <span>{t('login_with_google')}</span>
        </button>

        {/* Bottone Apple — disabilitato finché non configuriamo Apple Developer + Supabase provider.
            Quando pronto: togliere disabled, cambiare opacity, e onClick={() => loginWithProvider('apple')} */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="oauth-btn"
            disabled
            title={t('login_apple_coming_soon')}
            style={{
              padding: '12px 16px', fontSize: 14,
              background: '#000', color: '#fff',
              border: '1px solid #000',
              opacity: 0.5, cursor: 'not-allowed',
              width: '100%',
            }}
          >
            <AppleIcon />
            <span>{t('login_with_apple')}</span>
          </button>
          <span style={{
            position: 'absolute', top: -8, right: -4,
            background: 'var(--am)', color: 'var(--k)',
            fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 100,
            border: '1.5px solid white',
          }}>{t('soon_badge')}</span>
        </div>
      </div>

      {errorMsg && <div className="login-msg error" style={{ marginTop: 12 }}>{errorMsg}</div>}
    </div>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
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
