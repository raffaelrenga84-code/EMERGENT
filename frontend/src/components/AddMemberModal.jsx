import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { createBirthdayEventData } from '../lib/birthdayUtils.js';

// Ruoli "preset". Lo *value* salvato nel DB resta in italiano (compat. con dati
// esistenti); l'utente vede la traduzione `role_<id>` nella sua lingua.
const PRESET_ROLES = [
  'nonno', 'nonna', 'mamma', 'papà', 'figlio', 'figlia',
  'fratello', 'sorella', 'zio', 'zia', 'cugino', 'cugina', 'altro',
];
const COLORS = ['#1C1611', '#2A6FDB', '#C96A3A', '#2E7D52', '#9B59B6', '#E91E8C', '#E67E22', '#7C3AED', '#5A4A3A', '#8B6F5E'];

// Helper: traduce un ruolo. Per i preset usa `role_<id>`, normalizzando "papà".
// I ruoli custom vengono mostrati così come l'utente li ha scritti.
function translateRole(role, t) {
  if (!role) return '';
  const key = role === 'papà' ? 'role_papa' : `role_${role}`;
  const translated = t(key);
  // se la chiave non esiste t() ritorna la chiave stessa → fallback al raw
  return translated === key ? role : translated;
}

export default function AddMemberModal({ familyId, onClose, onCreated }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [role, setRole] = useState('figlio');
  const [customRoleMode, setCustomRoleMode] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [birthDate, setBirthDate] = useState('');
  const [isAssisted, setIsAssisted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const finalRole = customRoleMode && customRole.trim() ? customRole.trim() : role;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');

    // Tentativo 1: insert con birth_date (richiede migration applicata su Supabase).
    const tryInsert = async (withBirth) => {
      const payload = {
        family_id: familyId,
        name: name.trim(),
        role: finalRole,
        avatar_letter: name.trim().charAt(0).toUpperCase(),
        avatar_color: color,
        status: 'active',
        is_assisted: isAssisted,
      };
      if (withBirth && birthDate) payload.birth_date = birthDate;
      const { data, error } = await supabase
        .from('members').insert(payload).select().single();
      return { data, error };
    };

    let { data: created, error } = await tryInsert(!!birthDate);

    // Se il DB non ha ancora la colonna birth_date → ritenta senza, e avvisa.
    if (error && /birth_date/i.test(error.message)) {
      const second = await tryInsert(false);
      if (!second.error) {
        created = second.data;
        error = null;
        setErr(t('schema_missing_birthdate'));
        // continua: il membro viene creato senza birthdate
      }
    }

    // Se il DB non ha la colonna is_assisted (migration meds non eseguita)
    // ritento senza, in modo che il membro venga comunque creato.
    if (error && /is_assisted/i.test(error.message)) {
      const retry = await (async () => {
        const payload = {
          family_id: familyId,
          name: name.trim(),
          role: finalRole,
          avatar_letter: name.trim().charAt(0).toUpperCase(),
          avatar_color: color,
          status: 'active',
        };
        if (birthDate) payload.birth_date = birthDate;
        return supabase.from('members').insert(payload).select().single();
      })();
      if (!retry.error) {
        created = retry.data;
        error = null;
      }
    }

    if (error) { setErr(error.message); setBusy(false); return; }

    // Se ho una birthdate, provo a creare anche l'evento compleanno ricorrente.
    if (birthDate && created?.id && familyId) {
      try {
        const eventData = createBirthdayEventData({ ...created, birth_date: birthDate });
        if (eventData) {
          await supabase.from('events').insert({
            family_id: familyId,
            title: eventData.title,
            starts_at: eventData.starts_at,
            category: eventData.category,
            is_recurring: eventData.is_recurring,
            recurrence_rule: eventData.recurrence_rule,
            created_by: created.id,
          });
        }
      } catch (e) { /* non-blocking */ }
    }

    onCreated && onCreated();
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
            value={name} onChange={(e) => setName(e.target.value)}
            data-testid="addmember-name"
          />

          <div style={{ marginTop: 16 }}>
            <label>{t('addmember_role')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESET_ROLES.map((r) => {
                const isActive = !customRoleMode && role === r;
                return (
                  <button key={r} type="button"
                    onClick={() => { setCustomRoleMode(false); setRole(r); }}
                    data-testid={`addmember-role-${r}`}
                    style={{
                      padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
                      borderColor: isActive ? 'var(--k)' : 'var(--sm)',
                      background: isActive ? 'var(--sm)' : 'white',
                      fontSize: 12, fontWeight: 600,
                    }}>{translateRole(r, t)}</button>
                );
              })}
              <button type="button"
                onClick={() => setCustomRoleMode(true)}
                data-testid="addmember-role-custom-btn"
                style={{
                  padding: '6px 12px', borderRadius: 100,
                  border: customRoleMode ? '1.5px dashed var(--ac)' : '1.5px dashed var(--sm)',
                  background: customRoleMode ? 'var(--ab)' : 'white',
                  color: customRoleMode ? 'var(--ac)' : 'var(--km)',
                  fontSize: 12, fontWeight: 600,
                }}>{t('role_custom_btn')}</button>
            </div>
            {customRoleMode && (
              <input
                className="input"
                style={{ marginTop: 8 }}
                placeholder={t('role_custom_ph')}
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                data-testid="addmember-role-custom-input"
              />
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label>{t('addmember_birthdate')}</label>
            <input type="date" className="input"
              value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              data-testid="addmember-birthdate"
            />
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
              {t('addmember_birthdate_hint')}
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

          {/* Toggle "è assistito" — sblocca medicine + sezioni mediche */}
          <div style={{
            marginTop: 16, padding: 12, borderRadius: 12,
            background: isAssisted ? 'var(--gnB)' : 'var(--ab)',
            border: `1px solid ${isAssisted ? 'var(--gn)' : 'var(--sd)'}`,
            transition: 'all 0.2s ease',
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', margin: 0,
            }}>
              <input type="checkbox" checked={isAssisted}
                onChange={(e) => setIsAssisted(e.target.checked)}
                data-testid="addmember-is-assisted-toggle"
                style={{ width: 18, height: 18, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>
                  🩺 {t('em_assisted_label') || 'Questo membro è assistito'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2, lineHeight: 1.4 }}>
                  {t('em_assisted_hint') || 'Anziano, bambino o persona con esigenze speciali. Sblocca la gestione delle medicine con reminder.'}
                </div>
              </div>
            </label>
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
            <button type="submit" className="btn"
              disabled={busy || !name.trim() || (customRoleMode && !customRole.trim())}
              data-testid="addmember-submit"
            >
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
