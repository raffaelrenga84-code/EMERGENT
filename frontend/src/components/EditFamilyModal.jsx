import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝', '🐾', '🚗'];

export default function EditFamilyModal({ family, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(family.name);
  const [emoji, setEmoji] = useState(family.emoji || '🏡');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('families')
      .update({ name: name.trim(), emoji })
      .eq('id', family.id);
    if (error) { setErr(error.message); setBusy(false); }
    else onSaved && onSaved();
  };

  const remove = async () => {
    if (!confirm(`Eliminare la famiglia "${family.name}"? Verranno cancellati anche tutti i membri, gli incarichi, gli eventi e le spese collegati. Operazione irreversibile.`)) return;
    setBusy(true);
    const { error } = await supabase.from('families').delete().eq('id', family.id);
    if (error) { setErr(error.message); setBusy(false); }
    else onDeleted && onDeleted();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Modifica famiglia</h2>
        <p className="modal-sub">Cambia nome o icona di questa famiglia.</p>

        <form onSubmit={save}>
          <label htmlFor="name">Nome</label>
          <input id="name" className="input" autoFocus
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
              {busy ? <span className="spin" /> : 'Salva'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--sm)' }}>
          <button className="btn full danger" onClick={remove} disabled={busy}>
            Elimina famiglia
          </button>
          <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 8 }}>
            ⚠️ Cancella tutti i dati collegati. Irreversibile.
          </p>
        </div>
      </div>
    </div>
  );
}
