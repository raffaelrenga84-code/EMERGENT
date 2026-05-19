import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝', '🐾', '🚗'];

/**
 * EditFamilyModal — modifica nome / emoji / FOTO della famiglia.
 *
 * Foto: il file viene caricato nel bucket pubblico `family-photos` (path
 * `family-{id}/cover.{ext}`). La public URL viene salvata in
 * `families.photo_url`. L'emoji resta come fallback se la foto manca.
 */
export default function EditFamilyModal({ family, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(family.name);
  const [emoji, setEmoji] = useState(family.emoji || '🏡');
  const [photoUrl, setPhotoUrl] = useState(family.photo_url || null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(family.photo_url || null);
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
    setPhotoUrl(null);
  };

  const uploadPhoto = async () => {
    if (!photoFile) return photoUrl; // se non e' cambiata
    const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ts = Date.now(); // evita cache
    const filePath = `family-${family.id}/cover-${ts}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('family-photos').upload(filePath, photoFile, {
        upsert: true, contentType: photoFile.type,
      });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('family-photos').getPublicUrl(filePath);
    return data?.publicUrl || null;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      let finalPhotoUrl = photoUrl;
      if (photoFile) finalPhotoUrl = await uploadPhoto();
      if (!photoPreview && photoUrl) finalPhotoUrl = null; // rimossa esplicitamente
      const { error } = await supabase.from('families')
        .update({ name: name.trim(), emoji, photo_url: finalPhotoUrl })
        .eq('id', family.id);
      if (error) throw error;
      onSaved && onSaved();
    } catch (e2) {
      setErr(e2.message || 'Errore');
      setBusy(false);
    }
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
        <p className="modal-sub">Cambia nome, foto o icona di questa famiglia.</p>

        <form onSubmit={save}>
          {/* === FOTO === */}
          <label style={{ marginTop: 8 }}>Foto famiglia (opzionale)</label>
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
              data-testid="family-photo-picker">
              {!photoPreview && <span>{emoji}</span>}
              {photoPreview && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(); }}
                  data-testid="family-photo-remove"
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
                data-testid="family-photo-upload-btn"
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
              data-testid="family-photo-input"
            />
          </div>

          <label htmlFor="name">Nome</label>
          <input id="name" className="input"
            value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label>Emoji (fallback)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  style={{
                    width: 48, height: 48, border: '1.5px solid',
                    borderColor: emoji === e ? 'var(--k)' : 'var(--sm)',
                    background: emoji === e ? 'var(--sm)' : 'white',
                    borderRadius: 12, fontSize: 22, cursor: 'pointer',
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
