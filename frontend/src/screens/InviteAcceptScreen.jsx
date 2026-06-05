import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';
import PhoneLoginModal from '../components/PhoneLoginModal.jsx';

export default function InviteAcceptScreen({ token, session, onAccepted }) {
  const { t, lang, setLang } = useT();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const [accepting, setAccepting] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  // Claim placeholder flow (solo per inviti generici)
  const [placeholders, setPlaceholders] = useState(null); // null = non caricati, [] = caricati nessuno
  const [pickedClaimId, setPickedClaimId] = useState(undefined);
  // undefined = utente non ha ancora scelto, null = "crea nuovo", uuid = claim quel placeholder
  // Per inviti DEDICATI (invite.member_name presente): conferma esplicita
  // "Sei tu {Jenna}?" prima di procedere. Evita che l'utente attualmente
  // loggato col proprio account Google prenda accidentalmente l'identità
  // del membro a cui era destinato l'invito.
  const [confirmedDedicated, setConfirmedDedicated] = useState(false);
  // Per inviti GENERICI con placeholder: dopo il tap su "Sono Jenna"
  // entriamo in stato "pending" e mostriamo la stessa conferma "Sei tu
  // Jenna?". Solo dopo il "Sì" partirà l'accept_invitation.
  const [pendingClaim, setPendingClaim] = useState(null); // null | placeholder obj

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_invitation', { invite_token: token });
      if (cancelled) return;
      if (error) setError(error.message);
      else if (!data?.valid) setError(data?.error || t('invite_invalid_h'));
      else setInvite(data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Quando l'utente è loggato e l'invito è valido, carica eventuali
  // placeholder claimabili (solo se l'invito è generico = nessun member_name)
  useEffect(() => {
    if (!session || !invite) return;
    // Invito dedicato: niente scelta, parti subito
    if (invite.member_name) return;
    if (placeholders !== null) return;
    (async () => {
      const { data } = await supabase.rpc('list_claimable_placeholders', { invite_token: token });
      if (data?.valid && Array.isArray(data.placeholders)) {
        setPlaceholders(data.placeholders);
      } else {
        setPlaceholders([]);
      }
    })();
  }, [session, invite, placeholders, token]);

  // Avvia accept_invitation:
  //   - se invite dedicato → subito
  //   - se generico ma nessun placeholder esiste → subito (crea nuovo membro)
  //   - se generico con placeholder → solo dopo che l'utente ha scelto
  useEffect(() => {
    if (!session || !invite || accepting || status === 'done') return;

    const isDedicated = !!invite.member_name;
    const placeholdersReady = placeholders !== null;
    const hasPlaceholders = Array.isArray(placeholders) && placeholders.length > 0;
    const userHasPicked = pickedClaimId !== undefined;

    const canProceed =
      (isDedicated && confirmedDedicated) ||
      (!isDedicated && placeholdersReady && !hasPlaceholders) ||
      (!isDedicated && placeholdersReady && hasPlaceholders && userHasPicked);

    if (!canProceed) return;

    setAccepting(true);
    (async () => {
      const args = { invite_token: token };
      if (!isDedicated && pickedClaimId) args.claim_member_id = pickedClaimId;
      const { data, error } = await supabase.rpc('accept_invitation', args);
      if (error) { setError(error.message); setStatus('error'); }
      else if (!data?.success) { setError(data?.error || ''); setStatus('error'); }
      else {
        setStatus('done');
        setTimeout(() => {
          window.history.replaceState({}, '', '/');
          onAccepted && onAccepted();
        }, 1200);
      }
      setAccepting(false);
    })();
  }, [session, invite, placeholders, pickedClaimId, accepting, status, token, confirmedDedicated]);

  const loginWithGoogle = async () => {
    setStatus('signing');
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Dopo il login Google torniamo a /invite/<token> dove il flow
        // `accept_invitation` parte automatico.
        redirectTo: `${window.location.origin}/invite/${token}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) { setError(error.message); setStatus('error'); }
  };

  if (loading) {
    return (
      <div className="login-wrap">
        <span className="spin dark" style={{ margin: '0 auto', width: 32, height: 32 }} />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="login-wrap">
        <div className="login-logo">⚠️</div>
        <h1 className="login-h">{t('invite_invalid_h')}</h1>
        <p className="login-s">{error}</p>
        <button className="btn full" onClick={() => { window.location.href = '/'; }}>
          {t('invite_back_to_app')}
        </button>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="login-wrap">
        <div className="login-logo">🎉</div>
        <h1 className="login-h">{t('invite_welcome_h', { family: `${invite.family_emoji} ${invite.family_name}` })}</h1>
        <p className="login-s">{t('invite_redirecting')}</p>
      </div>
    );
  }

  // Utente loggato + invito DEDICATO (es. "per Jenna") + non ha ancora
  // confermato → mostra una schermata "Sei tu Jenna?". Evita che chi è
  // loggato con un altro account prenda accidentalmente l'identità del
  // membro a cui era destinato l'invito.
  if (
    session &&
    invite &&
    invite.member_name &&
    !confirmedDedicated &&
    status !== 'done'
  ) {
    const meEmail = session.user?.email || session.user?.phone || '';
    return (
      <div className="login-wrap">
        <div className="login-logo">{invite.family_emoji}</div>
        <h1 className="login-h">{invite.family_name}</h1>
        <p className="login-s" style={{ marginBottom: 4 }}>
          {t('invite_confirm_dedicated_h', { name: invite.member_name })}
        </p>
        <p style={{ fontSize: 13, color: 'var(--km)', textAlign: 'center', marginBottom: 18 }}>
          {t('invite_confirm_dedicated_p', { name: invite.member_name, family: invite.family_name })}
        </p>

        {/* Riepilogo dell'identità con cui sei attualmente loggato */}
        <div style={{
          padding: 12, background: 'var(--ab)', borderRadius: 12,
          border: '1px solid var(--sm)', marginBottom: 16,
          fontSize: 12, color: 'var(--km)', lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--k)' }}>
            {t('invite_confirm_logged_as')}
          </strong>
          <div style={{ marginTop: 4, wordBreak: 'break-all' }}>{meEmail}</div>
        </div>

        <button
          className="btn full"
          onClick={() => setConfirmedDedicated(true)}
          data-testid="invite-confirm-dedicated-yes"
          style={{ marginBottom: 10 }}>
          ✅ {t('invite_confirm_yes', { name: invite.member_name }) || `Sì, sono ${invite.member_name}`}
        </button>

        <button
          className="btn secondary full"
          onClick={async () => {
            // L'utente NON è il destinatario → logout per liberare
            // l'account e permettere a chi di dovere di accedere col
            // proprio.
            await supabase.auth.signOut();
            window.location.href = '/';
          }}
          data-testid="invite-confirm-dedicated-no">
          ❌ {t('invite_confirm_no')}
        </button>
        {error && <div className="login-msg error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  // Utente loggato + invito generico + ha toccato "Sono Jenna" ma non
  // ha ancora confermato → mostra "Sei tu Jenna?" come per gli inviti
  // dedicati. Doppio click esplicito = sicurezza in più contro errori.
  if (
    session &&
    invite &&
    !invite.member_name &&
    pendingClaim &&
    pickedClaimId === undefined
  ) {
    const p = pendingClaim;
    const meEmail = session.user?.email || session.user?.phone || '';
    return (
      <div className="login-wrap">
        <div className="login-logo">{invite.family_emoji}</div>
        <h1 className="login-h">{invite.family_name}</h1>
        <p className="login-s" style={{ marginBottom: 4 }}>
          {t('invite_confirm_dedicated_h', { name: p.name })}
        </p>
        <p style={{ fontSize: 13, color: 'var(--km)', textAlign: 'center', marginBottom: 18 }}>
          {t('invite_confirm_dedicated_p', { name: p.name, family: invite.family_name })}
        </p>

        {/* Card preview del profilo che stai per "indossare" */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 12, background: 'var(--ab)', borderRadius: 12,
          border: '1px solid var(--sm)', marginBottom: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: p.avatar_color || '#1C1611', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, flexShrink: 0,
          }}>
            {p.avatar_letter || p.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--km)' }}>
              {p.role || t('em_role_other') || 'altro'}
            </div>
          </div>
        </div>

        {/* Identità con cui sei loggato */}
        <div style={{
          padding: 12, background: 'var(--ab)', borderRadius: 12,
          border: '1px solid var(--sm)', marginBottom: 16,
          fontSize: 12, color: 'var(--km)', lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--k)' }}>
            {t('invite_confirm_logged_as')}
          </strong>
          <div style={{ marginTop: 4, wordBreak: 'break-all' }}>{meEmail}</div>
        </div>

        <button
          className="btn full"
          onClick={() => {
            // Conferma definitiva → setto pickedClaimId per far partire l'accept
            setPickedClaimId(p.id);
            setPendingClaim(null);
          }}
          data-testid="invite-claim-confirm-yes"
          style={{ marginBottom: 10 }}>
          ✅ {t('invite_confirm_yes', { name: p.name }) || `Sì, sono ${p.name}`}
        </button>

        <button
          className="btn secondary full"
          onClick={() => setPendingClaim(null)}
          data-testid="invite-claim-confirm-no">
          ← {t('invite_confirm_back') || 'Torna indietro'}
        </button>
        {error && <div className="login-msg error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  // Utente loggato + invito generico + ci sono placeholder claimabili
  // + utente non ha ancora scelto → mostra la lista
  if (
    session &&
    invite &&
    !invite.member_name &&
    Array.isArray(placeholders) &&
    placeholders.length > 0 &&
    pickedClaimId === undefined
  ) {
    return (
      <div className="login-wrap">
        <div className="login-logo">{invite.family_emoji}</div>
        <h1 className="login-h">{invite.family_name}</h1>
        <p className="login-s" style={{ marginBottom: 4 }}>
          {t('invite_claim_h')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--km)', textAlign: 'center', marginBottom: 16 }}
          dangerouslySetInnerHTML={{ __html: t('invite_claim_p') }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {placeholders.map((p) => (
            <button
              key={p.id}
              onClick={() => setPendingClaim(p)}
              data-testid={`invite-claim-${p.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12, background: 'white', border: '1px solid var(--sm)',
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: p.avatar_color || '#1C1611', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, flexShrink: 0,
                }}
              >
                {p.avatar_letter || p.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{t('invite_claim_iam', { name: p.name }) || `Sono ${p.name}`}</div>
                <div style={{ fontSize: 11, color: 'var(--km)' }}>
                  {p.role || t('em_role_other') || 'altro'} · {t('invite_claim_pending') || 'profilo da collegare'}
                </div>
              </div>
              <span style={{ fontSize: 18 }}>→</span>
            </button>
          ))}
        </div>

        <button
          className="btn secondary full"
          onClick={() => setPickedClaimId(null)}
          data-testid="invite-claim-none"
          style={{ marginBottom: 8 }}
        >
          {t('invite_claim_none') || 'Nessuno di questi — creami un nuovo profilo'}
        </button>
        {error && <div className="login-msg error">{error}</div>}
      </div>
    );
  }

  if (session) {
    return (
      <div className="login-wrap">
        <div className="login-logo">{invite.family_emoji}</div>
        <h1 className="login-h">{invite.family_name}</h1>
        <p className="login-s">{accepting ? t('invite_adding') : t('invite_entering')}</p>
        {error && <div className="login-msg error">{error}</div>}
      </div>
    );
  }

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

      <div className="login-logo">{invite.family_emoji}</div>
      <h1 className="login-h">{invite.family_name}</h1>
      <p className="login-s">
        {invite.member_name
          ? t('invite_invited_as', { name: invite.member_name })
          : t('invite_invited_generic')}
      </p>

      <div className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          className="oauth-btn"
          onClick={loginWithGoogle}
          disabled={status === 'signing'}
          data-testid="invite-login-google"
          style={{ padding: '12px 16px', fontSize: 14 }}>
          <GoogleIcon />
          <span>
            {status === 'signing'
              ? (t('phone_sending') || '...')
              : t('login_with_google')}
          </span>
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '4px 0', color: 'var(--km)', fontSize: 11,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--sm)' }} />
          <span>{t('login_or') || 'oppure'}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--sm)' }} />
        </div>

        <button
          type="button"
          className="oauth-btn"
          onClick={() => setShowPhone(true)}
          data-testid="invite-login-phone"
          style={{ padding: '12px 16px', fontSize: 14 }}>
          <span style={{ fontSize: 16 }}>📱</span>
          <span>{t('login_with_phone') || 'Continua con il telefono'}</span>
        </button>

        {error && <div className="login-msg error">{error}</div>}

        <p style={{ fontSize: 12, color: 'var(--km)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          {t('invite_join_hint') || 'Accedi per unirti alla famiglia. Verrai aggiunto al volo, senza dover compilare nulla.'}
        </p>
      </div>

      {showPhone && (
        <PhoneLoginModal onClose={() => setShowPhone(false)} />
      )}
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
