import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { createBirthdayEventData } from '../lib/birthdayUtils.js';
import GiftIdeasModal from './GiftIdeasModal.jsx';

const PRESET_ROLES = [
  'nonno', 'nonna', 'mamma', 'papà', 'figlio', 'figlia',
  'fratello', 'sorella', 'zio', 'zia', 'cugino', 'cugina', 'altro', 'tu',
];
const COLORS = ['#1C1611', '#2A6FDB', '#C96A3A', '#2E7D52', '#9B59B6', '#E91E8C', '#E67E22', '#7C3AED', '#5A4A3A', '#8B6F5E'];
const EMOJI_OPTIONS = ['🙂', '😄', '🥳', '😎', '🤓', '👨', '👩', '👴', '👵', '👦', '👧', '🧑', '👶', '🤱', '👨‍🍼', '🦸', '🦹', '🧚', '🧞', '🦄'];

function translateRole(role, t) {
  if (!role) return '';
  const key = role === 'papà' ? 'role_papa' : `role_${role}`;
  const translated = t(key);
  return translated === key ? role : translated;
}

export default function EditMemberModal({ member, onClose, onSaved }) {
  const { t } = useT();
  const [name, setName] = useState(member.name);
  const initialRoleIsCustom = member.role && !PRESET_ROLES.includes(member.role);
  const [role, setRole] = useState(initialRoleIsCustom ? 'altro' : (member.role || 'altro'));
  const [customRoleMode, setCustomRoleMode] = useState(initialRoleIsCustom);
  const [customRole, setCustomRole] = useState(initialRoleIsCustom ? member.role : '');
  const [color, setColor] = useState(member.avatar_color || COLORS[0]);
  // L'emoji avatar è memorizzato in avatar_letter quando inizia con un
  // surrogate pair / non-ASCII; altrimenti è una lettera derivata dal nome.
  const initialEmoji = member.avatar_letter && /[^\w]/.test(member.avatar_letter)
    ? member.avatar_letter : '';
  const [emoji, setEmoji] = useState(initialEmoji);
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url || '');
  const [uploading, setUploading] = useState(false);
  const [birthDate, setBirthDate] = useState(member.birth_date || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showGiftIdeas, setShowGiftIdeas] = useState(false);

  const finalRole = customRoleMode && customRole.trim() ? customRole.trim() : role;

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${member.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('member-avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from('member-avatars')
        .getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
    } catch (e) {
      setErr(e.message || 'Upload error');
    }
    setUploading(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');

    const tryUpdate = async (withBirth) => {
      const payload = {
        name: name.trim(),
        role: finalRole,
        avatar_color: color,
        avatar_letter: emoji || name.trim().charAt(0).toUpperCase(),
        avatar_url: avatarUrl || null,
      };
      if (withBirth) payload.birth_date = birthDate || null;
      return supabase.from('members').update(payload).eq('id', member.id);
    };

    let { error } = await tryUpdate(true);

    // Se Supabase non ha (ancora) la colonna birth_date, riprova senza e avvisa.
    if (error && /birth_date/i.test(error.message)) {
      const second = await tryUpdate(false);
      if (!second.error) {
        error = null;
        setErr(t('schema_missing_birthdate'));
        // continuiamo: il resto del membro è stato salvato
      }
    }

    if (error) { setErr(error.message); setBusy(false); return; }

    // Crea (o aggiorna) l'evento compleanno solo se la data è cambiata davvero
    if (birthDate && birthDate !== member.birth_date) {
      const eventData = createBirthdayEventData({ ...member, name: name.trim(), birth_date: birthDate });
      if (eventData && member.family_id) {
        const { error: eventError } = await supabase.from('events').insert({
          family_id: member.family_id,
          title: eventData.title,
          starts_at: eventData.starts_at,
          category: eventData.category,
          is_recurring: eventData.is_recurring,
          recurrence_rule: eventData.recurrence_rule,
          created_by: member.id,
        });
        if (eventError) console.warn('Birthday event creation warning:', eventError.message);
      }
    }

    onSaved && onSaved();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('edit_member_h') === 'edit_member_h' ? 'Modifica membro' : t('edit_member_h')}</h2>
        <p className="modal-sub">{member.user_id ? t('member_has_account_p') !== 'member_has_account_p' ? t('member_has_account_p') : 'Questo membro ha un account.' : t('member_no_account_p') !== 'member_no_account_p' ? t('member_no_account_p') : 'Membro senza account.'}</p>

        <form onSubmit={submit}>
          {/* AVATAR PREVIEW + UPLOAD FOTO */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '10px 0', marginBottom: 12,
          }}>
            <div style={{
              position: 'relative', width: 76, height: 76, flexShrink: 0,
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt=""
                  style={{
                    width: 76, height: 76, borderRadius: '50%',
                    objectFit: 'cover', border: `3px solid ${color}`,
                  }} />
              ) : (
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: color, color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: emoji ? 38 : 30, fontWeight: 700,
                  border: '3px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}>
                  {emoji || (name.trim().charAt(0).toUpperCase() || '?')}
                </div>
              )}
              <label style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--ac)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, cursor: 'pointer',
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
              }}>
                📷
                <input type="file" accept="image/*" hidden
                  data-testid="editmember-avatar-input"
                  onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
              </label>
            </div>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--km)' }}>
              {uploading ? (
                <span>{t('uploading') || 'Caricamento foto…'}</span>
              ) : avatarUrl ? (
                <>
                  <div style={{ marginBottom: 4 }}>{t('avatar_uploaded') || 'Foto profilo caricata'}</div>
                  <button type="button"
                    onClick={() => setAvatarUrl('')}
                    data-testid="editmember-avatar-remove"
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--rd)', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', padding: 0,
                    }}>{t('remove_photo') || '✕ Rimuovi foto'}</button>
                </>
              ) : (
                <span>{t('avatar_choose_hint') || 'Tocca 📷 per caricare una foto, oppure scegli un emoji o un colore sotto.'}</span>
              )}
            </div>
          </div>

          <label htmlFor="name">{t('name_label')}</label>
          <input id="name" className="input" autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            data-testid="editmember-name"
          />

          <div style={{ marginTop: 16 }}>
            <label>{t('addmember_role')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESET_ROLES.map((r) => {
                const isActive = !customRoleMode && role === r;
                return (
                  <button key={r} type="button"
                    onClick={() => { setCustomRoleMode(false); setRole(r); }}
                    data-testid={`editmember-role-${r}`}
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
                data-testid="editmember-role-custom-btn"
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
                data-testid="editmember-role-custom-input"
              />
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="birthDate">{t('addmember_birthdate')}</label>
            <input id="birthDate" type="date" className="input"
              value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            {birthDate && (
              <button
                type="button"
                onClick={() => setShowGiftIdeas(true)}
                data-testid="open-gift-ideas"
                style={{
                  marginTop: 10, padding: '10px 14px', borderRadius: 100,
                  border: '1px dashed var(--ac)', background: 'var(--ab)',
                  color: 'var(--ac)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                ✨ {t('gift_ideas_btn') === 'gift_ideas_btn' ? 'Idee regalo AI' : t('gift_ideas_btn')}
              </button>
            )}
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

          <div style={{ marginTop: 16 }}>
            <label>{t('avatar_emoji_label') || 'Emoji avatar (opzionale)'}</label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              maxHeight: 140, overflowY: 'auto',
            }}>
              <button type="button"
                onClick={() => setEmoji('')}
                data-testid="editmember-emoji-none"
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  border: !emoji ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
                  background: !emoji ? 'rgba(193,98,75,0.10)' : 'white',
                  fontSize: 11, fontWeight: 700, color: 'var(--km)',
                  cursor: 'pointer',
                }}>
                {(name.trim().charAt(0) || '?').toUpperCase()}
              </button>
              {EMOJI_OPTIONS.map((em) => (
                <button key={em} type="button"
                  onClick={() => setEmoji(em)}
                  data-testid={`editmember-emoji-${em}`}
                  style={{
                    width: 38, height: 38, borderRadius: 10,
                    border: emoji === em ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
                    background: emoji === em ? 'rgba(193,98,75,0.10)' : 'white',
                    fontSize: 20, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{em}</button>
              ))}
            </div>
          </div>

          {err && <div className="login-msg error" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{err}</div>}

          <div className="row" style={{ marginTop: 20 }}>
            <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn"
              disabled={busy || !name.trim() || (customRoleMode && !customRole.trim())}
              data-testid="editmember-submit"
            >
              {busy ? <span className="spin" /> : t('save')}
            </button>
          </div>
        </form>

        {showGiftIdeas && (
          <GiftIdeasModal
            member={{ ...member, name, role: finalRole, birthdate: birthDate }}
            onClose={() => setShowGiftIdeas(false)}
          />
        )}
      </div>
    </div>
  );
}
