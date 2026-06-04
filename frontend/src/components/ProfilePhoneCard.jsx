import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { detectCountryCode } from '../lib/detectCountry.js';
import CountryCodeSelect from './CountryCodeSelect.jsx';

/**
 * ProfilePhoneCard — riga "Telefono" nel ProfileTab.
 *
 * Tre stati visuali:
 *   1. Nessun numero salvato → bottone "+ Aggiungi numero"
 *   2. Numero salvato verificato → mostra numero + bottone "Modifica"
 *   3. Form attivo → input prefisso/numero → "Invia codice" → input OTP → "Verifica"
 *
 * Quando l'utente verifica il numero via Twilio OTP, Supabase aggiorna
 * auth.users.phone. Il trigger DB poi sincronizza public.profiles.phone.
 * Questo permette al prossimo login telefonico di trovare lo stesso utente
 * (matchato per phone) e mostrare la stessa bacheca.
 */
export default function ProfilePhoneCard({ session, profile, onChanged }) {
  const { t } = useT();
  const [currentPhone, setCurrentPhone] = useState(null);
  const [stage, setStage] = useState('idle'); // 'idle' | 'edit' | 'otp' | 'busy'
  const [countryCode, setCountryCode] = useState(() => detectCountryCode());
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingNumber, setPendingNumber] = useState('');
  const [err, setErr] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Carica il phone già salvato (priorità auth.users.phone, fallback profiles.phone)
  useEffect(() => {
    setCurrentPhone(session?.user?.phone || profile?.phone || null);
  }, [session?.user?.phone, profile?.phone]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const normalize = () => {
    const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    if (!cleaned) return '';
    return `${countryCode}${cleaned}`;
  };

  const sendOtp = async () => {
    setErr('');
    const number = normalize();
    if (number.length < 8) {
      setErr(t('phone_err_invalid') || 'Numero non valido');
      return;
    }
    setStage('busy');
    // updateUser({ phone }) richiede automatic verifyOtp dopo: Supabase
    // invierà un SMS al nuovo numero e marcherà phone_confirmed_at solo
    // dopo verifica.
    const { error } = await supabase.auth.updateUser({ phone: number });
    if (error) {
      setErr(error.message);
      setStage('edit');
      return;
    }
    setPendingNumber(number);
    setStage('otp');
    setResendCooldown(60);
  };

  const verifyOtp = async () => {
    setErr('');
    const cleaned = otp.replace(/\D/g, '');
    if (cleaned.length !== 6) {
      setErr(t('phone_err_otp_len') || 'Inserisci il codice a 6 cifre');
      return;
    }
    setStage('busy');
    const { error } = await supabase.auth.verifyOtp({
      phone: pendingNumber,
      token: cleaned,
      type: 'phone_change',
    });
    if (error) {
      setErr(error.message);
      setStage('otp');
      return;
    }
    // Successo. Salviamo anche su profiles.phone per redundancy + futuri
    // lookup "trova utente per telefono".
    try {
      await supabase.rpc('fammy_set_profile_phone', { p_phone: pendingNumber });
    } catch { /* il trigger DB lo sincronizza comunque */ }

    setCurrentPhone(pendingNumber);
    setStage('idle');
    setPhone('');
    setOtp('');
    window.dispatchEvent(new CustomEvent('fammy_toast', {
      detail: { text: `✅ ${t('profile_phone_saved') || 'Numero verificato'}`, tone: 'success' },
    }));
    onChanged && onChanged();
  };

  const startEdit = () => {
    setStage('edit');
    setErr('');
    setPhone('');
    // Pre-popola con il numero corrente
    if (currentPhone) {
      const match = currentPhone.match(/^(\+\d{1,4})(.+)$/);
      if (match) {
        setCountryCode(match[1]);
        setPhone(match[2]);
      }
    }
  };

  const cancel = () => {
    setStage('idle');
    setPhone(''); setOtp(''); setErr('');
  };

  // ============== RENDER ==============

  if (stage === 'idle') {
    return (
      <div className="profile-section">
        <div className="profile-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-label">📱 {t('profile_phone_label') || 'Telefono'}</div>
            {currentPhone ? (
              <div className="profile-value" style={{ color: 'var(--km)' }}>
                {currentPhone}
                {session?.user?.phone_confirmed_at && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gn)', fontWeight: 700 }}>
                    ✓ {t('profile_phone_verified') || 'verificato'}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--km)', fontSize: 13, marginTop: 4 }}>
                {t('profile_phone_empty') || 'Non impostato. Aggiungi il tuo numero per loggarti anche via SMS.'}
              </div>
            )}
          </div>
          <button
            onClick={startEdit}
            data-testid="profile-phone-edit"
            style={{
              padding: '8px 14px', borderRadius: 100,
              border: '1.5px solid var(--sm)', background: 'white',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', color: 'var(--k)',
            }}>
            {currentPhone
              ? (t('change') || 'Modifica')
              : `+ ${t('profile_phone_add') || 'Aggiungi'}`}
          </button>
        </div>
      </div>
    );
  }

  // === EDIT (inserimento numero) ===
  if (stage === 'edit' || stage === 'busy') {
    const busy = stage === 'busy';
    return (
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>
          📱 {t('profile_phone_label') || 'Telefono'}
        </div>
        <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: 'var(--km)' }}>
          {t('profile_phone_edit_intro') || 'Ti invieremo un codice di verifica via SMS per associare il numero al tuo account.'}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <CountryCodeSelect
            value={countryCode}
            onChange={setCountryCode}
            testid="profile-phone-cc"
          />
          <input
            type="tel" inputMode="tel" autoComplete="tel"
            className="input"
            placeholder={t('phone_ph') || '333 1234567'}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="profile-phone-input"
            style={{ flex: 1 }}
          />
        </div>
        {err && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: '#FDECEC', color: '#A93B2B',
            fontSize: 12, fontWeight: 600,
          }} data-testid="profile-phone-err">{err}</div>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={cancel} disabled={busy}>
            {t('cancel') || 'Annulla'}
          </button>
          <button
            className="btn"
            onClick={sendOtp}
            disabled={busy || !phone.trim()}
            data-testid="profile-phone-send-otp">
            {busy ? (t('phone_sending') || 'Invio…') : `📨 ${t('phone_send_btn') || 'Invia codice SMS'}`}
          </button>
        </div>
      </div>
    );
  }

  // === OTP (verifica codice) ===
  return (
    <div className="profile-section">
      <div className="profile-label" style={{ marginBottom: 8 }}>
        📱 {t('profile_phone_label') || 'Telefono'}
      </div>
      <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: 'var(--km)' }}>
        {t('phone_otp_sub') || 'Abbiamo inviato un codice a 6 cifre al numero'}
        {' '}<strong style={{ color: 'var(--k)' }}>{pendingNumber}</strong>
      </p>
      <input
        type="text" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" maxLength={6}
        className="input"
        placeholder="123456"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        data-testid="profile-phone-otp"
        style={{
          fontSize: 22, fontWeight: 700, textAlign: 'center',
          letterSpacing: '0.4em', padding: '12px 0',
          fontFamily: 'ui-monospace, monospace',
        }}
      />
      {err && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 8,
          background: '#FDECEC', color: '#A93B2B',
          fontSize: 12, fontWeight: 600,
        }} data-testid="profile-phone-err">{err}</div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={() => { setStage('edit'); setOtp(''); }}>
          ← {t('phone_change') || 'Cambia numero'}
        </button>
        <button
          className="btn"
          onClick={verifyOtp}
          disabled={otp.length !== 6}
          data-testid="profile-phone-verify">
          {t('phone_verify_btn') || 'Verifica'}
        </button>
      </div>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <button
          type="button"
          onClick={sendOtp}
          disabled={resendCooldown > 0}
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
    </div>
  );
}
