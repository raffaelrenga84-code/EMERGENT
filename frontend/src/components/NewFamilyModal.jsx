import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝', '🐾', '🚗'];

/**
 * NewFamilyModal — crea una nuova famiglia con nome, emoji e (opzionale) foto.
 *
 * Foto: caricata nel bucket pubblico `family-photos` DOPO l'INSERT della
 * famiglia (serve l'id per il path). Se l'upload fallisce, la famiglia
 * viene comunque creata con la sola emoji come fallback.
 */
export default function NewFamilyModal({ session, profile, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏡');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr('File troppo grande (max 5MB)');
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const uploadPhoto = async (familyId) => {
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ts = Date.now();
    const filePath = `family-${familyId}/cover-${ts}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('family-photos').upload(filePath, photoFile, {
        upsert: true, contentType: photoFile.type,
      });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('family-photos').getPublicUrl(filePath);
    return data?.publicUrl || null;
  };

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      // 1) Crea la famiglia
      const { data: fam, error: e1 } = await supabase
        .from('families')
        .insert({ name: name.trim(), emoji, created_by: session.user.id })
        .select().single();
      if (e1) throw e1;

      // 2) Carica la foto (best-effort: se fallisce la famiglia resta creata)
      if (photoFile) {
        try {
          const photoUrl = await uploadPhoto(fam.id);
          if (photoUrl) {
            await supabase.from('families')
              .update({ photo_url: photoUrl })
              .eq('id', fam.id);
          }
        } catch (upErr) {
          // Foto fallita ma famiglia creata: warning non-bloccante
          console.warn('Upload foto famiglia fallito:', upErr);
        }
      }

      // 3) Crea il membro owner
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

          {/* === FOTO (opzionale) === */}
          <label style={{ marginTop: 16 }}>Foto famiglia (opzionale)</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12,
          }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 84, height: 84, borderRadius: 20,
                background: photoPreview
                  ? `url(${photoPreview}) center/cover no-repeat`
                  : 'var(--ab)',
                border: '2px dashed',
                borderColor: photoPreview ? 'var(--ac)' : 'var(--sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, cursor: 'pointer',
                flexShrink: 0, position: 'relative',
              }}
              data-testid="new-family-photo-picker">
              {!photoPreview && <span>{emoji}</span>}
              {photoPreview && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                  data-testid="new-family-photo-remove"
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--rd)', color: 'white',
                    border: '2px solid white', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="new-family-photo-upload-btn"
                style={{
                  padding: '8px 14px', borderRadius: 100,
                  border: '1.5px solid var(--ac)', background: 'white',
                  color: 'var(--ac)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}>
                📸 {photoPreview ? 'Cambia foto' : 'Carica foto'}
              </button>
              <p style={{ fontSize: 11, color: 'var(--km)', margin: '6px 0 0', lineHeight: 1.4 }}>
                Una foto rende la famiglia più riconoscibile. Senza foto, viene mostrata l'emoji.
              </p>
            </div>
            <input
              ref={fileInputRef} type="file" accept="image/*"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
              data-testid="new-family-photo-input"
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label>Emoji {photoPreview ? '(fallback)' : ''}</label>
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
