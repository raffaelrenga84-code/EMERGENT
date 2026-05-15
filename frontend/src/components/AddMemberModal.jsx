import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

const ROLES = ['nonno', 'nonna', 'mamma', 'papà', 'figlio', 'figlia', 'fratello', 'sorella', 'zio', 'zia', 'cugino', 'cugina', 'altro'];
const COLORS = ['#1C1611', '#2A6FDB', '#C96A3A', '#2E7D52', '#9B59B6', '#E91E8C', '#E67E22', '#7C3AED', '#5A4A3A', '#8B6F5E'];

export default function AddMemberModal({ familyId, onClose, onCreated }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [role, setRole] = useState('figlio');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');

    const { error } = await supabase.from('members').insert({
      family_id: familyId,
      name: name.trim(),
      role,
      avatar_letter: name.trim().charAt(0).toUpperCase(),
      avatar_color: color,
      status: 'active',
    });

    if (error) { setErr(error.message); setBusy(false); }
    else onCreated && onCreated();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('addmember_h')}</h2>
        <p className="modal-sub">{t('addmember_sub')}</p>

        <form onSubmit={submit}>
          <label htmlFor="name">{t('name_label')}</label>
          <input id="name" className="input" autoFocus
            placeholder={t('addmember_name_ph')}
            value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label>{t('addmember_role')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  style={{
                    padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
                    borderColor: role === r ? 'var(--k)' : 'var(--sm)',
                    background: role === r ? 'var(--sm)' : 'white',
                    fontSize: 12, fontWeight: 600,
                  }}>{r}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label>{t('addmember_color')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 12, background: c,
                    border: color === c ? '3px solid var(--k)' : '1.5px solid var(--sm)',
                  }} />
              ))}
            </div>
          </div>

          <div style={{
            marginTop: 20, padding: 14, background: 'var(--ab)',
            borderRadius: 12, fontSize: 13, color: 'var(--ac)', lineHeight: 1.5,
          }}>
            💡 {t('addmember_invite_hint')}
          </div>

          {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}

          <div className="row" style={{ marginTop: 20 }}>
            <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
