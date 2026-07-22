import { useEffect, useRef, useState } from 'react';
import { toLocalYMD } from '../lib/dateUtils.js';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useKeyboardSafeModal } from '../lib/useKeyboardSafeModal.jsx';
import { useAndroidBack } from '../lib/useAndroidBack.js';
import { isIOS } from '../lib/platformDetect.js';
import { isImageFile, DOC_ACCEPT } from '../lib/fileKind.js';
import { findAbsenceOverlap, absenceLabel, fmtAbsenceRange } from '../lib/useAbsences.js';
import { markSelfAssignment } from '../lib/assignMarker.js';
import AISmartTaskHint from './AISmartTaskHint.jsx';
import NativeDateInput from './NativeDateInput.jsx';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * AddTaskModal — single-page (no wizard).
 * Sections: Titolo+AI / Categoria / Quando+Ora / Luogo / Assegnatari /
 *           Ricorrenza / Nota / Foto.
 *
 * Modi:
 *  - Creazione (default): editingTask = null/undefined
 *  - Modifica: editingTask = task object → pre-popola tutti i campi e fa UPDATE
 */
export default function AddTaskModal({
  familyId, families = [], members,
  authorMemberId,
  absences = [],
  editingTask = null,
  // Prefill iniziale (usato es. dalle azioni dell'AI assistant)
  initialTitle = '', initialCategory = null, initialDueDate = '',
  initialChecklistOpen = false,
  shoppingMode = false,
  initialDueTime = '', initialLocation = '',
  // Prefill assegnatari + visibilità (es. "nuovo incarico per chi si è unito")
  initialAssignees = [], initialRestrictVisibility = false,
  onClose, onCreated, onUpdated,
}) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const isEdit = !!editingTask;

  const CATEGORIES = [
    { id: 'care',   emoji: '❤️', label: t('cat_care') },
    { id: 'home',   emoji: '🏠', label: t('cat_home') },
    { id: 'health', emoji: '💊', label: t('cat_health') },
    { id: 'admin',  emoji: '📋', label: t('cat_admin') },
    { id: 'spese',  emoji: '💶', label: t('cat_spese') },
    { id: 'other',  emoji: '📌', label: t('cat_other') },
  ];

  const [title, setTitle] = useState(editingTask?.title || initialTitle || '');
  const [note, setNote] = useState(editingTask?.note || '');
  const [category, setCategory] = useState(editingTask?.category || initialCategory || 'care');
  // Priority: 'normal' (default verde), 'medium' (arancio), 'high' (rosso urgente)
  const [priority, setPriority] = useState(
    editingTask?.urgent ? 'high' : (editingTask?.priority || 'normal')
  );
  const [dueDate, setDueDate] = useState(editingTask?.due_date || initialDueDate || '');
  const [dueTime, setDueTime] = useState(editingTask?.due_time || initialDueTime || '');
  // Anticipo del promemoria in minuti (0 = all'orario di scadenza)
  const [remindLead, setRemindLead] = useState(Number(editingTask?.remind_lead_min) || 0);
  // Checklist iniziale (solo in creazione): voci salvate in task_subtasks
  // insieme al task. Aperta di default per "Fare la spesa".
  const [checkOpen, setCheckOpen] = useState(initialChecklistOpen);
  const [checkItems, setCheckItems] = useState([]);
  const [checkInput, setCheckInput] = useState('');
  // Spesa: apri il foglio di condivisione nativo dopo il salvataggio
  const [shareAfterSave, setShareAfterSave] = useState(false);
  const addCheckItems = () => {
    const parts = checkInput.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setCheckItems((prev) => [...prev, ...parts].slice(0, 50));
    setCheckInput('');
  };
  const [location, setLocation] = useState(editingTask?.location || initialLocation || '');
  const [assignees, setAssignees] = useState(
    shoppingMode && authorMemberId
      ? [authorMemberId]
      : (!editingTask && initialAssignees?.length ? initialAssignees : [])
  );
  const [recurringDays, setRecurringDays] = useState(editingTask?.recurring_days || []);
  // Rotazione turni: gli assegnatari si alternano a ogni completamento
  const [rotationEnabled, setRotationEnabled] = useState(!!(editingTask?.rotation_member_ids?.length));
  const [recurringUntil, setRecurringUntil] = useState(editingTask?.recurring_until || '');
  const [taskFamily, setTaskFamily] = useState(editingTask?.family_id || familyId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [expandedFamilies, setExpandedFamilies] = useState(() => {
    // In editing mode (modifica): tutte le tendine CHIUSE di default
    // (l'utente vuole spazio per modificare, non scegliere assegnatari).
    // In creazione: aperte (l'utente sta scegliendo a chi assegnare).
    if (editingTask) return {};
    return null; // null = auto-aperto (logica esistente: `!== false`)
  });
  const [expandRecurring, setExpandRecurring] = useState(!!(editingTask?.recurring_days && editingTask.recurring_days.length > 0));
  // In modalità spesa parte già su "Solo per me": un tocco in meno
  const [onlyForMe, setOnlyForMe] = useState(!!shoppingMode);
  // In modalità "Solo per me" la lista famiglie è nascosta (promemoria
  // personale). Questo flag la rivela se l'utente vuole condividere.
  const [showFamiliesWhilePersonal, setShowFamiliesWhilePersonal] = useState(false);
  const [recurrenceScope, setRecurrenceScope] = useState(editingTask?.recurring_until ? 'thisMonth' : 'forever');

  const scrollableRef = useRef(null);
  const titleInputRef = useRef(null);
  const assigneesRef = useRef(null);
  const [titleFlash, setTitleFlash] = useState(false);
  const [assigneesFlash, setAssigneesFlash] = useState(false);
  const [showAssigneeAlert, setShowAssigneeAlert] = useState(false);
  useKeyboardSafeModal(scrollableRef);
  useAndroidBack(true, onClose);

  // === Visibilità ristretta ('assignees') ===
  // true → il task è visibile solo a: autore, assegnatari, membri extra
  // scelti (extraViewers → task_couple_members). RLS lato DB + questa UI.
  const [restrictVisibility, setRestrictVisibility] = useState(
    editingTask?.visibility === 'assignees' || editingTask?.visibility === 'couple'
    || (!editingTask && initialRestrictVisibility === true)
  );
  const [extraViewers, setExtraViewers] = useState([]);
  const toggleExtraViewer = (id) => setExtraViewers((p) =>
    p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  // L'utente ha scelto manualmente la visibilità? Se sì, l'automatismo
  // qui sotto smette di sovrascriverla (rispetta la scelta esplicita).
  const [visibilityTouched, setVisibilityTouched] = useState(false);

  // Carica gli assegnatari attuali (e i membri extra) in modo edit
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
      try {
        const { data: extra } = await supabase
          .from('task_couple_members')
          .select('member_id')
          .eq('task_id', editingTask.id);
        if (!cancelled && extra) {
          setExtraViewers(extra.map((a) => a.member_id));
        }
      } catch (_) { /* tabella legacy assente: ignora */ }
    })();
    return () => { cancelled = true; };
  }, [editingTask?.id]);

  const byFamily = families.map((f) => ({
    family: f,
    // I membri "solo contatto" (compleanni) non sono assegnabili.
    members: members.filter((m) => m.family_id === f.id && !m.is_contact_only),
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

  // Auto-imposta "Chi può vederlo" in base agli assegnatari selezionati.
  // Solo per nuovi incarichi e finché l'utente non sceglie manualmente:
  //   - sottoinsieme di membri → "Solo coinvolti" (restrictVisibility = true)
  //   - tutti i membri         → "Tutta la famiglia" (restrictVisibility = false)
  useEffect(() => {
    if (isEdit || visibilityTouched) return;
    if (assignees.length === 0) return;
    const allAssignableIds = byFamily.flatMap((g) => g.members.map((m) => m.id));
    if (allAssignableIds.length === 0) return;
    const everyoneSelected = allAssignableIds.every((id) => assignees.includes(id));
    setRestrictVisibility(!everyoneSelected);
  }, [assignees, isEdit, visibilityTouched]);

  const toggleDay = (idx) => {
    setRecurringDays((prev) => prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a,b) => a-b));
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

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      // Feedback chiaro: scroll in cima + focus + flash visivo + messaggio.
      // L'utente potrebbe avere il campo Titolo scrollato fuori vista perché
      // tutti gli altri input (categoria, data, ora, luogo, assegnatari) lo
      // hanno spinto sotto. Senza questo, il pulsante "Aggiungi" sembra
      // "rotto".
      setErr(t('addtask_title_required') || '💡 Inserisci un titolo per continuare');
      if (scrollableRef.current) {
        scrollableRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setTitleFlash(true);
      window.setTimeout(() => {
        try { titleInputRef.current?.focus(); } catch (_) {}
      }, 250);
      window.setTimeout(() => setTitleFlash(false), 1500);
      return;
    }

    // Validazione assegnatari (solo in creazione): l'utente DEVE scegliere
    // esplicitamente "Solo a me" oppure almeno un membro. Altrimenti
    // l'incarico viene creato senza assegnatari → confusione UX
    // (nessuno lo riceve, nessuno si sente responsabile).
    if (!isEdit && !onlyForMe && assignees.length === 0) {
      setShowAssigneeAlert(true);
      // Scroll alla sezione assegnatari + flash
      if (assigneesRef.current && scrollableRef.current) {
        const offsetTop = assigneesRef.current.offsetTop - 8;
        scrollableRef.current.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
      setAssigneesFlash(true);
      window.setTimeout(() => setAssigneesFlash(false), 1800);
      return;
    }

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

    // Check assenze: se almeno un assegnatario sarà via nel periodo della
    // task, chiediamo conferma prima di salvare.
    if (assignees.length > 0 && absences && absences.length > 0) {
      const checkDate = dueDate || toLocalYMD();
      const busyMembers = [];
      for (const aId of assignees) {
        const m = members.find((mm) => mm.id === aId);
        if (!m?.user_id) continue;
        const overlap = findAbsenceOverlap(absences, m.user_id, checkDate, checkDate);
        if (overlap) busyMembers.push({ name: m.name, abs: overlap });
      }
      if (busyMembers.length > 0) {
        const lines = busyMembers
          .map((b) => `• ${b.name}: ${absenceLabel(b.abs)} ${fmtAbsenceRange(b.abs)}`)
          .join('\n');
        const ok = window.confirm(
          (t('addtask_absent_confirm_h') || '⚠️ Alcuni assegnatari saranno via:') + '\n\n' + lines + '\n\n' +
          (t('addtask_absent_confirm_q') || 'Vuoi assegnare comunque?')
        );
        if (!ok) { setBusy(false); return; }
      }
    }

    // Deriva family_id dagli assegnatari
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

    // L'autore deve essere il MIO membro della famiglia FINALE del task:
    // con più famiglie selezionabili, authorMemberId può appartenere a
    // un'altra famiglia e i filtri "escludi autore" delle notifiche
    // (trigger + coda) non riconoscerebbero il creatore.
    const authorUserId = members.find((m) => m.id === authorMemberId)?.user_id || null;
    let finalAuthorId = authorMemberId || null;
    if (finalAuthorId) {
      const authorMember = members.find((m) => m.id === finalAuthorId);
      if (authorMember && authorMember.family_id !== finalFamilyId) {
        finalAuthorId = members.find((m) =>
          m.family_id === finalFamilyId && m.user_id && m.user_id === authorUserId
        )?.id || null;
      }
    }

    // === Visibilità: incarico PRIVATO o condiviso? ===
    // "Solo per me" senza altri membri = promemoria personale → 'private':
    // invisibile alle famiglie (RLS lato database) e senza notifiche.
    // Se oltre a me è selezionato anche solo un altro membro → 'all'.
    const myUid = members.find((m) => m.id === authorMemberId)?.user_id || null;
    const selectedMembers = members.filter((m) => assignees.includes(m.id));
    let iAmTheAuthor = true;
    if (isEdit && editingTask?.author_id) {
      const authorUid = members.find((m) => m.id === editingTask.author_id)?.user_id;
      // Se non riusciamo a verificare l'autore, per sicurezza NON privatizziamo.
      iAmTheAuthor = !!authorUid && authorUid === myUid;
    }
    const taskVisibility = (
      iAmTheAuthor &&
      myUid &&
      selectedMembers.length > 0 &&
      selectedMembers.length === assignees.length &&
      selectedMembers.every((m) => m.user_id === myUid)
    ) ? 'private' : (restrictVisibility ? 'assignees' : 'all');

    // Rotazione turni: ha senso solo con ricorrenza e almeno 2 assegnatari.
    const rotationActive = rotationEnabled && recurringDays.length > 0 && assignees.length >= 2;

    const payloadCommon = {
      title: title.trim(),
      note: note.trim() || null,
      category,
      priority,
      urgent: priority === 'high',
      due_date: dueDate || null,
      due_time: dueTime || null,
      remind_lead_min: dueTime ? (Number(remindLead) || 0) : 0,
      location: location.trim() || null,
      recurring_days: recurringDays.length > 0 ? recurringDays : null,
      recurring_until: recurringDays.length > 0 ? computedUntil : null,
      rotation_member_ids: rotationActive ? assignees : null,
    };

    if (isEdit) {
      const { error: e1 } = await supabase.from('tasks').update({
        family_id: finalFamilyId,
        visibility: taskVisibility,
        ...payloadCommon,
      }).eq('id', editingTask.id);

      if (e1) { setErr(e1.message); setBusy(false); return; }

      await supabase.from('task_assignees').delete().eq('task_id', editingTask.id);
      if (assignees.length > 0) {
        markSelfAssignment(editingTask.id);
        // Con rotazione attiva parte (o riparte) il primo della lista;
        // gli altri entreranno a turno a ogni completamento.
        const toInsert = rotationActive ? assignees.slice(0, 1) : assignees;
        const rows = toInsert.map((memberId) => ({ task_id: editingTask.id, member_id: memberId }));
        await supabase.from('task_assignees').insert(rows);
      }

      // Sync membri extra con visibilità (visibilità ristretta → task_couple_members)
      try {
        await supabase.from('task_couple_members').delete().eq('task_id', editingTask.id);
        const extraRows = (taskVisibility === 'assignees' ? extraViewers : [])
          .filter((id) => !assignees.includes(id))
          .map((memberId) => ({ task_id: editingTask.id, member_id: memberId }));
        if (extraRows.length > 0) {
          await supabase.from('task_couple_members').insert(extraRows);
        }
      } catch (_) { /* best-effort */ }

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

    // Creazione: se l'unico assegnatario sono io, parto in 'taken'
    const initialStatus = (assignees.length === 1 &&
      ((authorMemberId && assignees[0] === authorMemberId) ||
       (finalAuthorId && assignees[0] === finalAuthorId)))
      ? 'taken'
      : 'todo';

    const { data: task, error: e1 } = await supabase.from('tasks').insert({
      family_id: finalFamilyId,
      ...payloadCommon,
      status: initialStatus,
      visibility: taskVisibility,
      author_id: finalAuthorId,
      assigned_to: assignees[0] || null,
    }).select().single();

    if (e1) { setErr(e1.message); setBusy(false); return; }

    // Checklist iniziale → task_subtasks (best-effort)
    const pendingCheck = [...checkItems, ...checkInput.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)].slice(0, 50);
    if (pendingCheck.length > 0) {
      try {
        await supabase.from('task_subtasks').insert(
          pendingCheck.map((text, i) => ({ task_id: task.id, text, order_index: i + 1 }))
        );
      } catch (_) { /* la checklist si può sempre aggiungere dal dettaglio */ }
    }

    // 📤 Spesa: condivisione nativa subito dopo il salvataggio
    if (shoppingMode && shareAfterSave && navigator.share) {
      const lines = [`🛒 ${title.trim() || 'Spesa'}`];
      if (dueDate) {
        lines.push(`📅 ${new Date(dueDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`);
      }
      for (const it of pendingCheck) lines.push(`⬜️ ${it}`);
      lines.push('', '— inviato da FAMMY 🏡');
      try { await navigator.share({ text: lines.join('\n') }); } catch (_) { /* annullato */ }
    }

    if (assignees.length > 0) {
      markSelfAssignment(task.id);
      // Con rotazione attiva il primo turno è del primo selezionato
      const toInsert = rotationActive ? assignees.slice(0, 1) : assignees;
      const rows = toInsert.map((memberId) => ({ task_id: task.id, member_id: memberId }));
      await supabase.from('task_assignees').insert(rows);
    }

    // Membri extra con visibilità (visibilità ristretta → task_couple_members)
    if (taskVisibility === 'assignees' && extraViewers.length > 0) {
      try {
        const extraRows = extraViewers
          .filter((id) => !assignees.includes(id))
          .map((memberId) => ({ task_id: task.id, member_id: memberId }));
        if (extraRows.length > 0) {
          await supabase.from('task_couple_members').insert(extraRows);
        }
      } catch (_) { /* best-effort */ }
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
      <div className="modal modal-full" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Alert assegnatari mancanti — popup bloccante sopra la modale */}
        {showAssigneeAlert && (
          <div onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 300, padding: 16,
            }} data-testid="add-task-assignee-alert">
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--w, #fff)', borderRadius: 16, maxWidth: 360, width: '100%',
                padding: 22, boxShadow: '0 18px 48px rgba(0,0,0,0.3)',
              }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>👥</div>
              <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 17 }}>
                {t('assign_required_h') || 'A chi assegni questo incarico?'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--km)', marginTop: 0, lineHeight: 1.5 }}>
                {t('assign_required_p') ||
                  'Per evitare che un incarico finisca dimenticato, scegli sempre a chi è destinato. Puoi assegnarlo a te stesso ("Solo a me") oppure a uno o più membri della famiglia.'}
              </p>
              <button type="button" onClick={() => setShowAssigneeAlert(false)}
                data-testid="add-task-assignee-alert-ok"
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
          <h2 style={{ flex: 1, margin: 0, fontSize: 18 }} data-testid="add-task-modal-title">
            {isEdit ? t('edit_task_h') || 'Modifica incarico' : t('addtask_h')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="add-task-close-btn"
            aria-label={t('close') || 'Chiudi'}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '1px solid var(--sm)', background: 'var(--ab)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 600, color: 'var(--k)',
              cursor: 'pointer', padding: 0, lineHeight: 1,
              flexShrink: 0,
            }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={scrollableRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {!shoppingMode && (<>
            {/* === CATEGORIA === */}
            <div>
              <label>{t('addtask_cat_label')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="add-task-category-row">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                    data-testid={`add-task-cat-${c.id}`}
                    style={chipStyle(category === c.id)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* === PRIORITÀ === */}
            <div style={{ marginTop: 16 }}>
              <label>{t('addtask_priority_label') || 'Priorità'}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
                data-testid="add-task-priority-row">
                {[
                  { id: 'normal', emoji: '🟢', label: t('addtask_priority_normal') || 'Normale', color: 'var(--gn)' },
                  { id: 'medium', emoji: '🟠', label: t('addtask_priority_medium') || 'Media',    color: '#F39C12' },
                  { id: 'high',   emoji: '🔴', label: t('addtask_priority_high')   || 'Urgente',  color: 'var(--rd)' },
                ].map((p) => {
                  const active = priority === p.id;
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setPriority(p.id)}
                      data-testid={`add-task-priority-${p.id}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 100,
                        border: active ? `2px solid ${p.color}` : '1.5px solid var(--sm)',
                        background: active ? `${p.color}15` : 'white',
                        color: active ? p.color : 'var(--km)',
                        fontSize: 13, fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}>
                      <span>{p.emoji}</span> {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            </>)}

            {/* === TITOLO + AI HINT === */}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="title">{t('addtask_title_label')}</label>
              <input id="title" className="input" autoFocus
                ref={titleInputRef}
                data-testid="add-task-title-input"
                placeholder={t(`addtask_title_ph_${category}`)}
                value={title} onChange={(e) => setTitle(e.target.value)}
                style={titleFlash ? {
                  border: '2px solid var(--rd)',
                  boxShadow: '0 0 0 4px rgba(231, 76, 60, 0.18)',
                  animation: 'fammy-flash 700ms ease-in-out',
                } : undefined}
              />

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
            </div>

            {/* === CHECKLIST INIZIALE (solo creazione) === */}
            {!isEdit && shoppingMode && (
              <div style={{ marginTop: 16 }}>
                {!checkOpen ? (
                  <button type="button"
                    onClick={() => setCheckOpen(true)}
                    data-testid="add-task-checklist-toggle"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: '1.5px dashed var(--sm)', background: 'transparent',
                      color: 'var(--km)', fontSize: 13, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                    }}>
                    ✓ ➕ {t('add_checklist_btn') || 'Aggiungi checklist (es. lista della spesa)'}
                  </button>
                ) : (
                  <div style={{
                    padding: 12, borderRadius: 12,
                    border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
                  }}>
                    <label>✓ {t('add_checklist_label') || 'Checklist'}{checkItems.length > 0 ? ` (${checkItems.length})` : ''}</label>
                    {checkItems.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {checkItems.map((it, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 100,
                            background: 'var(--ab)', color: 'var(--k)',
                            fontSize: 12, fontWeight: 600,
                          }}>
                            {it}
                            <button type="button"
                              onClick={() => setCheckItems((prev) => prev.filter((_, j) => j !== i))}
                              style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', padding: 0, fontSize: 13 }}>
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input className="input"
                      data-testid="add-task-checklist-input"
                      placeholder={t('add_checklist_ph') || 'es. latte, pane, uova + Invio'}
                      value={checkInput}
                      onChange={(e) => setCheckInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCheckItems(); } }}
                      onBlur={addCheckItems} />
                    <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
                      {t('add_checklist_hint') || 'Più voci insieme separate da virgola. Potrai spuntarle nel dettaglio dell\u2019incarico.'}
                    </p>
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={shareAfterSave}
                    onChange={(e) => setShareAfterSave(e.target.checked)}
                    data-testid="add-task-share-after" />
                  <span style={{ fontSize: 12, color: 'var(--k)', fontWeight: 600 }}>
                    📤 {t('shopping_share_after') || 'Dopo il salvataggio apri la condivisione (WhatsApp, ecc.)'}
                  </span>
                </label>
              </div>
            )}


            {/* === QUANDO (data + ora) === */}
            <div style={{ marginTop: 20 }}>
              <label>{t('addtask_when')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <button type="button" onClick={() => setDueDate(dateOffset(0))}
                  data-testid="add-task-date-today"
                  style={chipStyle(isQuickActive(0))}>📍 {t('date_today')}</button>
                <button type="button" onClick={() => setDueDate(dateOffset(1))}
                  data-testid="add-task-date-tomorrow"
                  style={chipStyle(isQuickActive(1))}>☀️ {t('date_tomorrow')}</button>
                <button type="button" onClick={() => setDueDate(dateOffset(7))}
                  data-testid="add-task-date-week"
                  style={chipStyle(isQuickActive(7))}>📅 {t('date_in_a_week')}</button>
              </div>
              <NativeDateInput
                value={dueDate}
                onChange={setDueDate}
                placeholder={t('tap_choose_date')}
                testid="add-task-date-picker-btn"
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <label htmlFor="time">{t('addtask_time_label')}</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <input id="time" type="time" className="input"
                  data-testid="add-task-time-input"
                  value={dueTime} onChange={(e) => setDueTime(e.target.value)}
                  placeholder="HH:MM"
                  style={{ flex: 1, minWidth: 0 }} />
                {dueTime && (
                  <button
                    type="button"
                    onClick={() => setDueTime('')}
                    data-testid="add-task-time-clear-btn"
                    aria-label={t('clear') || 'Cancella orario'}
                    title={t('clear_time') || 'Rimuovi orario'}
                    style={{
                      width: 44, borderRadius: 12,
                      border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
                      color: 'var(--km)', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}>✕</button>
                )}
              </div>
              {/* Promemoria anticipato: quando ricevere la notifica */}
              {dueTime && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 4 }}>
                    🔔 {t('remind_when_label') || 'Quando avvisarti?'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { v: 0,   label: t('remind_at_time') || "All'orario" },
                      { v: 30,  label: t('remind_30') || '30 min prima' },
                      { v: 60,  label: t('remind_60') || '1 ora prima' },
                      { v: 180, label: t('remind_180') || '3 ore prima' },
                    ].map((opt) => (
                      <button key={opt.v} type="button"
                        onClick={() => setRemindLead(opt.v)}
                        data-testid={`add-task-remind-${opt.v}`}
                        style={{
                          padding: '5px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
                          border: remindLead === opt.v ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
                          background: remindLead === opt.v ? 'var(--ac)' : 'white',
                          color: remindLead === opt.v ? 'white' : 'var(--k)',
                          cursor: 'pointer',
                        }}>
                        {remindLead === opt.v ? '✓ ' : ''}{opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* === CHECKLIST INIZIALE (solo creazione) === */}
            {!isEdit && !shoppingMode && (
              <div style={{ marginTop: 16 }}>
                {!checkOpen ? (
                  <button type="button"
                    onClick={() => setCheckOpen(true)}
                    data-testid="add-task-checklist-toggle"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      border: '1.5px dashed var(--sm)', background: 'transparent',
                      color: 'var(--km)', fontSize: 13, fontWeight: 600,
                      textAlign: 'left', cursor: 'pointer',
                    }}>
                    ✓ ➕ {t('add_checklist_btn') || 'Aggiungi checklist (es. lista della spesa)'}
                  </button>
                ) : (
                  <div style={{
                    padding: 12, borderRadius: 12,
                    border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
                  }}>
                    <label>✓ {t('add_checklist_label') || 'Checklist'}{checkItems.length > 0 ? ` (${checkItems.length})` : ''}</label>
                    {checkItems.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {checkItems.map((it, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 100,
                            background: 'var(--ab)', color: 'var(--k)',
                            fontSize: 12, fontWeight: 600,
                          }}>
                            {it}
                            <button type="button"
                              onClick={() => setCheckItems((prev) => prev.filter((_, j) => j !== i))}
                              style={{ border: 'none', background: 'transparent', color: 'var(--rd)', cursor: 'pointer', padding: 0, fontSize: 13 }}>
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input className="input"
                      data-testid="add-task-checklist-input"
                      placeholder={t('add_checklist_ph') || 'es. latte, pane, uova + Invio'}
                      value={checkInput}
                      onChange={(e) => setCheckInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCheckItems(); } }}
                      onBlur={addCheckItems} />
                    <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
                      {t('add_checklist_hint') || 'Più voci insieme separate da virgola. Potrai spuntarle nel dettaglio dell\u2019incarico.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!shoppingMode && (<>
            {/* === LUOGO === */}
            <div style={{ marginTop: 16 }}>
              <label htmlFor="loc">{t('addtask_loc_label')}</label>
              <input id="loc" className="input"
                data-testid="add-task-location-input"
                placeholder={t('addtask_loc_ph')}
                value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            </>)}

            {/* === ASSEGNATARI === */}
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
                  data-testid="add-task-only-for-me"
                  onClick={() => {
                    const newOnlyForMe = !onlyForMe;
                    setOnlyForMe(newOnlyForMe);
                    setShowFamiliesWhilePersonal(false);
                    if (newOnlyForMe) {
                      // Seleziona il MIO membro nella famiglia giusta, in ordine:
                      // 1) la famiglia attualmente aperta nell'app (taskFamily);
                      // 2) altrimenti (vista "Tutte") la PRIMA famiglia della
                      //    lista qui sotto, così il chip evidenziato è visibile
                      //    e l'utente vede/decide dove finisce il promemoria.
                      // Senza questo, veniva scelto un mio membro in una
                      // famiglia arbitraria → incarico nella famiglia sbagliata.
                      const myUid = members.find((m) => m.id === authorMemberId)?.user_id;
                      const isMine = (m) => m.user_id && myUid && m.user_id === myUid;
                      const mine =
                        (taskFamily && members.find((m) => m.family_id === taskFamily && isMine(m))) ||
                        byFamily.map((g) => g.members.find(isMine)).find(Boolean) ||
                        members.find((m) => m.id === authorMemberId) ||
                        null;
                      setAssignees(mine ? [mine.id] : []);
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

              {onlyForMe && !showFamiliesWhilePersonal ? (
                <div data-testid="add-task-personal-box" style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(140, 157, 134, 0.12)',
                  border: '1px solid rgba(140, 157, 134, 0.35)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)', marginBottom: 4 }}>
                    🔒 {t('personal_reminder_h') || 'Promemoria personale'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.45 }}>
                    {t('personal_reminder_p') ||
                      'Visibile solo a te: nessuna famiglia lo vedrà e nessuno riceverà notifiche.'}
                  </div>
                  <button type="button"
                    data-testid="add-task-personal-share-btn"
                    onClick={() => setShowFamiliesWhilePersonal(true)}
                    style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 100,
                      border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
                      color: 'var(--k)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    ＋ {t('personal_reminder_share') || 'Condividi con altri membri…'}
                  </button>
                </div>
              ) : (
              <>
              {onlyForMe && (
                <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 8, lineHeight: 1.4 }}>
                  {t('personal_reminder_share_hint') ||
                    'Se selezioni altri membri, l\u2019incarico diventa condiviso e visibile a loro.'}
                </div>
              )}
              {byFamily.map((g) => {
                // expandedFamilies è:
                //   null (creazione) → tutte aperte di default
                //   {} (editing) → tutte chiuse di default
                //   { [familyId]: bool } → override esplicito
                const isExpanded = expandedFamilies === null
                  ? true
                  : expandedFamilies[g.family.id] === true;
                const allSelected = g.members.length > 0 && g.members.every((m) => assignees.includes(m.id));
                const selectedCount = g.members.filter((m) => assignees.includes(m.id)).length;
                return (
                  <div key={g.family.id} style={{ marginBottom: 8, border: '1px solid var(--sm)', borderRadius: 12, overflow: 'hidden' }}>
                    <button type="button"
                      data-testid={`add-task-family-toggle-${g.family.id}`}
                      onClick={() => setExpandedFamilies((p) => ({
                        ...(p || {}),
                        [g.family.id]: !isExpanded,
                      }))}
                      style={{
                        width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--w, #fff)', border: 'none', cursor: 'pointer', textAlign: 'left',
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
                      data-testid={`add-task-family-select-all-${g.family.id}`}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 0,
                        border: 'none', borderTop: '1px solid var(--sm)',
                        background: allSelected ? 'var(--ac)' : 'white',
                        color: allSelected ? 'white' : 'var(--ac)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        letterSpacing: '0.02em',
                      }}>
                      <span style={{ fontSize: 14 }}>{allSelected ? '✓' : '☐'}</span>
                      {allSelected ? t('deselect_all') : t('select_all')}
                    </button>
                    {isExpanded && (
                      <div style={{ padding: 10, background: 'var(--ab)', borderTop: '1px solid var(--sm)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {g.members.map((m) => {
                            const selected = assignees.includes(m.id);
                            // Verifica se questo membro è in assenza nel
                            // periodo della task (oggi se nessuna due_date).
                            const overlap = findAbsenceOverlap(
                              absences, m.user_id,
                              dueDate || toLocalYMD(),
                              dueDate || toLocalYMD(),
                            );
                            return (
                              <button key={m.id} type="button"
                                data-testid={`add-task-assignee-${m.id}`}
                                onClick={() => toggleAssignee(m.id)} style={chipMember(selected)}
                                title={overlap ? `${absenceLabel(overlap)} · ${fmtAbsenceRange(overlap)}` : undefined}>
                                {selected && <span>✓ </span>}
                                <span style={avatarStyle(m)}>
                                  {m.avatar_letter || m.name.charAt(0).toUpperCase()}
                                </span>
                                {m.name}
                                {overlap && (
                                  <span style={{
                                    marginLeft: 4, padding: '1px 6px', borderRadius: 100,
                                    background: 'rgba(243,156,18,0.18)',
                                    border: '1px solid rgba(243,156,18,0.45)',
                                    color: '#B36E00', fontSize: 10, fontWeight: 700,
                                  }}>{absenceLabel(overlap)}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </>
              )}
            </div>

            {/* === VISIBILITÀ === chi può vedere questo incarico.
                Nascosta per i promemoria personali (già 'private'). */}
            {assignees.length > 0 && !(onlyForMe && !showFamiliesWhilePersonal) && (
              <div style={{ marginTop: 16 }} data-testid="add-task-visibility-box">
                <label>{t('task_visibility_label') || 'Chi può vederlo'}</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button type="button"
                    data-testid="add-task-visibility-all"
                    onClick={() => { setVisibilityTouched(true); setRestrictVisibility(false); }}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 12,
                      border: `1.5px solid ${!restrictVisibility ? 'var(--ac)' : 'var(--sm)'}`,
                      background: !restrictVisibility ? 'var(--ab)' : 'white',
                      color: !restrictVisibility ? 'var(--ac)' : 'var(--k)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    👨‍👩‍👧 {t('task_visibility_all') || 'Tutta la famiglia'}
                  </button>
                  <button type="button"
                    data-testid="add-task-visibility-assignees"
                    onClick={() => { setVisibilityTouched(true); setRestrictVisibility(true); }}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 12,
                      border: `1.5px solid ${restrictVisibility ? 'var(--ac)' : 'var(--sm)'}`,
                      background: restrictVisibility ? 'var(--ab)' : 'white',
                      color: restrictVisibility ? 'var(--ac)' : 'var(--k)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                    🔒 {t('task_visibility_assignees') || 'Solo coinvolti'}
                  </button>
                </div>
                {restrictVisibility && (
                  <div style={{
                    marginTop: 10, padding: '12px 14px', borderRadius: 12,
                    background: 'rgba(140, 157, 134, 0.12)',
                    border: '1px solid rgba(140, 157, 134, 0.35)',
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.45 }}>
                      {t('task_visibility_assignees_p') ||
                        'Lo vedranno solo tu, gli assegnatari e le persone che aggiungi qui sotto. Il resto della famiglia non lo vedrà.'}
                    </div>
                    {(() => {
                      const candidates = byFamily
                        .flatMap((g) => g.members)
                        .filter((m) => !assignees.includes(m.id) && m.id !== authorMemberId);
                      if (candidates.length === 0) return null;
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--k)', marginBottom: 6 }}>
                            {t('task_visibility_extra_h') || 'Può vederlo anche…'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {candidates.map((m) => {
                              const selected = extraViewers.includes(m.id);
                              return (
                                <button key={m.id} type="button"
                                  data-testid={`add-task-extra-viewer-${m.id}`}
                                  onClick={() => toggleExtraViewer(m.id)}
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
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Info "Da seguire": appare quando hai assegnato a qualcun altro
                ma NON a te stesso → la task finirà in 👁️ Da seguire e
                riceverai notifiche se viene presa/in scadenza. */}
            {!isEdit && authorMemberId && assignees.length > 0 && !assignees.includes(authorMemberId) && (
              <div
                data-testid="add-task-followup-hint"
                style={{
                  marginTop: -4, marginBottom: 12,
                  padding: '10px 14px',
                  background: 'rgba(193, 98, 75, 0.10)',
                  border: '1px solid rgba(193, 98, 75, 0.25)',
                  borderRadius: 12,
                  fontSize: 12, lineHeight: 1.45,
                  color: 'var(--ac)',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>👁️</span>
                <span style={{ flex: 1, color: 'var(--k)' }}>
                  <strong style={{ color: 'var(--ac)' }}>{t('addtask_followup_title') || 'Andrà in Da seguire'}</strong>
                  <br />
                  {t('addtask_followup_hint') || 'Non sei tra gli assegnatari. La troverai nel filtro Da seguire della Bacheca e riceverai una notifica quando qualcuno se ne occupa.'}
                </span>
              </div>
            )}

            {!shoppingMode && (<>
            {/* === RICORRENZA === */}
            <div style={{ marginTop: 20 }}>
              <button type="button" onClick={() => setExpandRecurring((v) => !v)}
                data-testid="add-task-toggle-recurrence"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
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
                  <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 12 }}>{t('repeat_hint')}</div>

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

                  {recurringDays.length > 0 && assignees.length >= 2 && (
                    <div style={{
                      marginTop: 16, padding: 12, background: 'var(--w, #fff)',
                      border: rotationEnabled ? '1.5px solid var(--ac)' : '1.5px solid var(--sm)',
                      borderRadius: 12,
                    }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={rotationEnabled}
                          onChange={(e) => setRotationEnabled(e.target.checked)}
                          data-testid="add-task-rotation-toggle"
                          style={{ marginTop: 2 }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)' }}>
                            🔁 {t('rotation_h') || 'A turno'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--km)', lineHeight: 1.4 }}>
                            {t('rotation_p') ||
                              `I ${assignees.length} assegnatari si alternano: dopo ogni completamento tocca al prossimo, che riceve la notifica. Si parte dal primo selezionato.`}
                          </div>
                        </div>
                      </label>
                    </div>
                  )}

                  {recurringDays.length > 0 && (
                    <div style={{ marginTop: 16, padding: 12, background: 'var(--w, #fff)', border: '1.5px solid var(--sm)', borderRadius: 12 }}>
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
                          <span style={{ fontSize: 13, fontWeight: 600 }}>📅 Solo questo mese</span>
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

            </>)}

            {/* === NOTA === */}
            <div style={{ marginTop: 20 }}>
              <label htmlFor="note">{t('note_optional')}</label>
              <textarea id="note" className="input" rows={3}
                data-testid="add-task-note-input"
                placeholder={t('note_placeholder')}
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {/* === FOTO === */}
            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span>📸 {t('attach_photo')} <span style={{ color: 'var(--km)', fontSize: 11 }}>({t('optional_label')})</span></span>
              </label>
              {/* iOS: il picker nativo ha "Sfoglia" → input unico con anche i
                  documenti. Android: image/* per la galleria + input doc
                  separato (image/* nasconde il file manager). */}
              <input type="file" id="file-input" multiple
                accept={isIOS() ? `image/*,${DOC_ACCEPT}` : 'image/*'}
                data-testid="add-task-file-input"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              <input type="file" id="file-input-camera" multiple accept="image/*" capture="environment"
                data-testid="add-task-file-input-camera"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              <input type="file" id="file-input-doc" multiple accept={DOC_ACCEPT}
                data-testid="add-task-file-input-doc"
                onChange={handleFileSelect} style={{ display: 'none' }} />
              {isIOS() ? (
                /* iOS: picker nativo già mostra "Scatta foto / Libreria foto / Sfoglia" */
                <button type="button" onClick={() => document.getElementById('file-input').click()}
                  data-testid="add-task-attach-photo-btn"
                  style={{
                    width: '100%', padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                    background: 'var(--w, #fff)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--ac)',
                  }}>
                  {t('take_or_attach_photo')}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => document.getElementById('file-input-camera').click()}
                    data-testid="add-task-camera-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'var(--w, #fff)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)',
                    }}>
                    📷 {t('take_photo') || 'Foto'}
                  </button>
                  <button type="button" onClick={() => document.getElementById('file-input').click()}
                    data-testid="add-task-attach-photo-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'var(--w, #fff)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      color: 'var(--ac)',
                    }}>
                    🖼️ {t('from_gallery') || 'Galleria'}
                  </button>
                  <button type="button" onClick={() => document.getElementById('file-input-doc').click()}
                    data-testid="add-task-attach-file-btn"
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                      background: 'var(--w, #fff)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
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
            <button type="button" className="btn secondary" onClick={onClose} data-testid="add-task-cancel-btn">{t('cancel')}</button>
            <button type="submit" className="btn" disabled={busy} data-testid="add-task-submit-btn">
              {busy ? <span className="spin" /> : (isEdit ? (t('save_changes') || 'Salva modifiche') : t('add'))}
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
