import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useKeyboardSafeModal } from '../lib/useKeyboardSafeModal.jsx';
import { useAndroidBack } from '../lib/useAndroidBack.js';
import { isIOS } from '../lib/platformDetect.js';
import { isImageFile, DOC_ACCEPT } from '../lib/fileKind.js';
import { sendPush, memberIdsToUserIds } from '../lib/pushClient.js';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * AddEventModal — single-page con: titolo, data+ora, luogo, assegnatari,
 * ricorrenza, note, foto.
 *
 * Modi:
 *  - Creazione (default): editingEvent = null
 *  - Modifica: editingEvent = event object → pre-popola e fa UPDATE
 */
export default function AddEventModal({
  familyId, families = [], members = [], authorMemberId,
  editingEvent = null,
  onClose, onCreated, onUpdated,
  // Prefill (es. dal tool calling dell'AI assistant)
  initialTitle = '', initialStartsAt = '', initialLocation = '',
}) {
  const { t } = useT();
  const isEdit = !!editingEvent;
  // Sorgente prefill: se editing, prendiamo da editingEvent; altrimenti dai initial*
  const sourceStartsAt = editingEvent?.starts_at || initialStartsAt || '';
  const _initialDate = sourceStartsAt ? sourceStartsAt.slice(0, 10) : '';
  const _initialTime = sourceStartsAt && sourceStartsAt.length >= 16
    ? new Date(sourceStartsAt).toTimeString().slice(0, 5)
    : '';
  const [title, setTitle] = useState(editingEvent?.title || initialTitle || '');
  const [date, setDate] = useState(_initialDate);
  const [time, setTime] = useState(_initialTime);
  const [location, setLocation] = useState(editingEvent?.location || initialLocation || '');
  const [description, setDescription] = useState(editingEvent?.description || '');
  const [recurringDays, setRecurringDays] = useState(editingEvent?.recurring_days || []);
  const [recurringUntil, setRecurringUntil] = useState(editingEvent?.recurring_until || '');
  const [assignees, setAssignees] = useState([]);
  // Logistica evento: chi porta / chi riprende (member_id singoli, opzionali)
  const [bringMemberId, setBringMemberId] = useState(editingEvent?.bring_member_id || '');
  const [pickupMemberId, setPickupMemberId] = useState(editingEvent?.pickup_member_id || '');
  // Membri selezionabili per la logistica (esclude i contatti solo-compleanno)
  const logiMembers = (members || []).filter((m) => !m.is_contact_only);

  // Push best-effort ai membri appena taggati come "porta"/"riprende".
  // Su modifica notifica solo se il tag è cambiato; mai a sé stessi.
  const notifyLogistics = async (eventId, prevBring, prevPickup) => {
    try {
      const targets = [];
      if (bringMemberId && bringMemberId !== prevBring && bringMemberId !== authorMemberId)
        targets.push({ memberId: bringMemberId, role: 'bring' });
      if (pickupMemberId && pickupMemberId !== prevPickup && pickupMemberId !== authorMemberId)
        targets.push({ memberId: pickupMemberId, role: 'pickup' });
      if (targets.length === 0) return;
      const evTitle = title.trim();
      for (const tgt of targets) {
        const userIds = [...(await memberIdsToUserIds([tgt.memberId]))];
        if (userIds.length === 0) continue;
        const roleLabel = tgt.role === 'bring' ? t('event_logi_bring') : t('event_logi_pickup');
        await sendPush({
          userIds,
          title: `🚗 ${roleLabel}: ${evTitle}`,
          body: t('event_logi_push_body', { title: evTitle }),
          tag: 'event-logistics-' + eventId,
          data: { kind: 'event_logistics', event_id: eventId, role: tgt.role, url: '/?tab=agenda' },
        });
      }
    } catch (_) { /* push best-effort: mai bloccare il salvataggio */ }
  };
  const [attachments, setAttachments] = useState([]);
  // Tendine famiglia chiuse di default (più pulito e meno spazio)
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [onlyForMe, setOnlyForMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [assigneesFlash, setAssigneesFlash] = useState(false);
  const [showAssigneeAlert, setShowAssigneeAlert] = useState(false);

  const scrollableRef = useRef(null);
  const assigneesRef = useRef(null);
  useKeyboardSafeModal(scrollableRef);
  useAndroidBack(true, onClose);

  // Carica gli assegnatari attuali se in modalità modifica
  useEffect(() => {
    if (!editingEvent) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('event_assignees').select('member_id').eq('event_id', editingEvent.id);
      if (!cancelled && data) setAssignees(data.map((a) => a.member_id));
    })();
    return () => { cancelled = true; };
  }, [editingEvent?.id]);

  const familiesArr = Array.isArray(families) ? families : [];
  const byFamily = familiesArr.map((f) => ({
    family: f,
    members: (members || []).filter((m) => m.family_id === f.id),
  })).filter((g) => g.members.length > 0);

  const toggleDay = (idx) => {
    setRecurringDays((prev) => prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a,b) => a-b));
  };

  const toggleAssignee = (id) => {
    setAssignees((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleAllOfFamily = (familyMembers) => {
    const ids = familyMembers.map((m) => m.id);
    const allSelected = ids.every((id) => assignees.includes(id));
    if (allSelected) setAssignees((prev) => prev.filter((x) => !ids.includes(x)));
    else setAssignees((prev) => [...new Set([...prev, ...ids])]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!isImageFile(file.name)) {
        // Documento (PDF, ecc.): niente anteprima immagine
        setAttachments((prev) => [...prev, { file, preview: null, name: file.name }]);
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachments((prev) => [...prev, { file, preview: evt.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };
  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    // Validazione assegnatari: l'utente DEVE scegliere esplicitamente se
    // l'evento è "Solo a me" o per quali membri/famiglie. Senza questa scelta
    // l'evento veniva creato silenziosamente solo per il creatore e poi non
    // era più modificabile dalla schermata Agenda → confusione UX.
    if (!isEdit && !onlyForMe && assignees.length === 0) {
      setShowAssigneeAlert(true);
      // Scroll alla sezione assegnatari + flash visivo
      if (assigneesRef.current && scrollableRef.current) {
        const offsetTop = assigneesRef.current.offsetTop - 8;
        scrollableRef.current.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
      setAssigneesFlash(true);
      window.setTimeout(() => setAssigneesFlash(false), 1800);
      return;
    }

    setBusy(true); setErr('');

    const startsAt = time
      ? new Date(`${date}T${time}:00`).toISOString()
      : new Date(`${date}T09:00:00`).toISOString();

    // Deriva family_id dagli assegnatari (analogo a AddTaskModal)
    let finalFamilyId = familyId;
    if (assignees.length > 0) {
      const assigneeMembers = (members || []).filter((m) => assignees.includes(m.id));
      const distinctFamilies = [...new Set(assigneeMembers.map((m) => m.family_id))];
      if (distinctFamilies.length === 1) finalFamilyId = distinctFamilies[0];
      else if (distinctFamilies.length > 1) {
        const famNames = distinctFamilies
          .map((fid) => familiesArr.find((f) => f.id === fid)?.name || '?')
          .join(', ');
        const firstFamName = familiesArr.find((f) => f.id === distinctFamilies[0])?.name || '?';
        const ok = window.confirm(
          `Stai assegnando questo evento a membri di famiglie diverse (${famNames}).\n\n` +
          `L'evento verra' creato in "${firstFamName}" e visibile solo li'.\n\nContinuare?`
        );
        if (!ok) { setBusy(false); return; }
        finalFamilyId = distinctFamilies[0];
      }
    }

    const payloadCommon = {
      family_id: finalFamilyId,
      title: title.trim(),
      starts_at: startsAt,
      location: location.trim() || null,
      description: description.trim() || null,
      recurring_days: recurringDays.length > 0 ? recurringDays : null,
      recurring_until: recurringDays.length > 0 && recurringUntil ? recurringUntil : null,
      bring_member_id: bringMemberId || null,
      pickup_member_id: pickupMemberId || null,
    };

    if (isEdit) {
      const { error: e1 } = await supabase.from('events')
        .update(payloadCommon).eq('id', editingEvent.id);
      if (e1) { setErr(e1.message); setBusy(false); return; }

      // Replace assegnatari
      await supabase.from('event_assignees').delete().eq('event_id', editingEvent.id);
      if (assignees.length > 0) {
        const rows = assignees.map((memberId) => ({ event_id: editingEvent.id, member_id: memberId }));
        await supabase.from('event_assignees').insert(rows);
      }
      // Aggiungi nuove foto (le esistenti restano)
      if (attachments.length > 0) {
        for (const att of attachments) {
          const timestamp = Date.now();
          const fileName = `${timestamp}-${att.file.name}`;
          const filePath = `events/${editingEvent.id}/${fileName}`;
          const { error: uploadErr } = await supabase.storage
            .from('event-attachments').upload(filePath, att.file);
          if (!uploadErr) {
            try {
              await supabase.from('event_attachments').insert({
                event_id: editingEvent.id, file_path: filePath, file_name: att.file.name,
              });
            } catch (dbErr) { console.warn(dbErr); }
          }
        }
      }
      await notifyLogistics(editingEvent.id, editingEvent.bring_member_id || '', editingEvent.pickup_member_id || '');
      onUpdated && onUpdated();
      return;
    }

    const { data: ev, error } = await supabase.from('events').insert({
      ...payloadCommon,
      created_by: authorMemberId || null,
    }).select().single();

    if (error) { setErr(error.message); setBusy(false); return; }

    // Assegnatari
    if (assignees.length > 0) {
      const rows = assignees.map((memberId) => ({ event_id: ev.id, member_id: memberId }));
      const { error: eAss } = await supabase.from('event_assignees').insert(rows);
      if (eAss) console.warn('event_assignees insert failed:', eAss);
    }

    // Foto
    if (attachments.length > 0) {
      for (const att of attachments) {
        const timestamp = Date.now();
        const fileName = `${timestamp}-${att.file.name}`;
        const filePath = `events/${ev.id}/${fileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('event-attachments').upload(filePath, att.file);
        if (!uploadErr) {
          try {
            await supabase.from('event_attachments').insert({
              event_id: ev.id, file_path: filePath, file_name: att.file.name,
            });
          } catch (dbErr) { console.warn(dbErr); }
        }
      }
    }

    await notifyLogistics(ev.id, '', '');
    onCreated && onCreated();
  };

  const isQuickActive = (offset) => date === dateOffset(offset);
  const weekdays = t('weekday_short');
  const fullWeekdays = t('weekday_full');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Alert assegnatari mancanti — popup bloccante */}
        {showAssigneeAlert && (
          <div onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 300, padding: 16,
            }} data-testid="add-event-assignee-alert">
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white', borderRadius: 16, maxWidth: 360, width: '100%',
                padding: 22, boxShadow: '0 18px 48px rgba(0,0,0,0.3)',
              }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>👥</div>
              <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 17 }}>
                {t('assign_required_h_event') || 'A chi assegni questo evento?'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--km)', marginTop: 0, lineHeight: 1.5 }}>
                {t('assign_required_p_event') ||
                  'Per evitare che un evento finisca nel calendario sbagliato, scegli sempre i destinatari. Puoi assegnarlo a te stesso ("Solo a me") oppure a uno o più membri.'}
              </p>
              <button type="button" onClick={() => setShowAssigneeAlert(false)}
                data-testid="add-event-assignee-alert-ok"
                style={{
                  marginTop: 14, width: '100%',
                  padding: '12px 16px', borderRadius: 12, border: 'none',
                  background: 'var(--ac)', color: 'white',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                {t('assign_required_btn') || 'Capito, seleziono ora'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 12, borderBottom: '1px solid var(--sm)' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18 }} data-testid="add-event-modal-title">{t('addevent_h')}</h2>
            <p className="modal-sub" style={{ margin: '2px 0 0', fontSize: 12 }}>{t('addevent_sub')}</p>
          </div>
        </div>

        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={scrollableRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {/* === TITOLO === */}
            <label htmlFor="ev-title">{t('addtask_title_label')}</label>
            <input id="ev-title" className="input" autoFocus
              data-testid="add-event-title-input"
              placeholder={t('addevent_title_ph')}
              value={title} onChange={(e) => setTitle(e.target.value)} />

            {/* === DATA + ORA === */}
            <div style={{ marginTop: 20 }}>
              <label>{t('addevent_date')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <button type="button" onClick={() => setDate(dateOffset(0))}
                  data-testid="add-event-date-today" style={chipStyle(isQuickActive(0))}>
                  📍 {t('date_today')}
                </button>
                <button type="button" onClick={() => setDate(dateOffset(1))}
                  data-testid="add-event-date-tomorrow" style={chipStyle(isQuickActive(1))}>
                  ☀️ {t('date_tomorrow')}
                </button>
                <button type="button" onClick={() => setDate(dateOffset(7))}
                  data-testid="add-event-date-week" style={chipStyle(isQuickActive(7))}>
                  📅 {t('date_in_a_week')}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="ev-date" type="date" className="input" style={{ flex: 1 }}
                  data-testid="add-event-date-input"
                  value={date} onChange={(e) => setDate(e.target.value)} required />
                <input id="ev-time" type="time" className="input" style={{ flex: 1 }}
                  data-testid="add-event-time-input"
                  value={time} onChange={(e) => setTime(e.target.value)}
                  placeholder={t('addevent_time')} />
              </div>
            </div>

            {/* === LUOGO === */}
            <div style={{ marginTop: 16 }}>
              <label htmlFor="ev-loc">{t('addevent_loc')}</label>
              <input id="ev-loc" className="input"
                data-testid="add-event-location-input"
                placeholder={t('addevent_loc_ph')}
                value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            {/* === ASSEGNATARI === */}
            {byFamily.length > 0 && (
              <div ref={assigneesRef} style={{
                marginTop: 20,
                ...(assigneesFlash ? {
                  outline: '2.5px solid var(--rd)',
                  outlineOffset: 4,
                  borderRadius: 8,
                  background: 'var(--rdB)',
                  padding: 8,
                  transition: 'all 0.25s ease',
                } : {}),
              }}>
                <label>{t('assignee_multi_label')}</label>
                <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 12 }}>
                  {t('assignee_multi_hint')}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <button type="button"
                    data-testid="add-event-only-for-me"
                    onClick={() => {
                      const newOnlyForMe = !onlyForMe;
                      setOnlyForMe(newOnlyForMe);
                      if (newOnlyForMe && authorMemberId) setAssignees([authorMemberId]);
                      else setAssignees([]);
                    }}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 12,
                      border: `1.5px solid ${onlyForMe ? 'var(--ac)' : 'var(--sm)'}`,
                      background: onlyForMe ? 'var(--ab)' : 'white',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      color: onlyForMe ? 'var(--ac)' : 'var(--k)',
                    }}>
                    {onlyForMe ? '✓ ' : '+ '}{t('only_for_me')}
                  </button>
                </div>

                {byFamily.map((g) => {
                  const isExpanded = expandedFamilies[g.family.id] === true;
                  const allSelected = g.members.every((m) => assignees.includes(m.id));
                  const selectedCount = g.members.filter((m) => assignees.includes(m.id)).length;
                  return (
                    <div key={g.family.id} style={{ marginBottom: 8, border: '1px solid var(--sm)', borderRadius: 12, overflow: 'hidden' }}>
                      <button type="button"
                        data-testid={`add-event-family-toggle-${g.family.id}`}
                        onClick={() => setExpandedFamilies((p) => ({ ...p, [g.family.id]: !isExpanded }))}
                        style={{
                          width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                          background: 'white', border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}>
                        <span style={{ fontSize: 18 }}>{g.family.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{g.family.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--km)' }}>
                            {selectedCount > 0 ? t('n_selected', { n: selectedCount, m: g.members.length }) : t('none_selected')}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: 'var(--km)', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
                      </button>
                      <button type="button" onClick={() => toggleAllOfFamily(g.members)}
                        data-testid={`add-event-family-select-all-${g.family.id}`}
                        style={{
                          width: '100%', padding: '8px 12px',
                          border: 'none', borderTop: '1px solid var(--sm)',
                          background: allSelected ? 'var(--ac)' : 'var(--ab)',
                          color: allSelected ? 'white' : 'var(--k)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                        {allSelected ? t('deselect_all') : t('select_all')}
                      </button>
                      {isExpanded && (
                        <div style={{ padding: 10, background: 'var(--ab)', borderTop: '1px solid var(--sm)' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {g.members.map((m) => {
                              const selected = assignees.includes(m.id);
                              return (
                                <button key={m.id} type="button"
                                  data-testid={`add-event-assignee-${m.id}`}
                                  onClick={() => toggleAssignee(m.id)} style={chipMember(selected)}>
                                  {selected && <span>✓ </span>}
                                  <span style={avatarStyle(m)}>
                                    {m.avatar_letter || m.name.charAt(0).toUpperCase()}
                                  </span>
                                  {m.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* === LOGISTICA (chi porta / chi riprende) === */}
            <div style={{ marginTop: 20, padding: 14, background: 'var(--ab)', borderRadius: 14, border: '1px solid var(--sm)' }}>
              <label style={{ marginBottom: 4 }}>🚗 {t('event_logi_label')}</label>
              <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 8 }}>{t('event_logi_hint')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--km)', marginBottom: 4 }}>{t('event_logi_bring')}</div>
                  <select data-testid="add-event-bring"
                    value={bringMemberId} onChange={(e) => setBringMemberId(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--sm)', background: 'white',
                      color: 'var(--k)', fontSize: 14,
                    }}>
                    <option value="">{t('event_logi_none')}</option>
                    {logiMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--km)', marginBottom: 4 }}>{t('event_logi_pickup')}</div>
                  <select data-testid="add-event-pickup"
                    value={pickupMemberId} onChange={(e) => setPickupMemberId(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--sm)', background: 'white',
                      color: 'var(--k)', fontSize: 14,
                    }}>
                    <option value="">{t('event_logi_none')}</option>
                    {logiMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* === RICORRENZA === */}
            <div style={{ marginTop: 20, padding: 14, background: 'var(--ab)', borderRadius: 14, border: '1px solid var(--sm)' }}>
              <label style={{ marginBottom: 4 }}>{t('repeat_label')}</label>
              <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 8 }}>{t('repeat_hint')}</div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                {Array.isArray(weekdays) && weekdays.map((w, idx) => {
                  const selected = recurringDays.includes(idx);
                  return (
                    <button key={idx} type="button" onClick={() => toggleDay(idx)}
                      title={Array.isArray(fullWeekdays) ? fullWeekdays[idx] : ''}
                      style={{
                        width: 36, height: 36, borderRadius: 50, border: '1.5px solid',
                        borderColor: selected ? 'var(--k)' : 'var(--sm)',
                        background: selected ? 'var(--k)' : 'white',
                        color: selected ? 'white' : 'var(--k)',
                        fontSize: 12, fontWeight: 700,
                      }}>{w}</button>
                  );
                })}
              </div>
              {recurringDays.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label htmlFor="ev-until" style={{ fontSize: 11, color: 'var(--km)' }}>{t('repeat_until')} ({t('addtask_when').toLowerCase()})</label>
                  <input id="ev-until" type="date" className="input" style={{ marginTop: 4 }}
                    value={recurringUntil} onChange={(e) => setRecurringUntil(e.target.value)} />
                </div>
              )}
            </div>

            {/* === NOTE === */}
            <div style={{ marginTop: 16 }}>
              <label htmlFor="ev-desc">{t('addevent_desc')}</label>
              <textarea id="ev-desc" className="input" rows={2}
                data-testid="add-event-desc-input"
                placeholder={t('addevent_desc_ph')}
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* === FOTO === */}
            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span>📸 {t('attach_photo')} <span style={{ color: 'var(--km)', fontSize: 11 }}>({t('optional_label')})</span></span>
              </label>
              <input type="file" id="ev-file-input" multiple
                accept={isIOS() ? `image/*,${DOC_ACCEPT}` : 'image/*'}
                data-testid="add-event-file-input"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              <input type="file" id="ev-file-input-doc" multiple accept={DOC_ACCEPT}
                data-testid="add-event-file-input-doc"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              <input type="file" id="ev-file-input-camera" multiple accept="image/*" capture="environment"
                data-testid="add-event-file-input-camera"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              {isIOS() ? (
                <button type="button" onClick={() => document.getElementById('ev-file-input').click()}
                  data-testid="add-event-attach-photo-btn"
                  style={{
                    width: '100%', padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                    background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--ac)',
                  }}>
                  {t('take_or_attach_photo')}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => document.getElementById('ev-file-input-camera').click()}
                    data-testid="add-event-camera-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)',
                    }}>
                    📷 {t('take_photo') || 'Foto'}
                  </button>
                  <button type="button" onClick={() => document.getElementById('ev-file-input').click()}
                    data-testid="add-event-attach-photo-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)',
                    }}>
                    🖼️ {t('from_gallery') || 'Galleria'}
                  </button>
                  <button type="button" onClick={() => document.getElementById('ev-file-input-doc').click()}
                    data-testid="add-event-attach-file-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)',
                    }}>
                    📎 File
                  </button>
                </div>
              )}
              {attachments.length > 0 && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
                  {attachments.map((att, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sm)' }}>
                      {att.preview ? (
                        <img src={att.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '1' }} alt="" />
                      ) : (
                        <div style={{
                          width: '100%', aspectRatio: '1', background: 'var(--ab)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: 3, padding: 4, boxSizing: 'border-box',
                        }}>
                          <span style={{ fontSize: 18 }}>📄</span>
                          <span style={{
                            fontSize: 8, fontWeight: 600, color: 'var(--km)',
                            wordBreak: 'break-all', textAlign: 'center',
                            maxHeight: 22, overflow: 'hidden',
                          }}>{att.name}</span>
                        </div>
                      )}
                      <button type="button" onClick={() => removeAttachment(idx)}
                        style={{
                          position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                          borderRadius: '50%', background: 'var(--rd)', color: 'white',
                          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}
          </div>

          <div className="row" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--sm)' }}>
            <button type="button" className="btn secondary" onClick={onClose} data-testid="add-event-cancel-btn">{t('cancel')}</button>
            <button type="submit" className="btn" disabled={busy || !title.trim() || !date} data-testid="add-event-submit-btn">
              {busy ? <span className="spin" /> : (isEdit ? t('save_changes') : t('add'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function chipStyle(active) {
  return {
    padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
    borderColor: active ? 'var(--k)' : 'var(--sm)',
    background: active ? 'var(--sm)' : 'white',
    fontSize: 12, fontWeight: 600,
  };
}

function chipMember(selected) {
  return {
    padding: '6px 10px', borderRadius: 100, border: '1.5px solid',
    borderColor: selected ? 'var(--k)' : 'var(--sm)',
    background: selected ? 'var(--k)' : 'white',
    color: selected ? 'white' : 'var(--k)',
    fontSize: 12, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };
}

function avatarStyle(m) {
  return {
    width: 18, height: 18, borderRadius: 6,
    background: m.avatar_color || '#1C1611', color: 'white',
    fontSize: 10, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}
