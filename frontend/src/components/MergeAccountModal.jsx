import { useState, useEffect, useRef } from 'react';
import { supabase, createIsolatedClient } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

const COUNTRY_CODES = [
  { code: '+39', flag: '🇮🇹', label: 'IT' },
  { code: '+1',  flag: '🇺🇸', label: 'US/CA' },
  { code: '+44', flag: '🇬🇧', label: 'UK' },
  { code: '+33', flag: '🇫🇷', label: 'FR' },
  { code: '+49', flag: '🇩🇪', label: 'DE' },
  { code: '+34', flag: '🇪🇸', label: 'ES' },
  { code: '+41', flag: '🇨🇭', label: 'CH' },
  { code: '+43', flag: '🇦🇹', label: 'AT' },
  { code: '+32', flag: '🇧🇪', label: 'BE' },
  { code: '+31', flag: '🇳🇱', label: 'NL' },
  { code: '+351',flag: '🇵🇹', label: 'PT' },
];

/**
 * MergeAccountModal — wizard per "assorbire" un altro account FAMMY tuo
 * dentro l'account corrente. Usato quando hai fatto login da provider
 * diversi (es. Google + Phone) e ti sei accorto che hai due profili.
 *
 * Stages:
 *   - intro     → spiegazione + selezione canale (email | phone)
 *   - identify  → input dell'identificatore (email o numero) dell'account B
 *   - otp       → input OTP arrivato sul canale di B
 *   - confirm   → riepilogo "cosa sto per fare" + bottone definitivo
 *   - merging   → esecuzione RPC fammy_execute_merge
 *   - done      → riepilogo "ho spostato X members, Y absences…"
 *
 * IMPORTANTE: la session principale di A NON viene persa durante il flow.
 * Usiamo un client Supabase isolato (createIsolatedClient) per gestire B.
 */
