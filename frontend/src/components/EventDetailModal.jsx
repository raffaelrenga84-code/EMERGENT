import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import PhotoGalleryEditor from './PhotoGalleryEditor.jsx';
import AddEventModal from './AddEventModal.jsx';
import RecurringActionChoice from './RecurringActionChoice.jsx';
import DetailTabs from './DetailTabs.jsx';

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
  const [recurringChoice, setRecurringChoice] = useState(null); // 'edit' | 'delete'
  const [activeTab, setActiveTab] = useState('details');

  const origId = event._origId || event.id;
  const occDate = event._occurrenceDate || (event._isRecurringInstance ? new Date(event.starts_at).toISOString().slice(0, 10) : null);
  const isRecurringInstance = !!event._isRecurringInstance;
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
    // Se è un'istanza ricorrente, chiedi: solo questa o tutta la serie?
    if (isRecurringInstance && occDate) {
      setRecurringChoice('delete');
      return;
    }
    if (!confirm(t('agenda_delete_confirm') || 'Eliminare definitivamente questo evento?')) return;
    await supabase.from('events').delete().eq('id', origId);
    onChanged && onChanged();
    onClose();
  };

  const handleEditClick = () => {
    if (isRecurringInstance && occDate) {
      setRecurringChoice('edit');
      return;
    }
    setEditing(true);
  };

  // Esclude SOLO questa occorrenza aggiungendo la data a recurring_exceptions
  const excludeSingleOccurrence = async () => {
    if (!occDate) return;
    // Leggi exceptions correnti per fare push idempotente
    const { data: cur } = await supabase
      .from('events').select('recurring_exceptions').eq('id', origId).maybeSingle();
    const next = [...(cur?.recurring_exceptions || [])];
    if (!next.includes(occDate)) next.push(occDate);
    await supabase.from('events').update({ recurring_exceptions: next }).eq('id', origId);
  };

  const onSingle = async () => {
    if (recurringChoice === 'delete') {
      await excludeSingleOccurrence();
      onChanged && onChanged();
      setRecurringChoice(null);
      onClose();
    } else if (recurringChoice === 'edit') {
      // 1) Escludi questa data dalla serie
      await excludeSingleOccurrence();
      // 2) Apri AddEventModal in modalità CREAZIONE con i dati prefilled
      //    (un nuovo evento standalone, non più parte della serie)
      setRecurringChoice(null);
      setEditing(true);
    }
  };

  const onSeries = async () => {
    if (recurringChoice === 'delete') {
      if (!confirm('Sei sicuro di voler eliminare TUTTA la serie ricorrente?')) {
        setRecurringChoice(null); return;
      }
      await supabase.from('events').delete().eq('id', origId);
      onChanged && onChanged();
      setRecurringChoice(null);
      onClose();
    } else if (recurringChoice === 'edit') {
      setRecurringChoice(null);
      setEditing(true);
    }
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
          {/* Single tab: Dettagli (include foto inline) — niente più
              tab separata per le foto, ora c'è una galleria inline. */}
          {activeTab === 'details' && (
            <div data-testid="event-detail-pane-details">
          {event.location && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 4 }}>
                📍 Luogo
              </div>
              <div style={{ fontSize: 14 }}>{event.location}</div>
            </div>
          )}

          {(event.bring_member_id || event.pickup_member_id) && (
            <div style={{ marginBottom: 16 }} data-testid="event-detail-logistics">
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
                🚗 {t('event_logi_label')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {event.bring_member_id && (
                  <div style={{ fontSize: 14 }}>
                    <span style={{ color: 'var(--km)' }}>{t('event_logi_bring')}: </span>
                    <strong>{members.find((m) => m.id === event.bring_member_id)?.name || '—'}</strong>
                  </div>
                )}
                {event.pickup_member_id && (
                  <div style={{ fontSize: 14 }}>
                    <span style={{ color: 'var(--km)' }}>{t('event_logi_pickup')}: </span>
                    <strong>{members.find((m) => m.id === event.pickup_member_id)?.name || '—'}</strong>
                  </div>
                )}
              </div>
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

          {/* === FOTO ALLEGATE === (gestione inline, sotto i dettagli) */}
          <div style={{ marginTop: 18 }}>
            <PhotoGalleryEditor
              kind="event"
              parentId={event.id}
              attachments={attachments}
              photoUrls={photoUrls}
              onAdded={(att) => setAttachments((prev) => [...prev, att])}
              onRemoved={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              onOpenLightbox={setLightbox}
            />
          </div>

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
          editingEvent={isRecurringInstance ? null : { ...event, id: origId }}
          // Se è un'istanza ricorrente isolata, creiamo un NUOVO evento
          // (l'istanza è gia' stata "scissa" dalla serie via recurring_exceptions).
          // Quindi prefill con i dati dell'occorrenza ma senza editingEvent.
          familyId={event.family_id}
          families={families}
          members={members}
          authorMemberId={me?.id}
          initialTitle={isRecurringInstance ? event.title : ''}
          initialStartsAt={isRecurringInstance ? event.starts_at : ''}
          initialLocation={isRecurringInstance ? (event.location || '') : ''}
          onClose={() => setEditing(false)}
          onCreated={() => {
            setEditing(false);
            onChanged && onChanged();
            onClose();
          }}
          onUpdated={() => {
            setEditing(false);
            onChanged && onChanged();
            onClose();
          }}
        />
      )}

      {/* Modale scelta ricorrenza */}
      {recurringChoice && (
        <RecurringActionChoice
          action={recurringChoice}
          onSingle={onSingle}
          onSeries={onSeries}
          onClose={() => setRecurringChoice(null)}
        />
      )}
    </div>
  );
}
