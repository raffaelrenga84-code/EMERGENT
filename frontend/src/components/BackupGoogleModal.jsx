import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

const STORAGE_KEY = (uid) => `fammy_backup_google_dismissed_${uid}`;

/**
 * BackupGoogleModal — invita gli utenti loggati SOLO con telefono ad
 * agganciare un account Google come backup (Supabase identity linking).
 *
 * Niente magic-link via email: per evitare account doppi, Supabase deduplica
 * automaticamente gli utenti con la stessa email verificata. Linkando Google
 * direttamente all'identity esistente del numero, otteniamo:
 *  - stesso `user_id` Supabase → zero migrazioni dati
 *  - se l'utente perde il numero, può loggarsi con "Continue with Google"
 *    e ritrovarsi tutto: stessa Famiglia, tasks, eventi, ecc.
 *
 * Mostrato UNA SOLA VOLTA dopo il primo login con telefono (modalità "C"
 * concordata con l'utente). Click su "Più tardi" → mai più visibile.
 *
 * Props:
 *  - userId: session.user.id
 *  - onClose: chiusura senza link (segna come "dismissed")
 *  - onLinked?: chiamato dopo redirect di ritorno (non necessario qui:
 *               Supabase ricarica l'auth state in automatico)
 */
export default function BackupGoogleModal({ userId, onClose }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const linkGoogle = async () => {
    setErr('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        setBusy(false);
        // Se l'utente ha rifiutato il consenso Google, mostra un messaggio
        // morbido — non un errore aggressivo.
        const msg = error.message || '';
        if (/cancelled|denied|popup/i.test(msg)) {
          setErr(t('bk_link_cancelled') || 'Accesso a Google annullato. Riprova oppure rimanda.');
        } else {
          setErr(msg);
        }
        return;
      }
      // signInWithOAuth/linkIdentity redirect: la pagina si ricarica.
    } catch (e) {
      setBusy(false);
      setErr(e?.message || 'Errore');
    }
  };

  const skip = () => {
    try { localStorage.setItem(STORAGE_KEY(userId), '1'); } catch (_) {}
    onClose && onClose();
  };

  return (
    <div className="modal-bg" onClick={skip} data-testid="backup-google-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, padding: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 6 }}>🔐</div>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>
          {t('bk_h') || 'Proteggi il tuo account'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--km)', lineHeight: 1.55, marginTop: 0 }}>
          {t('bk_p_intro') || 'Hai fatto l\'accesso con il numero di telefono. Per non rischiare di perdere FAMMY se cambi numero o smarrisci la SIM, collega un account Google: rimarrai sempre lo stesso utente, con la stessa famiglia.'}
        </p>

        {/* Lista benefici */}
        <div style={{
          background: 'var(--ab)', borderRadius: 12, padding: 12,
          marginTop: 8, fontSize: 13, color: 'var(--k)', lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span>✅</span>
            <span>{t('bk_b1') || 'Nessun account doppio: Google si aggancia al tuo profilo attuale'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <span>📱➡️📧</span>
            <span>{t('bk_b2') || 'Se perdi il numero, accedi con Google e ritrovi tutto'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <span>🔒</span>
            <span>{t('bk_b3') || 'Nessuno dovrà ri-invitarti, le tue famiglie restano collegate'}</span>
          </div>
        </div>

        {err && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8,
            background: '#FDECEC', color: '#A93B2B',
            fontSize: 12, fontWeight: 600,
          }} data-testid="backup-google-err">{err}</div>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={linkGoogle}
          disabled={busy}
          data-testid="backup-google-link-btn"
          className="oauth-btn"
          style={{
            marginTop: 16,
            width: '100%', padding: '14px 16px', fontSize: 14,
            fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 10,
          }}>
          <GoogleIcon />
          <span>
            {busy
              ? (t('bk_linking') || 'Connessione...')
              : (t('bk_link_btn') || 'Collega Google come backup')}
          </span>
        </button>

        <button
          type="button"
          onClick={skip}
          disabled={busy}
          data-testid="backup-google-skip-btn"
          style={{
            marginTop: 8, width: '100%', padding: '10px 16px',
            background: 'transparent', border: 'none',
            color: 'var(--km)', fontSize: 13, cursor: 'pointer',
            fontWeight: 600,
          }}>
          {t('bk_skip') || 'Più tardi (non lo mostriamo più)'}
        </button>
      </div>
    </div>
  );
}

/**
 * Decide se l'utente vede il modale di backup:
 *   - SOLO se è loggato esclusivamente con `phone` provider (nessun
 *     Google linkato)
 *   - SOLO se non ha già cliccato "Più tardi" in passato (flag localStorage)
 */
export function shouldShowBackupGoogle(session) {
  if (!session?.user?.id) return false;
  try {
    if (localStorage.getItem(STORAGE_KEY(session.user.id)) === '1') return false;
  } catch (_) {}
  const identities = session.user.identities || [];
  // Phone-only se l'unica identity è 'phone' (no google, no email)
  const providers = identities.map((i) => i?.provider);
  const isPhoneOnly = providers.length === 1 && providers[0] === 'phone';
  return isPhoneOnly;
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
