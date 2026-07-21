import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { isIOS } from '../lib/platformDetect.js';
import { useT } from '../lib/i18n.jsx';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝', '🐾', '🚗'];

// ---------------------------------------------------------------------
// i18n locale del componente (it/en/fr/de).
// Tenuto qui (e non nel dizionario centrale) per consegnare il file
// completo senza toccare l'enorme lib/i18n.jsx. Usa `lang` da useT().
// ---------------------------------------------------------------------
const L = {
  it: {
    editTitle: 'Modifica famiglia',
    personalTitle: 'Personalizza famiglia',
    editSub: 'Cambia nome, foto o icona di questa famiglia.',
    personalSub: (name) => `Solo tu vedrai questo nome e questa foto. Gli altri vedono "${name}".`,
    photoLabel: 'Foto famiglia (opzionale)',
    uploadPhoto: 'Carica foto',
    changePhoto: 'Cambia foto',
    photoBtn: 'Foto',
    galleryBtn: 'Galleria',
    photoHint: 'Una foto rende la famiglia più riconoscibile. Senza foto, viene mostrata l\u2019emoji.',
    nameLabel: 'Nome',
    emojiLabel: 'Emoji (fallback)',
    cancel: 'Annulla',
    save: 'Salva',
    deleteFamily: 'Elimina famiglia',
    deleteHint: '⚠️ Cancella tutti i dati collegati. Irreversibile.',
    deleteConfirm: (name) => `Eliminare la famiglia "${name}"? Verranno cancellati anche tutti i membri, gli incarichi, gli eventi e le spese collegati. Operazione irreversibile.`,
    personalReset: 'Ripristina originale',
    personalSaved: 'Personalizzazione salvata (solo per te)',
    familyUpdated: '✅ Famiglia aggiornata',
    photoTooBig: 'File troppo grande (max 5MB)',
    errAliasPerm: 'Permesso negato o colonne mancanti. Esegui lo script SQL fammy-family-alias.sql su Supabase.',
    errOwnerPerm: 'Permesso negato. Esegui lo script SQL fammy-photo-permissions.sql su Supabase per permettere a tutti i membri di modificare la famiglia.',
    genericError: 'Errore',
  },
  en: {
    editTitle: 'Edit family',
    personalTitle: 'Customize family',
    editSub: 'Change the name, photo or icon of this family.',
    personalSub: (name) => `Only you will see this name and photo. Others see "${name}".`,
    photoLabel: 'Family photo (optional)',
    uploadPhoto: 'Upload photo',
    changePhoto: 'Change photo',
    photoBtn: 'Photo',
    galleryBtn: 'Gallery',
    photoHint: 'A photo makes the family more recognizable. Without a photo, the emoji is shown.',
    nameLabel: 'Name',
    emojiLabel: 'Emoji (fallback)',
    cancel: 'Cancel',
    save: 'Save',
    deleteFamily: 'Delete family',
    deleteHint: '⚠️ Deletes all linked data. Irreversible.',
    deleteConfirm: (name) => `Delete the family "${name}"? All linked members, tasks, events and expenses will also be deleted. This cannot be undone.`,
    personalReset: 'Restore original',
    personalSaved: 'Customization saved (only for you)',
    familyUpdated: '✅ Family updated',
    photoTooBig: 'File too large (max 5MB)',
    errAliasPerm: 'Permission denied or missing columns. Run the SQL script fammy-family-alias.sql on Supabase.',
    errOwnerPerm: 'Permission denied. Run the SQL script fammy-photo-permissions.sql on Supabase to let all members edit the family.',
    genericError: 'Error',
  },
  fr: {
    editTitle: 'Modifier la famille',
    personalTitle: 'Personnaliser la famille',
    editSub: 'Modifiez le nom, la photo ou l\u2019icône de cette famille.',
    personalSub: (name) => `Vous seul verrez ce nom et cette photo. Les autres voient « ${name} ».`,
    photoLabel: 'Photo de famille (facultatif)',
    uploadPhoto: 'Ajouter une photo',
    changePhoto: 'Changer la photo',
    photoBtn: 'Photo',
    galleryBtn: 'Galerie',
    photoHint: 'Une photo rend la famille plus reconnaissable. Sans photo, l\u2019emoji est affiché.',
    nameLabel: 'Nom',
    emojiLabel: 'Emoji (par défaut)',
    cancel: 'Annuler',
    save: 'Enregistrer',
    deleteFamily: 'Supprimer la famille',
    deleteHint: '⚠️ Supprime toutes les données liées. Irréversible.',
    deleteConfirm: (name) => `Supprimer la famille « ${name} » ? Tous les membres, tâches, événements et dépenses liés seront également supprimés. Action irréversible.`,
    personalReset: 'Rétablir l\u2019original',
    personalSaved: 'Personnalisation enregistrée (visible par vous seul)',
    familyUpdated: '✅ Famille mise à jour',
    photoTooBig: 'Fichier trop volumineux (max 5 Mo)',
    errAliasPerm: 'Autorisation refusée ou colonnes manquantes. Exécutez le script SQL fammy-family-alias.sql sur Supabase.',
    errOwnerPerm: 'Autorisation refusée. Exécutez le script SQL fammy-photo-permissions.sql sur Supabase pour permettre à tous les membres de modifier la famille.',
    genericError: 'Erreur',
  },
  de: {
    editTitle: 'Familie bearbeiten',
    personalTitle: 'Familie anpassen',
    editSub: 'Ändere Name, Foto oder Symbol dieser Familie.',
    personalSub: (name) => `Nur du siehst diesen Namen und dieses Foto. Andere sehen „${name}".`,
    photoLabel: 'Familienfoto (optional)',
    uploadPhoto: 'Foto hochladen',
    changePhoto: 'Foto ändern',
    photoBtn: 'Foto',
    galleryBtn: 'Galerie',
    photoHint: 'Ein Foto macht die Familie leichter erkennbar. Ohne Foto wird das Emoji angezeigt.',
    nameLabel: 'Name',
    emojiLabel: 'Emoji (Fallback)',
    cancel: 'Abbrechen',
    save: 'Speichern',
    deleteFamily: 'Familie löschen',
    deleteHint: '⚠️ Löscht alle verknüpften Daten. Unwiderruflich.',
    deleteConfirm: (name) => `Familie „${name}" löschen? Alle verknüpften Mitglieder, Aufgaben, Ereignisse und Ausgaben werden ebenfalls gelöscht. Nicht umkehrbar.`,
    personalReset: 'Original wiederherstellen',
    personalSaved: 'Anpassung gespeichert (nur für dich)',
    familyUpdated: '✅ Familie aktualisiert',
    photoTooBig: 'Datei zu groß (max. 5 MB)',
    errAliasPerm: 'Zugriff verweigert oder fehlende Spalten. Führe das SQL-Skript fammy-family-alias.sql in Supabase aus.',
    errOwnerPerm: 'Zugriff verweigert. Führe das SQL-Skript fammy-photo-permissions.sql in Supabase aus, damit alle Mitglieder die Familie bearbeiten können.',
    genericError: 'Fehler',
  },
};

