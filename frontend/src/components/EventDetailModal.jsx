import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import AddEventModal from './AddEventModal.jsx';

/**
 * EventDetailModal — mostra dettagli completi di un evento:
 * data+ora, luogo, descrizione, assegnatari (lista membri), foto allegate.
 * Permette l'eliminazione se l'utente è il creator.
 */
export default function EventDetailModal({ event, families = [], members = [], me, onClose, onChanged }) {
  const { t } = useT();
  const [assignees, setAssignees] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoUrls, setPhotoUrls] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [editing, setEditing] = useState(false);

  const origId = event._origId || event.id;
  const family = families.find((f) => f.id === event.family_id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [aRes, attRes] = await Promise.all([
        supabase.from('event_assignees').select('member_id').eq('event_id', origId),
        supabase.from('event_attachments').select('id, file_path, file_name').eq('event_id', origId),
      ]);
      if (cancelled) return;
      setAssignees((aRes.data || []).map((a) => a.member_id));
      setAttachments(attRes.data || []);
      // signed URLs per le foto (bucket privato)
      const urls = {};
      for (const att of (attRes.data || [])) {
        const { data: sig } = await supabase.storage
          .from('event-attachments')
          .createSignedUrl(att.file_path, 60 * 60);
        if (sig?.signedUrl) urls[att.id] = sig.signedUrl;
      }
      if (!cancelled) {
        setPhotoUrls(urls);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [origId]);

  const start = new Date(event.starts_at);
  const canDelete = !event.created_by || event.created_by === me?.id;
  const canEdit = canDelete; // stessa logica
  const assigneeMembers = members.filter((m) => assignees.includes(m.id));

  const handleDelete = async () => {
    if (!confirm(t('agenda_delete_confirm') || 'Eliminare definitivamente questo evento?')) return;
    await supabase.from('events').delete().eq('id', origId);
    onChanged && onChanged();
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose} data-testid="event-detail-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="event-date" style={{
              background: 'var(--ab)', padding: '6px 10px', borderRadius: 10,
              textAlign: 'center', minWidth: 56,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
                {start.toLocaleDateString(undefined, { month: 'short' })}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--k)' }}>{start.getDate()}</div>
              <div style={{ fontSize: 11, color: 'var(--km)' }}>
                {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }} data-testid="event-detail-title">{event.title}</h2>
              {family && (
                <div style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 100,
                  background: family.color ? family.color + '22' : 'var(--sm)',
                  color: family.color || 'var(--km)',
                  fontSize: 11, fontWeight: 600, marginTop: 4,
                }}>
                  {family.emoji} {family.name}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 6 }}>
                {start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}
                {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12 }}>
          {event.location && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 4 }}>
                📍 Luogo
              </div>
              <div style={{ fontSize: 14 }}>{event.location}</div>
            </div>
          )}

          {event.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 4 }}>
                📝 Note
              </div>
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{event.description}</div>
            </div>
          )}

          {/* === ASSEGNATARI === */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
              👥 Assegnato a {assigneeMembers.length > 0 ? `(${assigneeMembers.length})` : ''}
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--km)' }}>Caricamento…</div>
            ) : assigneeMembers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--km)', fontStyle: 'italic' }}>
                Nessuno assegnato — questo evento è per tutta la famiglia
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assigneeMembers.map((m) => (
                  <div key={m.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px 4px 4px', borderRadius: 100,
                    border: '1px solid var(--sm)', background: 'white',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: 8,
                      background: m.avatar_color || '#1C1611', color: 'white',
                      fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {m.avatar_letter || m.name.charAt(0).toUpperCase()}
                    </span>
                    {m.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* === FOTO === */}
          {(loading || attachments.length > 0) && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
                📸 Foto {attachments.length > 0 ? `(${attachments.length})` : ''}
              </div>
              {loading ? (
                <div style={{ fontSize: 13, color: 'var(--km)' }}>Caricamento…</div>
              ) : (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8,
                }}>
                  {attachments.map((att) => (
                    <button key={att.id} type="button" onClick={() => setLightbox(photoUrls[att.id])}
                      data-testid={`event-photo-${att.id}`}
                      style={{
                        aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                        border: '1px solid var(--sm)', padding: 0, background: 'var(--ab)',
                        cursor: 'zoom-in',
                      }}>
                      {photoUrls[att.id] ? (
                        <img src={photoUrls[att.id]} alt={att.file_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 22,
                        }}>🖼️</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--sm)' }}>
          <button type="button" className="btn secondary" onClick={onClose} data-testid="event-detail-close">
            {t('close') || 'Chiudi'}
          </button>
          {canEdit && (
            <button type="button" className="btn" onClick={() => setEditing(true)}
              data-testid="event-detail-edit"
              style={{
                background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
                color: 'white', border: 'none',
              }}>
              ✏️ Modifica
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn" onClick={handleDelete} data-testid="event-detail-delete"
              style={{ background: 'var(--rd)' }}>
              🗑
            </button>
          )}
        </div>
      </div>

      {/* Lightbox foto */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} data-testid="event-photo-lightbox" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, cursor: 'zoom-out',
        }}>
          <img src={lightbox} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} alt="" />
        </div>
      )}

      {/* Modale di modifica evento */}
      {editing && (
        <AddEventModal
          editingEvent={{ ...event, id: origId }}
          familyId={event.family_id}
          families={families}
          members={members}
          authorMemberId={me?.id}
          onClose={() => setEditing(false)}
          onUpdated={() => {
            setEditing(false);
            onChanged && onChanged();
            onClose();
          }}
        />
      )}
    </div>
  );
}
