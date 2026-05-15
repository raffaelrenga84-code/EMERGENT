import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';

export default function InviteAcceptScreen({ token, session, onAccepted }) {
  const { t, lang, setLang } = useT();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('idle');
  const [accepting, setAccepting] = useState(false);

  // Claim placeholder flow (solo per inviti generici)
  const [placeholders, setPlaceholders] = useState(null); // null = non caricati, [] = caricati nessuno
  const [pickedClaimId, setPickedClaimId] = useState(undefined);
  // undefined = utente non ha ancora scelto, null = "crea nuovo", uuid = claim quel placeholder

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
      isDedicated ||
      (placeholdersReady && !hasPlaceholders) ||
      (placeholdersReady && hasPlaceholders && userHasPicked);

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
  }, [session, invite, placeholders, pickedClaimId, accepting, status, token]);

  const sendMagicLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
        data: {
          ...(name.trim() ? { display_name: name.trim() } : {}),
          language: lang,
        },
      },
    });
    if (error) { setError(error.message); setStatus('error'); }
    else setStatus('sent');
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
          Sei già stato aggiunto da qualcuno?
        </p>
        <p style={{ fontSize: 13, color: 'var(--km)', textAlign: 'center', marginBottom: 16 }}>
          Tocca il <strong>tuo</strong> nome per collegarti al profilo esistente. In questo modo
          eredita compleanno, ruolo e tutto quello che la famiglia ha già impostato.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {placeholders.map((p) => (
            <button
              key={p.id}
              onClick={() => setPickedClaimId(p.id)}
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
                <div style={{ fontWeight: 700, fontSize: 15 }}>Sono {p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--km)' }}>
                  {p.role || 'altro'} · profilo da collegare
                </div>
              </div>
              <span style={{ fontSize: 18 }}>→</span>
            </button>
          ))}
        </div>

        <button
          className="btn secondary full"
          onClick={() => setPickedClaimId(null)}
          style={{ marginBottom: 8 }}
        >
          Nessuno di questi — creami un nuovo profilo
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

      {status === 'sent' ? (
        <div className="login-msg success">
          <strong>{t('check_email')}</strong><br/>
          {t('check_email_desc', { email }).split(email).map((part, i, arr) => (
            <span key={i}>{part}{i < arr.length - 1 && <strong>{email}</strong>}</span>
          ))}
        </div>
      ) : (
        <form className="login-form" onSubmit={sendMagicLink}>
          <div>
            <label htmlFor="name">{t('name_label')}</label>
            <input id="name" className="input" placeholder={t('name_ph')} value={name}
              onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label htmlFor="email">{t('invite_email_label')}</label>
            <input id="email" type="email" className="input" placeholder={t('email_ph')}
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button type="submit" className="btn full" disabled={status === 'sending' || !email.trim()}>
            {status === 'sending' ? <span className="spin" /> : t('invite_join_btn', { family: invite.family_name })}
          </button>
          {error && <div className="login-msg error">{error}</div>}
          <p style={{ fontSize: 12, color: 'var(--km)', textAlign: 'center', marginTop: 12 }}>
            {t('no_password_hint')}
          </p>
        </form>
      )}
    </div>
  );
}
