import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import AISmartTaskHint from './AISmartTaskHint.jsx';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * AddTaskModal supporta DUE modi:
 *  - Creazione (default): editingTask = null/undefined
 *  - Modifica: editingTask = task object → pre-popola tutti i campi e fa UPDATE
 */
export default function AddTaskModal({
  familyId, families = [], members,
  authorMemberId,
  editingTask = null,           // se valorizzato, modifica invece di creare
  onClose, onCreated, onUpdated,
}) {
  const { t } = useT();
  const isEdit = !!editingTask;

  const CATEGORIES = [
    { id: 'care',   emoji: '❤️', label: t('cat_care') },
    { id: 'home',   emoji: '🏠', label: t('cat_home') },
    { id: 'health', emoji: '💊', label: t('cat_health') },
    { id: 'admin',  emoji: '📋', label: t('cat_admin') },
    { id: 'spese',  emoji: '💶', label: t('cat_spese') },
    { id: 'other',  emoji: '📌', label: t('cat_other') },
  ];

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState(editingTask?.title || '');
  const [note, setNote] = useState(editingTask?.note || '');
  const [category, setCategory] = useState(editingTask?.category || 'care');
  const [dueDate, setDueDate] = useState(editingTask?.due_date || '');
  const [assignees, setAssignees] = useState([]);
  const [recurringDays, setRecurringDays] = useState(editingTask?.recurring_days || []);
  const [recurringUntil, setRecurringUntil] = useState(editingTask?.recurring_until || '');
  const [taskFamily, setTaskFamily] = useState(editingTask?.family_id || familyId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [expandRecurring, setExpandRecurring] = useState(!!(editingTask?.recurring_days && editingTask.recurring_days.length > 0));
  const [onlyForMe, setOnlyForMe] = useState(false);
  const [recurrenceScope, setRecurrenceScope] = useState(editingTask?.recurring_until ? 'thisMonth' : 'forever');

  // Carica gli assegnatari attuali in modo edit
  useEffect(() => {
    if (!editingTask) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('task_assignees')
        .select('member_id')
        .eq('task_id', editingTask.id);
      if (!cancelled && data) {
        setAssignees(data.map((a) => a.member_id));
      }
    })();
    return () => { cancelled = true; };
  }, [editingTask?.id]);

  const byFamily = families.map((f) => ({
    family: f,
    members: members.filter((m) => m.family_id === f.id),
  })).filter((g) => g.members.length > 0);

  const toggleAssignee = (id) => {
    setAssignees((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleAllOfFamily = (familyMembers) => {
    const ids = familyMembers.map((m) => m.id);
    const allSelected = ids.every((id) => assignees.includes(id));
    if (allSelected) {
      setAssignees((prev) => prev.filter((x) => !ids.includes(x)));
    } else {
      setAssignees((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const toggleDay = (idx) => {
    setRecurringDays((prev) => prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a,b) => a-b));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachments((prev) => [...prev, { file, preview: evt.target.result, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    let computedUntil = null;
    if (recurringDays.length > 0) {
      if (recurringUntil) {
        computedUntil = recurringUntil;
      } else if (recurrenceScope === 'thisMonth') {
        const base = dueDate ? new Date(dueDate + 'T00:00:00') : new Date();
        const lastOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
        computedUntil = lastOfMonth.toISOString().slice(0, 10);
      } else if (recurrenceScope === 'forever') {
        const ok = window.confirm(
          'Sei sicuro di voler ripetere questo incarico per TUTTI i mesi futuri?\n\nVerrà mostrato fino a 6 mesi avanti. Puoi sempre cancellarlo dopo.'
        );
        if (!ok) return;
        computedUntil = null;
      }
    }

    setBusy(true); setErr('');

    // === FIX BUG: deriva family_id dagli assegnatari ===
    // In vista "Tutte", taskFamily inizia con families[0].id (il primo).
    // Se l'utente seleziona membri di un'altra famiglia, il task DEVE finire
    // nella famiglia di quei membri, non nella prima.
    //   - 0 assegnatari -> usa taskFamily (default current view o families[0])
    //   - tutti gli assegnatari di UNA stessa famiglia -> usa quella famiglia
    //   - assegnatari di piu' famiglie -> chiedi conferma, poi usa la prima
    let finalFamilyId = taskFamily;
    if (assignees.length > 0) {
      const assigneeMembers = members.filter((m) => assignees.includes(m.id));
      const distinctFamilies = [...new Set(assigneeMembers.map((m) => m.family_id))];
      if (distinctFamilies.length === 1) {
        finalFamilyId = distinctFamilies[0];
      } else if (distinctFamilies.length > 1) {
        const famNames = distinctFamilies
          .map((fid) => families.find((f) => f.id === fid)?.name || '?')
          .join(', ');
        const firstFamName = families.find((f) => f.id === distinctFamilies[0])?.name || '?';
        const ok = window.confirm(
          `Stai assegnando questo incarico a membri di famiglie diverse (${famNames}).\n\n` +
          `L'incarico verra' creato in "${firstFamName}" e visibile solo li'.\n\n` +
          `Continuare?`
        );
        if (!ok) { setBusy(false); return; }
        finalFamilyId = distinctFamilies[0];
      }
    }

    if (isEdit) {
      // === MODIFICA ===
      const { error: e1 } = await supabase.from('tasks').update({
        family_id: finalFamilyId,
        title: title.trim(),
        note: note.trim() || null,
        category,
        due_date: dueDate || null,
        recurring_days: recurringDays.length > 0 ? recurringDays : null,
        recurring_until: recurringDays.length > 0 ? computedUntil : null,
      }).eq('id', editingTask.id);

      if (e1) { setErr(e1.message); setBusy(false); return; }

      // Sostituisci gli assegnatari: cancella tutti e ricrea
      await supabase.from('task_assignees').delete().eq('task_id', editingTask.id);
      if (assignees.length > 0) {
        const rows = assignees.map((memberId) => ({ task_id: editingTask.id, member_id: memberId }));
        await supabase.from('task_assignees').insert(rows);
      }

      // Aggiungi i nuovi allegati (i vecchi non si toccano)
      if (attachments.length > 0) {
        for (const att of attachments) {
          const timestamp = Date.now();
          const fileName = `${timestamp}-${att.file.name}`;
          const filePath = `tasks/${editingTask.id}/${fileName}`;
          const { error: uploadErr } = await supabase.storage
            .from('task-attachments').upload(filePath, att.file);
          if (!uploadErr) {
            try {
              await supabase.from('task_attachments').insert({
                task_id: editingTask.id, file_path: filePath, file_name: att.file.name,
              });
            } catch (dbErr) { console.warn(dbErr); }
          }
        }
      }

      onUpdated && onUpdated();
      return;
    }

    // === CREAZIONE ===
    // Se l'unico assegnatario sono io stesso (autore), parto già in 'taken' così
    // appare immediatamente in "Solo le mie da fare" senza dover cliccare "Me ne occupo io".
    // In tutti gli altri casi (più assegnatari, o nessun assegnatario, o assegnatario diverso)
    // status parte 'todo' e ognuno può claimarlo.
    const initialStatus = (assignees.length === 1 && authorMemberId && assignees[0] === authorMemberId)
      ? 'taken'
      : 'todo';

    const { data: task, error: e1 } = await supabase.from('tasks').insert({
      family_id: finalFamilyId,
      title: title.trim(),
      note: note.trim() || null,
      category,
      status: initialStatus,
      visibility: 'all',
      due_date: dueDate || null,
      author_id: authorMemberId || null,
      assigned_to: assignees[0] || null,
      recurring_days: recurringDays.length > 0 ? recurringDays : null,
      recurring_until: recurringDays.length > 0 ? computedUntil : null,
    }).select().single();

    if (e1) { setErr(e1.message); setBusy(false); return; }

    if (assignees.length > 0) {
      const rows = assignees.map((memberId) => ({ task_id: task.id, member_id: memberId }));
      await supabase.from('task_assignees').insert(rows);
    }

    if (attachments.length > 0) {
      for (const att of attachments) {
        const timestamp = Date.now();
        const fileName = `${timestamp}-${att.file.name}`;
        const filePath = `tasks/${task.id}/${fileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('task-attachments').upload(filePath, att.file);
        if (!uploadErr) {
          try {
            await supabase.from('task_attachments').insert({
              task_id: task.id, file_path: filePath, file_name: att.file.name,
            });
          } catch (dbErr) { console.warn(dbErr); }
        }
      }
    }

    onCreated && onCreated();
  };

  const isQuickActive = (offset) => dueDate === dateOffset(offset);
  const weekdays = t('weekday_short');
  const fullWeekdays = t('weekday_full');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--sm)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>
            {isEdit ? 'Modifica incarico' : t('addtask_h')}
          </h2>
          <span style={{ fontSize: 12, color: 'var(--km)', fontWeight: 600 }}>{step}/3</span>
        </div>

        <form onSubmit={step === 3 ? submit : (e) => { e.preventDefault(); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {step === 1 && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                <label htmlFor="title">{t('addtask_title_label')}</label>
                <input id="title" className="input" autoFocus
                  placeholder={t(`addtask_title_ph_${category}`)}
                  value={title} onChange={(e) => setTitle(e.target.value)} />

                {!isEdit && (
                  <AISmartTaskHint
                    title={title}
                    currentCategory={category}
                    onApply={({ category: c, dueDate: d }) => {
                      if (c) setCategory(c);
                      if (d) setDueDate(d);
                    }}
                  />
                )}

                <div style={{ marginTop: 20 }}>
                  <label>{t('addtask_cat_label')}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CATEGORIES.map((c) => (
                      <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                        style={chipStyle(category === c.id)}>
                        {c.emoji} {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <label>{t('addtask_when')}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    <button type="button" onClick={() => setDueDate(dateOffset(0))}
                      style={chipStyle(isQuickActive(0))}>📍 {t('date_today')}</button>
                    <button type="button" onClick={() => setDueDate(dateOffset(1))}
                      style={chipStyle(isQuickActive(1))}>☀️ {t('date_tomorrow')}</button>
                    <button type="button" onClick={() => setDueDate(dateOffset(7))}
                      style={chipStyle(isQuickActive(7))}>📅 {t('date_in_a_week')}</button>
                  </div>
                  <DateField value={dueDate} onChange={setDueDate} />
                </div>
              </div>

              <div className="row" style={{ marginTop: 20 }}>
                <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
                <button type="button" className="btn" onClick={() => setStep(2)} disabled={!title.trim()}>
                  {t('next_arrow')}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
                <label style={{ marginTop: 0 }}>{t('assignee_multi_label')}</label>
                <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 12 }}>
                  {t('assignee_multi_hint')}
                </div>

                {/* Solo per me */}
                <div style={{ marginBottom: 12 }}>
                  <button type="button"
                    onClick={() => {
                      const newOnlyForMe = !onlyForMe;
                      setOnlyForMe(newOnlyForMe);
                      if (newOnlyForMe && authorMemberId) {
                        setAssignees([authorMemberId]);
                      } else {
                        setAssignees([]);
                      }
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
                  const isExpanded = expandedFamilies[g.family.id] !== false;
                  const allSelected = g.members.length > 0 && g.members.every((m) => assignees.includes(m.id));
                  const selectedCount = g.members.filter((m) => assignees.includes(m.id)).length;
                  return (
                    <div key={g.family.id} style={{ marginBottom: 8, border: '1px solid var(--sm)', borderRadius: 12, overflow: 'hidden' }}>
                      <button type="button"
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
                        style={{
                          width: '100%', padding: '8px 12px', borderRadius: 0,
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
                                <button key={m.id} type="button" onClick={() => toggleAssignee(m.id)}
                                  style={chipMember(selected)}>
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

              <div className="row" style={{ marginTop: 20 }}>
                <button type="button" className="btn secondary" onClick={() => setStep(1)}>{t('back_arrow')}</button>
                <button type="button" className="btn" onClick={() => setStep(3)}>{t('next_arrow')}</button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                {dueDate && (
                  <div style={{ marginBottom: 12, padding: 10, background: 'var(--ab)', borderRadius: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase' }}>📅 Data</div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
                      {new Date(dueDate + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                )}

                <label htmlFor="note">{t('note_optional')}</label>
                <textarea id="note" className="input" rows={3}
                  placeholder={t('note_placeholder')}
                  value={note} onChange={(e) => setNote(e.target.value)} />

                <div style={{ marginTop: 16 }}>
                  <button type="button" onClick={() => setExpandRecurring((v) => !v)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 12,
                      border: '1.5px solid var(--sm)', background: 'white',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                    <span>
                      {recurringDays.length > 0 ? `🔄 Ricorre ${recurringDays.length}x` : t('add_recurrence')}
                    </span>
                    <span style={{ fontSize: 18, color: 'var(--km)', transform: expandRecurring ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
                  </button>

                  {expandRecurring && (
                    <div style={{ marginTop: 12, padding: 14, background: 'var(--ab)', borderRadius: 14, border: '1px solid var(--sm)' }}>
                      <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 12 }}>
                        {t('repeat_hint')}
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--km)', marginBottom: 6, fontWeight: 600 }}>Giorni della settimana</div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
                          {Array.isArray(weekdays) && weekdays.map((w, idx) => {
                            const selected = recurringDays.includes(idx);
                            return (
                              <button key={idx} type="button" onClick={() => toggleDay(idx)}
                                title={Array.isArray(fullWeekdays) ? fullWeekdays[idx] : ''}
                                style={{
                                  flex: 1, height: 32, borderRadius: 6, border: '1.5px solid',
                                  borderColor: selected ? 'var(--k)' : 'var(--sm)',
                                  background: selected ? 'var(--k)' : 'white',
                                  color: selected ? 'white' : 'var(--k)',
                                  fontSize: 11, fontWeight: 700,
                                }}>{w}</button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 10, color: 'var(--km)', marginBottom: 6, fontWeight: 600 }}>
                          Oppure seleziona specifici giorni del mese
                        </div>
                        <MonthCalendarPicker
                          anchorDay={dueDate ? new Date(dueDate + 'T00:00:00').getDate() : null}
                          selectedDays={recurringDays.filter((d) => d > 6)}
                          onToggleDay={(day) => {
                            setRecurringDays((prev) =>
                              prev.includes(day)
                                ? prev.filter((x) => x !== day)
                                : [...prev, day].sort((a,b) => a-b)
                            );
                          }}
                        />
                      </div>

                      {recurringDays.length > 0 && (
                        <div style={{ marginTop: 16, padding: 12, background: 'white', border: '1.5px solid var(--sm)', borderRadius: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', marginBottom: 8, textTransform: 'uppercase' }}>
                            🔄 Per quanto tempo si ripete?
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                              border: `1.5px solid ${recurrenceScope === 'thisMonth' ? 'var(--ac)' : 'var(--sm)'}`,
                              borderRadius: 8, cursor: 'pointer',
                              background: recurrenceScope === 'thisMonth' ? 'var(--ab)' : 'white',
                            }}>
                              <input type="radio" name="rscope" value="thisMonth"
                                checked={recurrenceScope === 'thisMonth'}
                                onChange={() => setRecurrenceScope('thisMonth')} />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>
                                📅 Solo questo mese
                              </span>
                            </label>
                            <label style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                              border: `1.5px solid ${recurrenceScope === 'forever' ? 'var(--ac)' : 'var(--sm)'}`,
                              borderRadius: 8, cursor: 'pointer',
                              background: recurrenceScope === 'forever' ? 'var(--ab)' : 'white',
                            }}>
                              <input type="radio" name="rscope" value="forever"
                                checked={recurrenceScope === 'forever'}
                                onChange={() => setRecurrenceScope('forever')} />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>
                                🔄 Tutti i mesi futuri
                                <span style={{ fontSize: 11, color: 'var(--km)', fontWeight: 500, marginLeft: 6 }}>
                                  (ti chiederemo conferma)
                                </span>
                              </span>
                            </label>
                            <details style={{ marginTop: 4 }}>
                              <summary style={{ fontSize: 12, color: 'var(--km)', cursor: 'pointer', padding: '4px 8px' }}>
                                … oppure imposta una data finale specifica
                              </summary>
                              <div style={{ marginTop: 8 }}>
                                <input id="until" type="date" className="input"
                                  value={recurringUntil} onChange={(e) => setRecurringUntil(e.target.value)} />
                                <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
                                  Se imposti questa data, sostituisce la scelta sopra.
                                </p>
                              </div>
                            </details>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span>📸 {t('attach_photo')} <span style={{ color: 'var(--km)', fontSize: 11 }}>({t('optional_label')})</span></span>
                  </label>
                  <input type="file" id="file-input" multiple accept="image/*" capture
                    onChange={handleFileSelect} style={{ display: 'none' }} />
                  <button type="button" onClick={() => document.getElementById('file-input').click()}
                    style={{
                      width: '100%', padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)', transition: 'all 0.2s ease',
                    }}>
                    {t('take_or_attach_photo')}
                  </button>
                  {attachments.length > 0 && (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
                      {attachments.map((att, idx) => (
                        <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sm)' }}>
                          <img src={att.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '1' }} alt="" />
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

              <div className="row" style={{ marginTop: 20 }}>
                <button type="button" className="btn secondary" onClick={() => setStep(2)}>{t('back_arrow')}</button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? <span className="spin" /> : (isEdit ? 'Salva modifiche' : t('add'))}
                </button>
              </div>
            </>
          )}
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

function MonthCalendarPicker({ selectedDays, onToggleDay, anchorDay = null }) {
  const now = new Date();
  const today = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];
  for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  return (
    <div>
      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--sm)', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)' }}>
          📍 Oggi: {today} {new Date(year, month, today).toLocaleDateString('it-IT', { weekday: 'short' })}
          {anchorDay && (
            <span style={{ marginLeft: 8, color: '#F39C12' }}>
              · 🔶 Data scelta: {anchorDay}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 6 }}>
        {weekdayLabels.map((label) => (
          <div key={label} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {days.map((day, idx) => {
          const isPast = day && day < today;
          const isToday = day === today;
          const isAnchor = anchorDay && day === anchorDay;
          const dayValue = day + 6;
          const isSelected = selectedDays.includes(dayValue);

          let bg = 'white', border = 'var(--sm)', color = 'var(--k)';
          if (isSelected) { bg = 'var(--k)'; border = 'var(--k)'; color = 'white'; }
          else if (isAnchor) { bg = '#F39C1233'; border = '#F39C12'; color = '#B36E00'; }
          else if (isToday) { bg = 'var(--rd)22'; border = 'var(--rd)'; color = 'var(--rd)'; }

          return day ? (
            <button key={idx} type="button"
              onClick={() => !isPast && onToggleDay(dayValue)}
              disabled={isPast}
              title={isAnchor ? 'Data del task — clicca per ripeterlo ogni mese in questo giorno' : undefined}
              style={{
                aspectRatio: '1', borderRadius: 4,
                border: `1.5px solid ${border}`, background: bg, color,
                fontSize: 11, fontWeight: (isToday || isAnchor) ? 700 : 600,
                cursor: isPast ? 'not-allowed' : 'pointer',
                padding: 0, opacity: isPast ? 0.4 : 1, position: 'relative',
              }}>
              {day}
              {isAnchor && !isSelected && (
                <span style={{
                  position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: '#F39C12',
                }} />
              )}
            </button>
          ) : <div key={idx} />;
        })}
      </div>
    </div>
  );
}

function DateField({ value, onChange }) {
  const { t } = useT();
  const ref = useRef(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch (e) {}
    }
    el.focus(); el.click();
  };
  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={open}
        style={{
          width: '100%', padding: '14px 16px',
          border: value ? '1.5px solid var(--ac)' : '1.5px solid var(--sm)',
          borderRadius: 12,
          background: value ? 'var(--ab)' : 'white',
          color: value ? 'var(--ac)' : 'var(--km)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
        <span style={{ fontSize: 18 }}>📅</span>
        <span style={{ flex: 1, textTransform: value ? 'capitalize' : 'none' }}>
          {display || t('tap_choose_date')}
        </span>
        {value && (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange(''); }}
            style={{
              padding: '2px 8px', borderRadius: 100,
              background: 'white', border: '1px solid var(--sm)',
              color: 'var(--km)', fontSize: 12, fontWeight: 600,
            }} title="Rimuovi data">✕</span>
        )}
      </button>
      <input ref={ref} type="date" value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        tabIndex={-1} />
    </div>
  );
}
