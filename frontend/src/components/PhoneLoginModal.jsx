import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { detectCountryCode } from '../lib/detectCountry.js';
import CountryCodeSelect from './CountryCodeSelect.jsx';

/**
 * PhoneLoginModal — flusso "Login con telefono" (Supabase + Twilio Verify).
 *
 * Step 1: l'utente inserisce numero con prefisso → riceve SMS con OTP a 6 cifre
 * Step 2: l'utente inserisce l'OTP → Supabase crea/recupera l'utente
 *
 * Props:
 *  - onClose:    chiusura senza login
 *  - onSuccess:  chiamato dopo verifyOtp riuscito (di solito non serve, la
 *                session viene aggiornata via onAuthStateChange dell'App)
 *  - prefillPhone: opzionale, se vogliamo pre-popolare il numero
 *  - redirectTo: dove tornare dopo il login (per il flow invito)
 */
// Country codes esposti da `lib/countryCodes.js` (lista condivisa con ProfilePhoneCard)

export default function PhoneLoginModal({ onClose, prefillPhone = '' }) {
  const { t } = useT();
  const [stage, setStage] = useState('phone'); // 'phone' | 'otp' | 'success'
  // Pre-seleziona il country code in base a timezone+lingua del browser.
  const [countryCode, setCountryCode] = useState(() => detectCountryCode());
  const [phone, setPhone] = useState(prefillPhone);
  const [otp, setOtp] = useState('');
  const [fullNumber, setFullNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const phoneRef = useRef(null);
  const otpRef = useRef(null);

  useEffect(() => { phoneRef.current?.focus(); }, []);
  useEffect(() => {
    if (stage === 'otp') setTimeout(() => otpRef.current?.focus(), 50);
  }, [stage]);
  // Resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const normalize = () => {
    // Rimuove spazi, trattini e zero iniziali; concatena con countryCode E.164
    const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    if (!cleaned) return '';
    return `${countryCode}${cleaned}`;
  };

  const sendOtp = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    const number = normalize();
    if (number.length < 8) {
      setErr(t('phone_err_invalid') || 'Numero non valido');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: number,
      options: {
        channel: 'sms',
      },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setFullNumber(number);
    setStage('otp');
    setResendCooldown(60);
  };

  const verifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    const cleaned = otp.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setErr(t('phone_err_otp_len') || 'Inserisci il codice a 6 cifre');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: fullNumber,
      token: cleaned,
      type: 'sms',
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    // session aggiornata via onAuthStateChange in App.jsx → il modale può
    // chiudersi: la UI cambia automaticamente.
    setStage('success');
    setTimeout(() => onClose && onClose(), 800);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="phone-login-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>📱</span>
          <h2 style={{ flex: 1, margin: 0 }}>
            {stage === 'otp'
              ? (t('phone_otp_h') || 'Conferma il codice')
              : (t('phone_h') || 'Accedi con il telefono')}
          </h2>
          <button onClick={onClose} aria-label="close" data-testid="phone-close-btn"
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: '1px solid var(--sm)', background: 'white',
              fontSize: 14, cursor: 'pointer',
            }}>✕</button>
        </div>

        {/* === STAGE: PHONE === */}
        {stage === 'phone' && (
          <form onSubmit={sendOtp}>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('phone_sub') || 'Ti invieremo un codice di verifica via SMS.'}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <CountryCodeSelect
                value={countryCode}
                onChange={setCountryCode}
                testid="phone-cc"
              />
              <input
                ref={phoneRef}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="input"
                placeholder={t('phone_ph') || '333 1234567'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="phone-number-input"
                style={{ flex: 1 }}
              />
            </div>
            <p style={{ marginTop: 6, fontSize: 11, color: 'var(--km)' }}>
              {t('phone_hint') || 'Esempio: 333 1234567 (senza prefisso 0 iniziale).'}
            </p>

            {err && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                background: '#FDECEC', color: '#A93B2B',
                fontSize: 12, fontWeight: 600,
              }} data-testid="phone-err">{err}</div>
            )}

            <button
              type="submit"
              className="btn full"
              disabled={busy || !phone.trim()}
              data-testid="phone-send-otp-btn"
              style={{ marginTop: 14 }}>
              {busy
                ? (t('phone_sending') || 'Invio in corso…')
                : `📨 ${t('phone_send_btn') || 'Invia codice SMS'}`}
            </button>
          </form>
        )}

        {/* === STAGE: OTP === */}
        {stage === 'otp' && (
          <form onSubmit={verifyOtp}>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('phone_otp_sub') || 'Abbiamo inviato un codice a 6 cifre al numero'}
              {' '}
              <strong>{fullNumber}</strong>
            </p>
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="input"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="phone-otp-input"
              style={{
                fontSize: 24, fontWeight: 700, textAlign: 'center',
                letterSpacing: '0.4em', padding: '14px 0', marginTop: 8,
                fontFamily: 'ui-monospace, monospace',
              }}
            />

            {err && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                background: '#FDECEC', color: '#A93B2B',
                fontSize: 12, fontWeight: 600,
              }} data-testid="phone-err">{err}</div>
            )}

            <button
              type="submit"
              className="btn full"
              disabled={busy || otp.length !== 6}
              data-testid="phone-verify-btn"
              style={{ marginTop: 14 }}>
              {busy ? (t('phone_verifying') || 'Verifica in corso…') : (t('phone_verify_btn') || 'Verifica')}
            </button>

            <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <button
                type="button"
                onClick={() => { setStage('phone'); setOtp(''); setErr(''); }}
                data-testid="phone-change-btn"
                style={{
                  background: 'none', border: 'none', padding: 4,
                  fontSize: 12, color: 'var(--ac)', cursor: 'pointer',
                }}>
                ← {t('phone_change') || 'Cambia numero'}
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={resendCooldown > 0 || busy}
                data-testid="phone-resend-btn"
                style={{
                  background: 'none', border: 'none', padding: 4,
                  fontSize: 12, color: resendCooldown > 0 ? 'var(--km)' : 'var(--ac)',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                }}>
                {resendCooldown > 0
                  ? `${t('phone_resend_in') || 'Reinvia tra'} ${resendCooldown}s`
                  : `📨 ${t('phone_resend') || 'Reinvia codice'}`}
              </button>
            </div>
          </form>
        )}

        {/* === STAGE: SUCCESS === */}
        {stage === 'success' && (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <h3 style={{ margin: 0 }}>{t('phone_success_h') || 'Bentornato!'}</h3>
            <p style={{ color: 'var(--km)', marginTop: 6 }}>
              {t('phone_success_p') || 'Stai per accedere a FAMMY…'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
