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
export default function NamePromptModal({ session, profile, onSaved }) {
  const { t } = useT();
  const [name, setName] = useState('');
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
        }}>👋</div>

        <h2 style={{
          margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--k)',
          textAlign: 'center',
        }}>{t('name_prompt_title') || 'Come ti chiami?'}</h2>
        <p style={{
          margin: '6px 0 18px', fontSize: 13, color: 'var(--km)',
          textAlign: 'center', lineHeight: 1.5,
        }}>{t('name_prompt_subtitle') ||
          'La famiglia ti vedrà con questo nome. Puoi cambiarlo in qualsiasi momento dal profilo.'}</p>

        <input
          type="text"
          data-testid="name-prompt-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder={t('name_prompt_placeholder') || 'Il tuo nome'}
          maxLength={40}
          style={{
            width: '100%', padding: '14px 16px',
            borderRadius: 14, border: '2px solid var(--sm)',
            fontSize: 17, fontWeight: 600, color: 'var(--k)',
            background: 'var(--ab)', outline: 'none',
            textAlign: 'center', marginBottom: 8,
            fontFamily: 'inherit',
          }} />

        {err && (
          <div style={{
            background: 'var(--amB)', border: '1px solid var(--am)',
            borderRadius: 10, padding: '10px 12px',
            fontSize: 13, color: 'var(--ac)', marginBottom: 10,
          }}>{err}</div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy || name.trim().length < 2}
          data-testid="name-prompt-save"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 14,
            background: name.trim().length >= 2 ? 'var(--ac)' : 'var(--sm)',
            color: 'white', border: 'none',
            cursor: busy ? 'wait' : (name.trim().length >= 2 ? 'pointer' : 'not-allowed'),
            fontSize: 15, fontWeight: 700,
            opacity: busy ? 0.7 : 1, marginTop: 6,
            boxShadow: name.trim().length >= 2 ? '0 2px 8px rgba(193,98,75,0.3)' : 'none',
            transition: 'all 180ms ease',
          }}>
          {busy ? (t('name_prompt_saving') || 'Salvataggio…') : (t('name_prompt_save') || 'Salva e continua')}
        </button>
      </div>
    </div>
  );
}
