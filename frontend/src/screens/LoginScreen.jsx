import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal.jsx';
import DesktopLanding from './DesktopLanding.jsx';

// Lista paesi (senza label, verrà localizzato dinamicamente)
const COUNTRIES = [
  { code: 'IT', prefix: '+39', flag: '🇮🇹' },
  { code: 'GB', prefix: '+44', flag: '🇬🇧' },
  { code: 'US', prefix: '+1',  flag: '🇺🇸' },
  { code: 'AU', prefix: '+61', flag: '🇦🇺' },
  { code: 'DE', prefix: '+49', flag: '🇩🇪' },
  { code: 'FR', prefix: '+33', flag: '🇫🇷' },
  { code: 'ES', prefix: '+34', flag: '🇪🇸' },
  { code: 'PT', prefix: '+351', flag: '🇵🇹' },
  { code: 'NL', prefix: '+31', flag: '🇳🇱' },
  { code: 'BE', prefix: '+32', flag: '🇧🇪' },
  { code: 'CH', prefix: '+41', flag: '🇨🇭' },
  { code: 'AT', prefix: '+43', flag: '🇦🇹' },
  { code: 'SE', prefix: '+46', flag: '🇸🇪' },
  { code: 'NO', prefix: '+47', flag: '🇳🇴' },
  { code: 'DK', prefix: '+45', flag: '🇩🇰' },
  { code: 'FI', prefix: '+358', flag: '🇫🇮' },
  { code: 'IE', prefix: '+353', flag: '🇮🇪' },
  { code: 'PL', prefix: '+48', flag: '🇵🇱' },
  { code: 'CZ', prefix: '+420', flag: '🇨🇿' },
  { code: 'HU', prefix: '+36', flag: '🇭🇺' },
  { code: 'RO', prefix: '+40', flag: '🇷🇴' },
  { code: 'GR', prefix: '+30', flag: '🇬🇷' },
  { code: 'TR', prefix: '+90', flag: '🇹🇷' },
  { code: 'BR', prefix: '+55', flag: '🇧🇷' },
  { code: 'MX', prefix: '+52', flag: '🇲🇽' },
  { code: 'AR', prefix: '+54', flag: '🇦🇷' },
  { code: 'ZA', prefix: '+27', flag: '🇿🇦' },
  { code: 'IN', prefix: '+91', flag: '🇮🇳' },
  { code: 'JP', prefix: '+81', flag: '🇯🇵' },
  { code: 'KR', prefix: '+82', flag: '🇰🇷' },
  { code: 'CN', prefix: '+86', flag: '🇨🇳' },
  { code: 'NZ', prefix: '+64', flag: '🇳🇿' }
];

const LANG_TO_COUNTRY = { it: 'IT', en: 'GB', 'en-US': 'US', 'en-AU': 'AU', de: 'DE', fr: 'FR' };

function detectCountryIso() {
  if (typeof navigator === 'undefined') return 'IT';
  const lang = navigator.language || navigator.userLanguage || 'it';
  if (LANG_TO_COUNTRY[lang]) return LANG_TO_COUNTRY[lang];
  const base = lang.split('-')[0];
  return LANG_TO_COUNTRY[base] || 'IT';
}

function getCountryLabel(code, locale, t) {
  // 1) prova la traduzione tramite i18n (se disponibile)
  try {
    const key = `country.${code}`;
    const translated = t ? t(key) : null;
    if (translated && translated !== key) return translated;
  } catch (e) {}
  // 2) prova Intl.DisplayNames
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      const dn = new Intl.DisplayNames([locale || (typeof navigator !== 'undefined' ? navigator.language : 'en')], { type: 'region' });
      const name = dn.of(code);
      if (name) return name;
    }
  } catch (e) {}
  // 3) fallback al codice
  return code;
}

