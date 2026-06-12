import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { isIOS } from '../lib/platformDetect.js';
import { isImageFile, DOC_ACCEPT } from '../lib/fileKind.js';

/**
 * PhotoGalleryEditor — UI compatta per gestire le foto allegate a un
 * task o evento. Funzionalità:
 *   - Anteprima a griglia 3-col (click → lightbox)
 *   - Bottone "+ Aggiungi foto" sempre visibile (file picker multipla)
 *   - ✕ in overlay su ogni thumbnail per rimuovere
 *   - Empty state amichevole con CTA "Aggiungi la prima foto"
 *
 * Props:
 *   - kind: 'task' | 'event' (decide bucket Storage + tabella DB)
 *   - parentId: task_id o event_id
 *   - meId: member.id corrente (usato per uploaded_by, solo task)
 *   - attachments: [{id, file_name, file_path, uploaded_by}]
 *   - photoUrls: {attId: signedUrl}
 *   - onAdded: (newAtt) => void
 *   - onRemoved: (attId) => void
 *   - onOpenLightbox: (url) => void
 */
export default function PhotoGalleryEditor({
  kind, parentId, meId,
  attachments, photoUrls,
  onAdded, onRemoved, onOpenLightbox,
}) {
  const { t } = useT();
  const fileRef = useRef(null);
  const fileCameraRef = useRef(null);
  const fileDocRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const bucket = kind === 'event' ? 'event-attachments' : 'task-attachments';
  const tableDb = kind === 'event' ? 'event_attachments' : 'task_attachments';
  const folder  = kind === 'event' ? 'events' : 'tasks';
  const parentFk = kind === 'event' ? 'event_id' : 'task_id';

  const handlePick = () => {
    setError('');
    fileRef.current?.click();
  };
  const handlePickCamera = () => {
    setError('');
    fileCameraRef.current?.click();
  };
  const handlePickDoc = () => {
    setError('');
    fileDocRef.current?.click();
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError('');

    for (const file of files) {
      try {
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `${folder}/${parentId}/${fileName}`;

        const { error: upErr } = await supabase.storage
          .from(bucket).upload(filePath, file);
        if (upErr) { setError(upErr.message || 'Upload failed'); continue; }

        // Inserisci record DB con uploaded_by (solo task ha il campo)
        const row = {
          [parentFk]: parentId,
          file_path: filePath,
          file_name: file.name,
          ...(kind === 'task' && meId ? { uploaded_by: meId } : {}),
        };
        const { data: created, error: dbErr } = await supabase
          .from(tableDb).insert(row).select().single();
        if (dbErr) { setError(dbErr.message); continue; }
        onAdded && onAdded(created);
      } catch (err) {
        setError(err?.message || 'Errore');
      }
    }
    setUploading(false);
    // Reset input value: serve per permettere re-upload dello stesso file
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRemove = async (att) => {
    if (!confirm(t('td_remove_photo_confirm') || 'Rimuovere questa foto?')) return;
    try {
      if (att.file_path) {
        await supabase.storage.from(bucket).remove([att.file_path]);
      }
    } catch (_) { /* best-effort */ }
    const { error: dbErr } = await supabase.from(tableDb).delete().eq('id', att.id);
    if (dbErr) {
      alert(dbErr.message || 'Errore');
      return;
    }
    onRemoved && onRemoved(att.id);
  };

  const hasPhotos = attachments && attachments.length > 0;

  return (
    <div data-testid={`photo-gallery-${kind}`}>
      {/* iOS: il picker nativo offre anche "Sfoglia" → un solo input con
          immagini+documenti. Android: image/* qui (galleria), documenti
          tramite l'input dedicato sotto (image/* nasconde il file manager). */}
      <input
        ref={fileRef} type="file" multiple
        accept={isIOS() ? `image/*,${DOC_ACCEPT}` : 'image/*'}
        data-testid={`photo-gallery-input-${kind}`}
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      <input
        ref={fileCameraRef} type="file" accept="image/*" capture="environment"
        data-testid={`photo-gallery-input-camera-${kind}`}
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      <input
        ref={fileDocRef} type="file" multiple accept={DOC_ACCEPT}
        data-testid={`photo-gallery-input-doc-${kind}`}
        onChange={handleFiles}
        style={{ display: 'none' }}
      />

      {/* Header con count + bottoni aggiungi (camera + gallery) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 6,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--km)',
          textTransform: 'uppercase',
        }}>
          📸 {t('td_attach_photos') || 'Foto'}{hasPhotos ? ` (${attachments.length})` : ''}
        </div>
        {/* Bottoni sempre visibili (anche a 0 allegati): su Android il
            📎 è l'unico modo per raggiungere il file manager. */}
        {isIOS() ? (
          <button type="button" onClick={handlePick} disabled={uploading}
            data-testid={`photo-gallery-add-btn-${kind}`}
            style={{
              padding: '6px 12px', borderRadius: 100, background: 'var(--ac)',
              color: 'white', border: 'none', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>+ {t('td_add_photo') || 'Aggiungi'}</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handlePickCamera} disabled={uploading}
              data-testid={`photo-gallery-camera-btn-${kind}`}
              style={{
                padding: '6px 10px', borderRadius: 100, background: 'var(--ac)',
                color: 'white', border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}>📷</button>
            <button type="button" onClick={handlePick} disabled={uploading}
              data-testid={`photo-gallery-add-btn-${kind}`}
              style={{
                padding: '6px 10px', borderRadius: 100, background: 'var(--ac)',
                color: 'white', border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}>🖼️</button>
            <button type="button" onClick={handlePickDoc} disabled={uploading}
              data-testid={`photo-gallery-doc-btn-${kind}`}
              style={{
                padding: '6px 10px', borderRadius: 100, background: 'var(--ac)',
                color: 'white', border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}>📎</button>
          </div>
        )}
      </div>

      {/* Empty state oppure griglia */}
      {!hasPhotos ? (
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          data-testid={`photo-gallery-add-empty-${kind}`}
          style={{
            width: '100%', padding: '24px 16px',
            border: '2px dashed var(--sm)', borderRadius: 12,
            background: 'var(--ab)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            color: 'var(--km)',
          }}>
          <div style={{ fontSize: 32 }}>📷</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--k)' }}>
            {uploading
              ? (t('td_uploading') || 'Caricamento…')
              : (t('td_add_first_photo') || 'Aggiungi la prima foto')}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.4, textAlign: 'center' }}>
            {t('td_add_photo_hint') || 'JPG, PNG o PDF. Puoi selezionare più file.'}
          </div>
        </button>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 8,
        }}>
          {attachments.map((att) => {
            const isImg = isImageFile(att.file_name || att.file_path);
            return (
              <div key={att.id} style={{ position: 'relative' }}>
                {isImg ? (
                  <button type="button"
                    onClick={() => onOpenLightbox && onOpenLightbox(photoUrls?.[att.id])}
                    data-testid={`${kind}-photo-${att.id}`}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 10,
                      overflow: 'hidden', border: '1px solid var(--sm)',
                      padding: 0, background: 'var(--ab)', cursor: 'zoom-in',
                    }}>
                    {photoUrls?.[att.id] ? (
                      <img src={photoUrls[att.id]} alt={att.file_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 24,
                      }}>🖼️</div>
                    )}
                  </button>
                ) : (
                  /* Documento (PDF, ecc.): tap → apre in nuova scheda */
                  <a href={photoUrls?.[att.id] || '#'} target="_blank" rel="noreferrer"
                    data-testid={`${kind}-doc-${att.id}`}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 10,
                      border: '1px solid var(--sm)', background: 'var(--ab)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 4, padding: 6,
                      textDecoration: 'none', boxSizing: 'border-box',
                    }}>
                    <span style={{ fontSize: 22 }}>📄</span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: 'var(--km)',
                      wordBreak: 'break-all', textAlign: 'center',
                      maxHeight: 26, overflow: 'hidden',
                    }}>{att.file_name}</span>
                  </a>
                )}
                {/* ✕ remove sempre visibile — RLS gestisce permessi finali */}
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(att); }}
                  data-testid={`${kind}-photo-remove-${att.id}`}
                  title={t('td_remove_photo') || 'Rimuovi foto'}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)', border: 'none',
                    color: 'white', cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                  }}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 8,
          background: '#FDECEC', color: '#A93B2B',
          fontSize: 11, fontWeight: 600,
        }}>{error}</div>
      )}
    </div>
  );
}
