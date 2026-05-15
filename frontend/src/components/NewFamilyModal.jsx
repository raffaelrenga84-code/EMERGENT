import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝', '🐾', '🚗'];

export default function NewFamilyModal({ session, profile, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏡');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      const { data: fam, error: e1 } = await supabase
        .from('families')
        .insert({ name: name.trim(), emoji, created_by: session.user.id })
        .select().single();
      if (e1) throw e1;

      const displayName = profile?.display_name || session.user.email.split('@')[0];
      const { error: e2 } = await supabase.from('members').insert({
        family_id: fam.id,
        user_id: session.user.id,
        name: displayName,
        role: 'tu',
        avatar_letter: displayName.charAt(0).toUpperCase(),
        status: 'active',
      });
      if (e2) throw e2;

      onCreated && onCreated();
    } catch (e) {
      setErr(e.message); setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuova famiglia</h2>
        <p className="modal-sub">Crea una seconda famiglia (es. casa al mare, famiglia del coniuge…).</p>

        <form onSubmit={create}>
          <label htmlFor="name">Come si chiama?</label>
          <input id="name" className="input" autoFocus placeholder="es. Famiglia Masiero"
            value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label>Emoji</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  style={{
                    width: 48, height: 48, border: '1.5px solid',
                    borderColor: emoji === e ? 'var(--k)' : 'var(--sm)',
                    background: emoji === e ? 'var(--sm)' : 'white',
                    borderRadius: 12, fontSize: 22,
                  }}>{e}</button>
              ))}
            </div>
          </div>

          {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}

          <div className="row" style={{ marginTop: 20 }}>
            <button type="button" className="btn secondary" onClick={onClose}>Annulla</button>
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? <span className="spin" /> : 'Crea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
