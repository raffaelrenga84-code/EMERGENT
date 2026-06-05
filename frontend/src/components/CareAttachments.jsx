import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * CareAttachments — uploader + galleria di allegati Care Hub.
 *
 * Props:
 *  - memberId: string (UUID) — l'assistito a cui appartengono gli allegati
 *  - kind: 'profile' | 'medication' | 'diary'
 *  - parentId: string | null — UUID di medicina o entry diario; null per profile
 *  - meId: string — il member loggato (per uploaded_by)
 *  - compact?: boolean — UI compatta (no titolo, no descrizione)
 *
 * Layout:
 *   Header (titolo + bottone "+ Aggiungi") + griglia 3-col di thumbnail
 *   con ✕ per cancellare. PDF mostrato come icona generica.
 */
export default function CareAttachments({ memberId, kind, parentId = null, meId = null, compact = false }) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    let q = supabase.from('care_attachments').select('*')
      .eq('member_id', memberId)
      .eq('kind', kind)
      .order('created_at', { ascending: false });
    if (parentId) q = q.eq('parent_id', parentId);
    else q = q.is('parent_id', null);
    const { data, error } = await q;
    if (error) setErr(error.message);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { if (memberId) load(); /* eslint-disable-next-line */ }, [memberId, kind, parentId]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di ricaricare lo stesso file
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr(t('care_att_too_big') || 'File troppo grande (max 10MB)');
      return;
    }
    setUploading(true); setErr('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const filePath = `member-${memberId}/${kind}/${ts}-${rand}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('care-attachments')
        .upload(filePath, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('care-attachments').getPublicUrl(filePath);
      const { error: insErr } = await supabase.from('care_attachments').insert({
        member_id: memberId,
        kind,
        parent_id: parentId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: meId,
      });
      if (insErr) throw insErr;
      await load();
    } catch (e2) {
      setErr(e2.message || 'Errore');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (att) => {
    if (!confirm(t('care_att_delete_confirm', { name: att.file_name }) ||
      `Eliminare l'allegato "${att.file_name}"?`)) return;
    // Best-effort: cancella storage + DB
    await supabase.storage.from('care-attachments').remove([att.file_path]);
    await supabase.from('care_attachments').delete().eq('id', att.id);
    await load();
  };

  const isPdf = (att) => (att.mime_type || '').includes('pdf') || /\.pdf$/i.test(att.file_name);
  const publicUrl = (att) => supabase.storage.from('care-attachments').getPublicUrl(att.file_path).data?.publicUrl;

  return (
    <div data-testid={`care-attachments-${kind}`}>
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--km)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            📎 {t('care_att_h') || 'Documenti & foto'} {items.length > 0 && `(${items.length})`}
          </div>
          <label
            data-testid={`care-att-upload-btn-${kind}`}
            style={{
              padding: '6px 12px', borderRadius: 100,
              border: '1.5px solid var(--ac)', background: 'white',
              color: 'var(--ac)', fontSize: 12, fontWeight: 700,
              cursor: uploading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              opacity: uploading ? 0.6 : 1,
            }}>
            {uploading ? (t('care_att_uploading') || 'Carico…') : `+ ${t('care_att_add') || 'Aggiungi'}`}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFile}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {compact && items.length === 0 && uploading && (
        <div style={{ fontSize: 11, color: 'var(--km)' }}>
          {t('care_att_uploading') || 'Carico…'}
        </div>
      )}

      {err && (
        <div style={{
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(220, 38, 38, 0.08)', color: 'var(--rd)',
          fontSize: 12, fontWeight: 600, marginBottom: 8,
        }}>{err}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--km)' }}>{t('loading') || 'Caricamento…'}</div>
      ) : items.length === 0 ? (
        !compact && (
          <div
            data-testid={`care-att-empty-${kind}`}
            style={{
              padding: '20px 12px', textAlign: 'center',
              border: '1.5px dashed var(--sm)', borderRadius: 12,
              color: 'var(--km)', fontSize: 12,
            }}>
            {t('care_att_empty') || 'Nessun documento ancora. Carica foto o PDF di referti, esami, ricette…'}
          </div>
        )
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 8,
        }}>
          {items.map((att) => {
            const url = publicUrl(att);
            const pdf = isPdf(att);
            return (
              <div
                key={att.id}
                data-testid={`care-att-${att.id}`}
                style={{
                  position: 'relative', aspectRatio: '1 / 1',
                  borderRadius: 10, overflow: 'hidden',
                  border: '1px solid var(--sm)',
                  background: pdf ? 'var(--ab)' : `url(${url}) center/cover no-repeat`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => url && window.open(url, '_blank', 'noopener')}
                title={att.file_name}>
                {pdf && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 4, padding: 4, textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 28 }}>📄</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--km)',
                      maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{att.file_name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(att); }}
                  data-testid={`care-att-delete-${att.id}`}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)', color: 'white',
                    border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
              </div>
            );
          })}

          {/* Compact: bottone "+" inline come cella della griglia */}
          {compact && (
            <label
              data-testid={`care-att-add-tile-${kind}`}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 10,
                border: '1.5px dashed var(--ac)',
                background: 'var(--ab)', color: 'var(--ac)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'wait' : 'pointer', fontSize: 22,
                opacity: uploading ? 0.5 : 1,
              }}>
              {uploading ? '…' : '+'}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFile}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