export default function MergeAccountModal({ session, onClose, onMerged }) {
  const { t } = useT();
  const [stage, setStage] = useState('intro');
  const [channel, setChannel] = useState('phone'); // 'phone' | 'email'
  const [countryCode, setCountryCode] = useState('+39');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [identifier, setIdentifier] = useState(''); // full normalized
  const [otherUser, setOtherUser] = useState(null); // { id, email, phone }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  // Client isolato per B — creato al bisogno e dismesso dopo
  const bClientRef = useRef(null);

  // Sicurezza: chiudi il modal annulla qualsiasi merge_request pendente
  useEffect(() => {
    return () => {
      if (bClientRef.current) {
        try { bClientRef.current.auth.signOut(); } catch { /* ignore */ }
      }
      // Best effort cleanup: cancella eventuali richieste rimaste a metà.
      // Non bloccare se fallisce (RLS: utente potrebbe non avere righe da cancellare).
      supabase.rpc('fammy_cancel_merge').catch(() => {});
    };
  }, []);

  const normalizePhone = () => {
    const cleaned = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    return cleaned ? `${countryCode}${cleaned}` : '';
  };

  const sendOtp = async () => {
    setErr('');
    let id;
    if (channel === 'phone') {
      id = normalizePhone();
      if (id.length < 8) { setErr(t('phone_err_invalid') || 'Numero non valido'); return; }
      if (id === session?.user?.phone) {
        setErr(t('merge_err_same_account') || 'È lo stesso numero del tuo account attuale.');
        return;
      }
    } else {
      id = email.trim().toLowerCase();
      if (!id.includes('@')) { setErr(t('merge_err_email_invalid') || 'Email non valida'); return; }
      if (id === session?.user?.email?.toLowerCase()) {
        setErr(t('merge_err_same_account') || 'È la stessa email del tuo account attuale.');
        return;
      }
    }

    setBusy(true);
    // Crea il client isolato (B). Non tocca la session principale di A.
    bClientRef.current = createIsolatedClient();

    const payload = channel === 'phone' ? { phone: id } : { email: id };
    const { error } = await bClientRef.current.auth.signInWithOtp({
      ...payload,
      options: { shouldCreateUser: false }, // ⚠️ NON crea utenti nuovi
    });

    setBusy(false);
    if (error) {
      // Errore tipico: "Signups not allowed for otp" → significa che l'utente non esiste
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('signups not allowed') || msg.includes('user not found')) {
        setErr(t('merge_err_user_not_found') || 'Nessun account FAMMY trovato con questo identificativo.');
      } else {
        setErr(error.message);
      }
      return;
    }

    setIdentifier(id);
    setStage('otp');
  };

  const verifyOtp = async () => {
    setErr('');
    const code = otp.replace(/\D/g, '');
    if (code.length !== 6) {
      setErr(t('phone_err_otp_len') || 'Codice a 6 cifre');
      return;
    }
    setBusy(true);

    const verifyArgs = channel === 'phone'
      ? { phone: identifier, token: code, type: 'sms' }
      : { email: identifier, token: code, type: 'email' };

    const { data, error } = await bClientRef.current.auth.verifyOtp(verifyArgs);
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    const bUid = data?.user?.id;
    if (!bUid) {
      setBusy(false);
      setErr(t('merge_err_no_uid') || 'Impossibile recuperare l\'altro account.');
      return;
    }

    if (bUid === session?.user?.id) {
      setBusy(false);
      setErr(t('merge_err_same_account') || 'È lo stesso account.');
      return;
    }

    // Stage 1: B (loggato sul client isolato) crea la merge_request:
    // "Sono B, voglio essere assorbito da A=auth.uid()".
    const { error: setErr_ } = await bClientRef.current.rpc('fammy_set_merge_target', {
      p_target: session.user.id,
    });
    if (setErr_) {
      setBusy(false);
      setErr(`set_merge: ${setErr_.message}`);
      return;
    }

    // Logout B dal client isolato (non tocca A)
    await bClientRef.current.auth.signOut();
    bClientRef.current = null;

    setOtherUser({
      id: bUid,
      email: data?.user?.email,
      phone: data?.user?.phone,
    });
    setBusy(false);
    setStage('confirm');
  };

  const executeMerge = async () => {
    setErr('');
    setStage('merging');
    setBusy(true);
    const { data, error } = await supabase.rpc('fammy_execute_merge');
    setBusy(false);
    if (error) {
      setStage('confirm');
      setErr(error.message);
      return;
    }
    setResult(data);
    setStage('done');
    onMerged && onMerged(data);
  };

  // =============== RENDER ===============

  return (
    <div className="modal-backdrop" onClick={stage === 'merging' ? undefined : onClose}
      data-testid="merge-account-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>🔗</span>
          <h2 style={{ flex: 1, margin: 0 }}>{t('merge_h') || 'Unisci due account'}</h2>
          <button onClick={onClose} aria-label="close" data-testid="merge-close"
            disabled={stage === 'merging'}
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: '1px solid var(--sm)', background: 'white',
              fontSize: 14, cursor: 'pointer',
              opacity: stage === 'merging' ? 0.5 : 1,
            }}>✕</button>
        </div>

        {/* ===== INTRO ===== */}
        {stage === 'intro' && (
          <>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('merge_intro') || 'Hai due profili FAMMY separati (es. uno via Google e uno via SMS) e vuoi unificarli? Posso assorbire il secondo dentro questo che stai usando ora.'}
            </p>
            <div style={{
              padding: 12, borderRadius: 12, background: '#FFF6E5',
              border: '1px solid #F0D896', marginTop: 8,
              fontSize: 12, color: '#9A6300', lineHeight: 1.5,
            }}>
              ⚠️ <strong>{t('merge_warn_title') || 'Attenzione'}</strong>:
              {' '}{t('merge_warn_body') || 'Tutti i dati dell\'altro account (famiglie, task, spese, foto, assenze) verranno spostati qui. L\'altro account verrà eliminato definitivamente.'}
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="profile-label">{t('merge_channel_h') || 'Come accedi all\'altro account?'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <ChannelBtn
                  active={channel === 'phone'}
                  onClick={() => setChannel('phone')}
                  icon="📱"
                  label={t('merge_channel_phone') || 'Telefono'}
                  testid="merge-channel-phone" />
                <ChannelBtn
                  active={channel === 'email'}
                  onClick={() => setChannel('email')}
                  icon="📧"
                  label={t('merge_channel_email') || 'Email'}
                  testid="merge-channel-email" />
              </div>
            </div>

            <button
              className="btn full"
              onClick={() => setStage('identify')}
              data-testid="merge-next-identify"
              style={{ marginTop: 16 }}>
              {t('next') || 'Avanti'} →
            </button>
          </>
        )}

        {/* ===== IDENTIFY ===== */}
        {stage === 'identify' && (
          <>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {channel === 'phone'
                ? (t('merge_phone_p') || 'Inserisci il numero dell\'altro account. Riceverai un SMS di verifica per confermare che è davvero tuo.')
                : (t('merge_email_p') || 'Inserisci l\'email dell\'altro account. Riceverai un magic-link/codice di verifica.')}
            </p>

            {channel === 'phone' ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
                  className="input" data-testid="merge-cc"
                  style={{ width: 110, padding: '10px 4px', fontSize: 13 }}>
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                  ))}
                </select>
                <input type="tel" inputMode="tel"
                  className="input"
                  placeholder={t('phone_ph') || '333 1234567'}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="merge-phone-input"
                  style={{ flex: 1 }} />
              </div>
            ) : (
              <input type="email" inputMode="email" autoComplete="email"
                className="input"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="merge-email-input"
                style={{ marginTop: 8 }} />
            )}

            {err && <ErrorBanner err={err} />}

            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn secondary" onClick={() => setStage('intro')}>
                ← {t('back') || 'Indietro'}
              </button>
              <button className="btn" onClick={sendOtp} disabled={busy}
                data-testid="merge-send-otp">
                {busy ? '…' : `📨 ${t('phone_send_btn') || 'Invia codice'}`}
              </button>
            </div>
          </>
        )}

        {/* ===== OTP ===== */}
        {stage === 'otp' && (
          <>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('phone_otp_sub') || 'Codice inviato a'}{' '}
              <strong>{identifier}</strong>
            </p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6}
              className="input"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="merge-otp-input"
              style={{
                fontSize: 24, fontWeight: 700, textAlign: 'center',
                letterSpacing: '0.4em', padding: '14px 0',
                fontFamily: 'ui-monospace, monospace', marginTop: 8,
              }}
            />
            {err && <ErrorBanner err={err} />}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn secondary" onClick={() => setStage('identify')}>
                ← {t('back') || 'Indietro'}
              </button>
              <button className="btn" onClick={verifyOtp} disabled={busy || otp.length !== 6}
                data-testid="merge-verify-otp">
                {busy ? '…' : (t('phone_verify_btn') || 'Verifica')}
              </button>
            </div>
          </>
        )}

        {/* ===== CONFIRM ===== */}
        {stage === 'confirm' && otherUser && (
          <>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('merge_confirm_h') || 'Verifica i due account, poi procedi:'}
            </p>
            <div style={{
              padding: 14, borderRadius: 12, background: 'var(--ab)',
              border: '1px solid var(--sm)', marginTop: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
                {t('merge_keep') || 'Mantengo (questo account)'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                ✓ {session?.user?.email || session?.user?.phone}
              </div>
            </div>
            <div style={{
              padding: 14, borderRadius: 12, background: '#FDECEC',
              border: '1px solid #E89898', marginTop: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A93B2B', textTransform: 'uppercase' }}>
                {t('merge_absorb_delete') || 'Assorbo e cancello'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4, color: '#A93B2B' }}>
                🗑 {otherUser.email || otherUser.phone}
              </div>
              <div style={{ fontSize: 12, color: '#A93B2B', marginTop: 4, fontStyle: 'italic' }}>
                {t('merge_absorb_hint') || 'Tutti i suoi dati verranno spostati nel tuo account principale.'}
              </div>
            </div>

            {err && <ErrorBanner err={err} />}

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn secondary" onClick={onClose}>
                {t('cancel') || 'Annulla'}
              </button>
              <button className="btn" onClick={executeMerge} disabled={busy}
                data-testid="merge-execute"
                style={{ background: '#A93B2B' }}>
                ⚡ {t('merge_execute') || 'Unisci ora'}
              </button>
            </div>
          </>
        )}

        {/* ===== MERGING (spinner) ===== */}
        {stage === 'merging' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <span className="spin dark" style={{ display: 'inline-block', width: 36, height: 36 }} />
            <div style={{ marginTop: 12, fontWeight: 700, fontSize: 15 }}>
              {t('merge_merging_h') || 'Sto unendo gli account…'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 4 }}>
              {t('merge_merging_p') || 'Non chiudere questa finestra'}
            </div>
          </div>
        )}

        {/* ===== DONE ===== */}
        {stage === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '20px 8px' }}>
            <div style={{ fontSize: 56 }}>🎉</div>
            <h3 style={{ marginTop: 8 }}>{t('merge_done_h') || 'Account unificati!'}</h3>
            <p style={{ color: 'var(--km)', fontSize: 13, marginTop: 4 }}>
              {t('merge_done_p') || 'Tutti i dati sono stati spostati. Eccoli:'}
            </p>
            <div style={{
              padding: 12, borderRadius: 10, background: 'var(--gnB)',
              border: '1px solid #B8DAC7', marginTop: 12, textAlign: 'left',
              fontSize: 13, color: 'var(--gn)', lineHeight: 1.7,
            }}>
              ✓ {result.members_moved + result.members_dedup} {t('merge_stat_members') || 'profili famiglia'}
              {result.members_dedup > 0 && ` (${result.members_dedup} ${t('merge_stat_dedup') || 'fusi'})`}<br/>
              {result.absences_moved > 0 && <>✓ {result.absences_moved} {t('merge_stat_absences') || 'assenze'}<br/></>}
              {result.pushes_moved > 0 && <>✓ {result.pushes_moved} {t('merge_stat_pushes') || 'dispositivi push'}<br/></>}
              {result.prefs_moved > 0 && <>✓ {result.prefs_moved} {t('merge_stat_prefs') || 'preferenze utente'}<br/></>}
            </div>
            <button className="btn full" onClick={onClose} style={{ marginTop: 16 }}
              data-testid="merge-done-close">
              {t('done_btn') || 'Fatto'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelBtn({ active, onClick, icon, label, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid}
      style={{
        flex: 1, padding: '14px 12px', borderRadius: 12,
        border: '2px solid', borderColor: active ? 'var(--k)' : 'var(--sm)',
        background: active ? 'var(--ab)' : 'white',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--k)' }}>{label}</span>
    </button>
  );
}

function ErrorBanner({ err }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8,
      background: '#FDECEC', color: '#A93B2B',
      fontSize: 12, fontWeight: 600,
    }} data-testid="merge-err">{err}</div>
  );
}
