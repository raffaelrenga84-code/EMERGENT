import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * NamePromptModal — modal obbligatorio che chiede il nome all'utente quando
 * il profilo è ancora "anonimo" (display_name vuoto, "Membro" o "*1234").
 *
 * È sempre TOP-LEVEL (z-index altissimo) e non chiudibile finché non si
 * salva un nome valido. Una volta salvato:
 *  - profiles.display_name e avatar_letter vengono aggiornati
 *  - tutti i `members` con user_id=me e name = vecchio_generico vengono allineati
 *
 * onSaved: callback per refreshare lo state di App.jsx (profile + members).
 */
export default function NamePromptModal({ session, profile, nameKnown = false, onSaved }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  // Onboarding in 3 passi (alla Seremy): nome → compleanno → indirizzo.
  // Solo il nome è obbligatorio; gli altri si possono saltare.
  // Se il nome lo sappiamo già (Google o placeholder), si parte dal compleanno
  const [step, setStep] = useState(nameKnown ? 2 : 1);
  const [name, setName] = useState(nameKnown ? (profile?.display_name || '') : '');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const clean = name.trim();
    if (clean.length < 2) {
      setErr(t('name_prompt_too_short') || 'Inserisci almeno 2 caratteri.');
      return;
    }
    if (clean.length > 40) {
      setErr(t('name_prompt_too_long') || 'Massimo 40 caratteri.');
      return;
    }
    setBusy(true);
    try {
      const letter = clean.charAt(0).toUpperCase();
      const oldDisplay = profile?.display_name || '';

      // 1) Aggiorna profilo
      const { error: pErr } = await supabase.from('profiles')
        .update({ display_name: clean, avatar_letter: letter })
        .eq('id', session.user.id);
      if (pErr) throw pErr;

      // 1bis) Sincronizza anche auth.users.user_metadata.full_name
      // così la Supabase Dashboard mostra il nome nella colonna
      // "Display name" anche per gli account creati via phone-only.
      // Best-effort: se fallisce non blocca il salvataggio del profilo.
      try {
        await supabase.auth.updateUser({ data: { full_name: clean } });
      } catch (metaErr) {
        console.warn('Sync auth metadata failed (non-blocking):', metaErr);
      }

      // 2) Allinea anche i `members` che ereditavano il vecchio nome generico.
      // Filtri tipici: vecchio = "Membro", inizia con "*", oppure = display_name vecchio.
      const isGenericMemberName = (n) =>
        !n || n === oldDisplay || n === 'Membro' || /^\*[0-9]{2,6}$/.test(n);

      const { data: myMembers } = await supabase.from('members')
        .select('id, name')
        .eq('user_id', session.user.id);
      if (Array.isArray(myMembers)) {
        const toUpdate = myMembers.filter((m) => isGenericMemberName(m.name));
        if (toUpdate.length > 0) {
          await supabase.from('members')
            .update({ name: clean, avatar_letter: letter })
            .in('id', toUpdate.map((m) => m.id));
        }
      }

      // 3) Compleanno + indirizzo (facoltativi): profilo + membri.
      //    L'indirizzo viene propagato ai members dal trigger DB.
      const extraProfile = {};
      if (address.trim()) extraProfile.address = address.trim();
      if (Object.keys(extraProfile).length > 0) {
        await supabase.from('profiles').update(extraProfile).eq('id', session.user.id);
      }
      if (birthDate) {
        await supabase.from('members')
          .update({ birth_date: birthDate })
          .eq('user_id', session.user.id);
      }

      onSaved && onSaved();
    } catch (e) {
      setErr(e?.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="name-prompt-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(28,22,17,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}>
      <div
        data-testid="name-prompt-modal"
        style={{
          width: '100%', maxWidth: 420, background: 'white',
          borderRadius: 22,
          padding: 'calc(28px + env(safe-area-inset-top, 0px)) 24px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}>
        <div style={{
          width: 60, height: 60, borderRadius: 18,
          background: 'linear-gradient(135deg, var(--ac), var(--am))',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 30, margin: '0 auto 14px', display: 'flex',
        }}>{step === 1 ? '👋' : step === 2 ? '🎂' : '📍'}</div>

        {/* Indicatore di avanzamento */}
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 12 }}>
          {(nameKnown ? [2, 3] : [1, 2, 3]).map((i) => (
            <span key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 100,
              background: i <= step ? 'var(--ac)' : 'var(--sm)',
              transition: 'all 200ms ease',
            }} />
          ))}
        </div>

        <h2 style={{
          margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--k)',
          textAlign: 'center',
        }}>
          {step === 1 ? (t('name_prompt_title') || 'Come ti chiami?')
           : step === 2 ? (t('ob_bday_title') || 'Quando è il tuo compleanno?')
           : (t('ob_addr_title') || 'Dove abiti?')}
        </h2>
        <p style={{
          margin: '6px 0 18px', fontSize: 13, color: 'var(--km)',
          textAlign: 'center', lineHeight: 1.5,
        }}>
          {step === 1 ? (t('name_prompt_subtitle') ||
            'La famiglia ti vedrà con questo nome. Puoi cambiarlo in qualsiasi momento dal profilo.')
           : step === 2 ? (t('ob_bday_why') ||
            'Serve solo per ricordare il tuo compleanno alla famiglia: la mattina riceveranno gli auguri da fare, e una settimana prima un promemoria per il regalo.')
           : (t('ob_addr_why') ||
            'Visibile solo alla tua famiglia: serve a chi ti deve raggiungere o mandare qualcosa. Un tocco e si apre in Mappe.')}
        </p>

        {step === 1 && (
          <input
            type="text"
            data-testid="name-prompt-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) setStep(2); }}
            placeholder={t('name_prompt_placeholder') || 'Il tuo nome'}
            maxLength={40}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '14px 16px',
              borderRadius: 14, border: '2px solid var(--sm)',
              fontSize: 17, fontWeight: 600, color: 'var(--k)',
              background: 'var(--ab)', outline: 'none',
              textAlign: 'center', marginBottom: 8, fontFamily: 'inherit',
            }} />
        )}

        {step === 2 && (
          <input
            type="date"
            data-testid="ob-bday-input"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '14px 16px',
              borderRadius: 14, border: '2px solid var(--sm)',
              fontSize: 17, fontWeight: 600, color: 'var(--k)',
              background: 'var(--ab)', outline: 'none',
              marginBottom: 8, fontFamily: 'inherit', minWidth: 0,
            }} />
        )}

        {step === 3 && (
          <input
            type="text"
            data-testid="ob-addr-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder={t('ob_addr_ph') || 'es. Via Roma 1, Padova'}
            maxLength={120}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '14px 16px',
              borderRadius: 14, border: '2px solid var(--sm)',
              fontSize: 15, fontWeight: 600, color: 'var(--k)',
              background: 'var(--ab)', outline: 'none',
              marginBottom: 8, fontFamily: 'inherit',
            }} />
        )}

        {err && (
          <div style={{
            background: 'var(--amB)', border: '1px solid var(--am)',
            borderRadius: 10, padding: '10px 12px',
            fontSize: 13, color: 'var(--ac)', marginBottom: 10,
          }}>{err}</div>
        )}

        <button
          type="button"
          onClick={() => {
            if (step === 1) {
              if (name.trim().length < 2) {
                setErr(t('name_prompt_too_short') || 'Inserisci almeno 2 caratteri.');
                return;
              }
              setErr(''); setStep(2);
            } else if (step === 2) {
              setStep(3);
            } else {
              save();
            }
          }}
          disabled={busy || (step === 1 && name.trim().length < 2)}
          data-testid="name-prompt-save"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 14,
            background: (step !== 1 || name.trim().length >= 2) ? 'var(--ac)' : 'var(--sm)',
            color: 'white', border: 'none',
            cursor: busy ? 'wait' : ((step !== 1 || name.trim().length >= 2) ? 'pointer' : 'not-allowed'),
            fontSize: 15, fontWeight: 700,
            opacity: busy ? 0.7 : 1, marginTop: 6,
            boxShadow: (step !== 1 || name.trim().length >= 2) ? '0 2px 8px rgba(193,98,75,0.3)' : 'none',
            transition: 'all 180ms ease',
          }}>
          {busy ? (t('name_prompt_saving') || 'Salvataggio…')
            : step === 3 ? (t('ob_finish') || 'Fine, iniziamo!')
            : (t('ob_next') || 'Avanti')}
        </button>

        {/* Passi 2 e 3 facoltativi: si possono saltare (e compilare dopo dal Profilo) */}
        {step > 1 && !busy && (
          <button type="button"
            onClick={() => {
              if (step === 2) { setStep(3); return; }
              // Passo 3 saltato: rinvio di 7 giorni (non "mai più")
              try { localStorage.setItem('fammy_onboarding_done', String(Date.now())); }
              catch { /* ignore */ }
              onSaved && onSaved();
            }}
            data-testid="ob-skip"
            style={{
              width: '100%', padding: '10px', marginTop: 8,
              background: 'transparent', border: 'none',
              color: 'var(--km)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            {t('ob_skip') || 'Lo faccio dopo'}
          </button>
        )}
      </div>
    </div>
  );
}