/**
 * EditFamilyModal — modifica nome / emoji / FOTO della famiglia.
 *
 * Due modalità:
 * - owner (default): modifica la famiglia REALE (`families`), visibile a tutti.
 * - personal={true}: salva un ALIAS personale su `members.custom_family_*`
 *   (solo l'utente corrente vede nome/emoji/foto personalizzati; richiede
 *   lo script SQL fammy-family-alias.sql).
 *
 * Foto: il file viene caricato nel bucket pubblico `family-photos` (path
 * `family-{id}/cover.{ext}`, o `family-{id}/alias-{uid}.{ext}` in modalità
 * personale). L'emoji resta come fallback se la foto manca.
 */
export default function EditFamilyModal({ family, onClose, onSaved, onDeleted, personal = false, session }) {
  const { lang } = useT();
  const tr = L[lang] || L.it;
  // Valori reali (sempre presenti dopo il merge in App.jsx; fallback ai
  // display se il modal riceve un oggetto famiglia "grezzo").
  const realName = family.real_name !== undefined ? family.real_name : family.name;
  const realEmoji = family.real_emoji !== undefined ? family.real_emoji : family.emoji;
  const realPhotoUrl = family.real_photo_url !== undefined ? family.real_photo_url : family.photo_url;
  // personal: parte dalla vista corrente (alias se già impostato);
  // owner: parte dai valori REALI (per non salvare per sbaglio un alias).
  const initName = personal ? family.name : realName;
  const initEmoji = (personal ? family.emoji : realEmoji) || '🏡';
  const initPhoto = (personal ? family.photo_url : realPhotoUrl) || null;
  const [name, setName] = useState(initName);
  const [emoji, setEmoji] = useState(initEmoji);
  const [photoUrl, setPhotoUrl] = useState(initPhoto);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(initPhoto);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);
  const fileInputCameraRef = useRef(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr(tr.photoTooBig);
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
    const filePath = personal
      ? `family-${family.id}/alias-${session?.user?.id}-${ts}.${ext}`
      : `family-${family.id}/cover-${ts}.${ext}`;
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

      if (personal) {
        // ALIAS personale: salva su members.custom_family_* (riga propria)
        const { data, error } = await supabase.from('members')
          .update({
            custom_family_name: name.trim(),
            custom_family_emoji: emoji,
            custom_family_photo_url: finalPhotoUrl,
          })
          .eq('family_id', family.id)
          .eq('user_id', session.user.id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(tr.errAliasPerm);
        }
        window.dispatchEvent(new CustomEvent('fammy_toast', {
          detail: { text: `✅ ${tr.personalSaved}`, tone: 'success' },
        }));
        setBusy(false);
        onSaved && onSaved({ ...family, name: name.trim(), emoji, photo_url: finalPhotoUrl });
        return;
      }

      // Usiamo .select() per ottenere le righe aggiornate. Se RLS blocca
      // l'update (es. il SQL `fammy-photo-permissions.sql` non è stato
      // ancora eseguito), riceviamo data=[] senza error → check esplicito.
      const { data, error } = await supabase.from('families')
        .update({ name: name.trim(), emoji, photo_url: finalPhotoUrl })
        .eq('id', family.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(tr.errOwnerPerm);
      }
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: tr.familyUpdated, tone: 'success' },
      }));
      setBusy(false);
      onSaved && onSaved({
        ...family,
        name: name.trim(), emoji, photo_url: finalPhotoUrl,
        real_name: name.trim(), real_emoji: emoji, real_photo_url: finalPhotoUrl,
      });
    } catch (e2) {
      setErr(e2.message || tr.genericError);
      setBusy(false);
    }
  };

  // Rimuove l'alias personale → torna a vedere i valori reali
  const resetPersonal = async () => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('members')
      .update({
        custom_family_name: null,
        custom_family_emoji: null,
        custom_family_photo_url: null,
      })
      .eq('family_id', family.id)
      .eq('user_id', session.user.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved && onSaved({ ...family, name: realName, emoji: realEmoji, photo_url: realPhotoUrl });
  };

  const remove = async () => {
    if (!confirm(tr.deleteConfirm(family.name))) return;
    setBusy(true);
    const { error } = await supabase.from('families').delete().eq('id', family.id);
    if (error) { setErr(error.message); setBusy(false); }
    else onDeleted && onDeleted();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{personal ? tr.personalTitle : tr.editTitle}</h2>
        <p className="modal-sub">
          {personal ? tr.personalSub(realName) : tr.editSub}
        </p>

        <form onSubmit={save}>
          {/* === FOTO === */}
          <label style={{ marginTop: 8 }}>{tr.photoLabel}</label>
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
              {isIOS() ? (
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
                  📸 {photoPreview ? tr.changePhoto : tr.uploadPhoto}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => fileInputCameraRef.current?.click()}
                    data-testid="family-photo-camera-btn"
                    style={{
                      padding: '8px 12px', borderRadius: 100,
                      border: '1.5px solid var(--ac)', background: 'white',
                      color: 'var(--ac)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', flex: 1,
                    }}>
                    📷 {tr.photoBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="family-photo-upload-btn"
                    style={{
                      padding: '8px 12px', borderRadius: 100,
                      border: '1.5px solid var(--ac)', background: 'white',
                      color: 'var(--ac)', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', flex: 1,
                    }}>
                    🖼️ {tr.galleryBtn}
                  </button>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--km)', margin: '6px 0 0', lineHeight: 1.4 }}>
                {tr.photoHint}
              </p>
            </div>
            <input
              ref={fileInputRef} type="file" accept="image/*"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
              data-testid="family-photo-input"
            />
            <input
              ref={fileInputCameraRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
              data-testid="family-photo-input-camera"
            />
          </div>

          <label htmlFor="name">{tr.nameLabel}</label>
          <input id="name" className="input"
            value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label>{tr.emojiLabel}</label>
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
            <button type="button" className="btn secondary" onClick={onClose}>{tr.cancel}</button>
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? <span className="spin" /> : tr.save}
            </button>
          </div>
        </form>

        {personal ? (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--sm)' }}>
            <button type="button" className="link-btn" onClick={resetPersonal} disabled={busy}
              data-testid="family-personal-reset"
              style={{ width: '100%', textAlign: 'center' }}>
              ↩️ {tr.personalReset} ("{realName}")
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--sm)' }}>
            <button className="btn full danger" onClick={remove} disabled={busy}>
              {tr.deleteFamily}
            </button>
            <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 8 }}>
              {tr.deleteHint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