/* ---------- PhoneStep: inserimento numero e invio OTP ---------- */
function PhoneStep({ onSent, t, lang, setLang }) {
  const [countryCode, setCountryCode] = useState(detectCountryIso());
  const [phone, setPhone] = useState(''); // solo numero locale (senza prefisso)
  const [channel, setChannel] = useState('whatsapp'); // preselezionato WhatsApp
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const country = useMemo(() => COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0], [countryCode]);

  const buildFullPhone = (rawInput) => {
    const raw = (rawInput || '').trim();
    if (!raw) return null;
    // se l'utente incolla un numero internazionale con +, puliscilo e usalo così com'è
    if (raw.startsWith('+')) {
      return '+' + raw.replace(/[^\d]/g, '');
    }
    // se inizia con 00 converti in + (0039... -> +39...)
    if (raw.startsWith('00')) {
      return '+' + raw.slice(2).replace(/[^\d]/g, '');
    }
    // altrimenti prendi solo le cifre locali e aggiungi il prefisso selezionato
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    return `${country.prefix}${digits}`;
  };

  const handleSend = async () => {
    setError('');
    const fullPhone = buildFullPhone(phone);
    if (!fullPhone) {
      setError(t('enter_valid_number') || 'Inserisci un numero valido.');
      return;
    }
    const digitsOnly = fullPhone.replace(/[^\d]/g, '');
    if (digitsOnly.length < 7) {
      setError(t('enter_valid_number') || 'Inserisci un numero valido.');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
        options: { data: { channel }, shouldCreateUser: true },
      });
      if (err) {
        setError(err.message || (t('send_code_error') || 'Errore invio codice'));
      } else {
        onSent(fullPhone);
      }
    } catch (e) {
      setError(e?.message || (t('unexpected_error') || 'Errore imprevisto'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 4 }}>
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            style={{
              background: 'none', border: 'none', fontSize: 18, padding: 6,
              opacity: lang === l.id ? 1 : 0.4, cursor: 'pointer',
            }}
            title={l.label}
            aria-label={`Seleziona lingua ${l.label}`}
          >
            {l.flag}
          </button>
        ))}
      </div>

      <div className="login-logo">🏡</div>
      <h1 className="login-h">FAMMY</h1>
      <p className="login-s" style={{ whiteSpace: 'pre-line' }}>{t('app_tagline')}</p>

      {/* Country select compact */}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--km)', textTransform: 'uppercase', marginRight: 6 }}>
          {t('login_country') || 'Paese'}
        </label>
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          style={{
            width: 160,
            padding: '8px 10px',
            borderRadius: 10,
            border: '1.5px solid var(--sm)',
            background: 'var(--ab)',
            fontSize: 13,
            color: 'var(--k)'
          }}
          aria-label={t('login_country') || 'Seleziona paese'}
        >
          {COUNTRIES
            .map((c) => ({ ...c, label: getCountryLabel(c.code, lang, t) }))
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.label} ({c.prefix})
              </option>
            ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--km)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
          {t('login_phone') || 'Numero di cellulare'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Prefisso mostrato una sola volta */}
          <div style={{ padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--sm)', background: 'var(--ab)', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {country.flag} {country.prefix}
          </div>

          {/* Input: solo numero locale, placeholder senza prefisso */}
          <input
            type="tel"
            inputMode="numeric"
            placeholder={t('phone_local_placeholder') || '333 123 4567'}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--sm)', background: 'var(--ab)', fontSize: 15, color: 'var(--k)' }}
            aria-label={t('login_phone') || 'Numero di telefono'}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--km)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
          {t('login_channel') || 'Ricevi il codice via'}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setChannel('sms')}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              border: channel === 'sms' ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
              background: channel === 'sms' ? 'var(--acB, #FFF5EE)' : 'var(--ab)',
              color: channel === 'sms' ? 'var(--ac)' : 'var(--km)',
            }}
            aria-pressed={channel === 'sms'}
          >
            SMS
          </button>

          <button
            type="button"
            onClick={() => setChannel('whatsapp')}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              border: channel === 'whatsapp' ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
              background: channel === 'whatsapp' ? 'var(--acB, #FFF5EE)' : 'var(--ab)',
              color: channel === 'whatsapp' ? 'var(--ac)' : 'var(--km)',
            }}
            aria-pressed={channel === 'whatsapp'}
          >
            WhatsApp
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={loading}
        style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: loading ? 'var(--sm)' : 'var(--ac)', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}
        aria-label={t('login_send_code') || 'Invia codice'}
      >
        {loading ? (t('sending') || 'Invio...') : (t('login_send_code') || 'Invia codice')}
      </button>

      {error && <div className="login-msg error" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

/* ---------- OtpStep: inserimento codice e verifica ---------- */
function OtpStep({ phone, onBack, t }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (seconds <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const handleChange = (val, idx) => {
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) {
      document.getElementById(`otp-${idx + 1}`)?.focus();
    }
  };

  const verify = async () => {
    const token = otp.join('');
    if (token.length !== 6) { setError(t('enter_all_6') || 'Inserisci tutte e 6 le cifre.'); return; }
    setError(''); setLoading(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp?.({ phone, token, type: 'sms' }) || { error: null };
      setLoading(false);
      if (err) setError(err.message);
    } catch (e) {
      setLoading(false);
      setError(e?.message || (t('otp_verify_error') || 'Errore verifica OTP'));
    }
  };

  const resend = async () => {
    setCanResend(false); setSeconds(60); setError('');
    await supabase.auth.signInWithOtp({ phone });
  };

  return (
    <>
      <button type="button" onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--km)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        {t('back') || 'Indietro'}
      </button>

      <div className="login-logo" />
      <h1 className="login-h" style={{ fontSize: 22 }}>{t('login_otp_title') || 'Inserisci il codice'}</h1>
      <p className="login-s">{t('login_otp_sent_to') || 'Codice inviato a'} <strong>{phone}</strong></p>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '20px 0' }}>
        {otp.map((v, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={v}
            onChange={(e) => handleChange(e.target.value, i)}
            onKeyDown={(e) => { if (e.key === 'Backspace' && !v && i > 0) document.getElementById(`otp-${i - 1}`)?.focus(); }}
            style={{ width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700, borderRadius: 12, border: v ? '2px solid var(--ac)' : '1.5px solid var(--sm)', background: 'var(--ab)', color: 'var(--k)' }}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 13, color: 'var(--km)' }}>
        {canResend
          ? <button type="button" onClick={resend} style={{ background: 'none', border: 'none', color: 'var(--ac)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{t('login_resend') || 'Rinvia codice'}</button>
          : <span>{t('login_resend_in') || 'Rinvia tra'} <strong>{seconds}s</strong></span>
        }
      </div>

      <button type="button" onClick={verify} disabled={loading} style={{ width: '100%', padding: '13px 16px', borderRadius: 14, background: loading ? 'var(--sm)' : 'var(--ac)', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? (t('verifying') || 'Verifica...') : (t('login_verify') || 'Verifica')}
      </button>

      {error && <div className="login-msg error" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

/* ---------- Componente principale LoginScreen ---------- */
export default function LoginScreen() {
  const { t, lang, setLang } = useT();
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSent = (fullPhone) => {
    setPhone(fullPhone);
    setStep('otp');
  };

  const loginWithProvider = useCallback(async (provider) => {
    setErrorMsg('');
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) setErrorMsg(error.message || (t('oauth_error') || 'Errore login'));
    } catch (e) {
      setErrorMsg(e?.message || (t('unexpected_error') || 'Errore imprevisto'));
    }
  }, [t]);

  return (
    <div className="login-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
      {step === 'phone' && <PhoneStep t={t} lang={lang} setLang={setLang} onSent={handleSent} />}

      {step === 'otp' && <OtpStep phone={phone} t={t} onBack={() => setStep('phone')} />}

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => loginWithProvider('google')} className="oauth-btn" style={{ padding: '12px 16px', fontSize: 14 }}>
            <GoogleIcon /> <span>{t('login_with_google')}</span>
          </button>
        </div>
      </div>

      {errorMsg && <div className="login-msg error" style={{ marginTop: 12 }}>{errorMsg}</div>}

      <p style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: 'var(--km)', padding: '0 24px', lineHeight: 1.5 }}>
        {t('login_legal_pre')}{' '}
        <button type="button" onClick={() => setShowPrivacy(true)} data-testid="login-open-privacy" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--ac)', textDecoration: 'underline', cursor: 'pointer' }}>
          {t('privacy_h')}
        </button>.
      </p>

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

/* ---------- Icone ---------- */
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
