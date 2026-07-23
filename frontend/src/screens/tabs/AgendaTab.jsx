import { useState, useEffect, useRef } from 'react';
import { toLocalYMD } from '../../lib/dateUtils.js';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import AddEventModal from '../../components/AddEventModal.jsx';
import AddTaskModal from '../../components/AddTaskModal.jsx';
import EventDetailModal from '../../components/EventDetailModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import CalendarShareModal from '../../components/CalendarShareModal.jsx';
import ExportAllCalendarsModal from '../../components/ExportAllCalendarsModal.jsx';
import FamilySwitcher from '../../components/FamilySwitcher.jsx';
import FabSpeedDial from '../../components/FabSpeedDial.jsx';
import AbsenceModal from '../../components/AbsenceModal.jsx';
import MedicationsModal from '../../components/MedicationsModal.jsx';
import WeekView from '../../components/WeekView.jsx';
import { dedupeByUser } from '../../lib/memberDedupe.js';
import { absenceLabel, fmtAbsenceRange } from '../../lib/useAbsences.js';

const TASK_CAT_EMOJI = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

// Espande gli eventi: per quelli ricorrenti, genera istanze nei giorni
// pertinenti tra (start originale) e (recurring_until o +12 mesi).
function expandEvents(events) {
  const expanded = [];
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 12);

  for (const ev of events) {
    if (!ev.recurring_days || ev.recurring_days.length === 0) {
      expanded.push(ev);
      continue;
    }
    const start = new Date(ev.starts_at);
    const until = ev.recurring_until ? new Date(ev.recurring_until) : horizonEnd;
    const exceptions = new Set(ev.recurring_exceptions || []);
    // L'occorrenza "originale" (start) la mostriamo SOLO se non è in eccezioni
    const startDateKey = start.toISOString().slice(0, 10);
    if (!exceptions.has(startDateKey)) {
      expanded.push(ev);
    }

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= until) {
      const wd = (cursor.getDay() + 6) % 7;
      if (ev.recurring_days.includes(wd)) {
        const occ = new Date(cursor);
        occ.setHours(start.getHours(), start.getMinutes(), start.getSeconds());
        const occDateKey = occ.toISOString().slice(0, 10);
        if (!exceptions.has(occDateKey)) {
          expanded.push({
            ...ev,
            id: `${ev.id}__${occDateKey}`,
            _origId: ev.id,
            starts_at: occ.toISOString(),
            _isRecurringInstance: true,
            _occurrenceDate: occDateKey,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return expanded;
}

// Espande i task ricorrenti: per ogni task con due_date e recurring_days,
// genera istanze nei giorni pertinenti tra (due_date) e (recurring_until o +12 mesi).
// recurring_days[] contiene:
//   - valori 0..6 = giorni della settimana (0=Lun, 6=Dom)
//   - valori >6  = giorni specifici del mese (es. 10 = il 10 di ogni mese)
function expandTasks(tasks) {
  const expanded = [];
  // Per i task limita l'orizzonte a 6 mesi (evita liste infinite di ricorrenze)
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 6);

  for (const tk of tasks) {
    if (!tk.due_date) continue;
    if (!tk.recurring_days || tk.recurring_days.length === 0) {
      expanded.push(tk);
      continue;
    }

    const start = new Date(tk.due_date + 'T00:00:00');
    const until = tk.recurring_until ? new Date(tk.recurring_until + 'T23:59:59') : horizonEnd;
    const exceptions = new Set(tk.recurring_exceptions || []);
    if (!exceptions.has(tk.due_date)) {
      expanded.push(tk);
    }

    const weekdays = tk.recurring_days.filter((v) => v <= 6);
    const monthDays = tk.recurring_days.filter((v) => v > 6).map((v) => v - 6);

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= until) {
      const wd = (cursor.getDay() + 6) % 7;
      const dom = cursor.getDate();
      const matches = weekdays.includes(wd) || monthDays.includes(dom);
      if (matches) {
        const occDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!exceptions.has(occDate)) {
          expanded.push({
            ...tk,
            id: `${tk.id}__${occDate}`,
            _origId: tk.id,
            due_date: occDate,
            _isRecurringInstance: true,
            _occurrenceDate: occDate,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return expanded;
}

// Helper: riga del bottom-sheet "Quick actions" (apre dal "+" in header).
function ActionRow({ icon, label, onClick, accent, testid }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 14,
        border: '1px solid var(--sm)', background: 'var(--w, #fff)',
        textAlign: 'left', cursor: 'pointer',
        borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--sm)',
      }}>
      <span style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--ab)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--k)' }}>{label}</span>
    </button>
  );
}


export default function AgendaTab({ familyId, families, events, tasks = [], taskAssignees = [], members, me, isAll, absences = [], session, profile, onChanged, onSwitchFamily, onOpenAI }) {
  const { t: __t0, lang } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const localeMap = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  const dateLocale = localeMap[lang] || 'it-IT';
  const [showAdd, setShowAdd] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  // Prefill per "Fare la spesa" dal menu azioni rapide
  const [addPrefill, setAddPrefill] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [selTask, setSelTask] = useState(null);
  const [selEvent, setSelEvent] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showExportAll, setShowExportAll] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState(null);
  const [showAbsence, setShowAbsence] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // Vista calendario: 'month' (default) o 'week'
  const [viewMode, setViewMode] = useState('month');
  // Inizio settimana corrente (Lunedì)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const dow = (d.getDay() + 6) % 7; // 0=Lun
    d.setDate(d.getDate() - dow);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [openSections, setOpenSections] = useState({ today: false, future: false, past: false });
  const [onlyMine, setOnlyMine] = useState(true);
  const [eventAssignees, setEventAssignees] = useState([]);
  // FAB pulse: attivato quando l'utente clicca un giorno nel calendario,
  // per segnalare visivamente "ok ora premi + per inserire qualcosa qui".
  const [fabPulse, setFabPulse] = useState(false);
  // Medicine FAB
  const [medsForMember, setMedsForMember] = useState(null);
  const [showMedsPicker, setShowMedsPicker] = useState(false);
  // Bottom-sheet azioni rapide (sostituisce il floating FAB in Agenda)
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Carica gli assegnatari di eventi per il filtro "Solo a me"
  useEffect(() => {
    let cancelled = false;
    const evIds = (events || []).map((e) => e.id);
    if (evIds.length === 0) { setEventAssignees([]); return; }
    supabase.from('event_assignees').select('event_id, member_id').in('event_id', evIds)
      .then(({ data }) => { if (!cancelled) setEventAssignees(data || []); });
    return () => { cancelled = true; };
  }, [events]);

  // Quando l'utente clicca una data nel calendario → fa lampeggiare il FAB.
  // Skippa il primo render (selectedDay parte da null).
  useEffect(() => {
    if (!selectedDay) return;
    setFabPulse(true);
    const id = setTimeout(() => setFabPulse(false), 1500);
    return () => clearTimeout(id);
  }, [selectedDay]);

  // Membri assistiti accessibili (limitati al family scope se non "Tutte").
  // DEDUPE per user_id + SORT: "Per me" (self) in cima per discoverability.
  const assistedMembers = dedupeByUser(
    (members || []).filter((m) => {
      if (!m.is_assisted) return false;
      if (m.is_contact_only) return false; // solo contatto: niente medicine
      if (familyId) return m.family_id === familyId;
      return (families || []).some((f) => f.id === m.family_id);
    })
  ).sort((a, b) => {
    const aSelf = a.user_id === session.user.id ? 0 : 1;
    const bSelf = b.user_id === session.user.id ? 0 : 1;
    if (aSelf !== bSelf) return aSelf - bSelf;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Il mio membro (per aprire le mie medicine anche senza assistiti)
  const myMemberForMeds = () => {
    const mine = (members || []).filter((m) => m.user_id === session.user.id);
    if (mine.length === 0) return null;
    if (familyId) return mine.find((m) => m.family_id === familyId) || mine[0];
    return mine[0];
  };

  // Le MIE medicine sono sempre accessibili, anche se non sono "assistito":
  // chiunque può avere una terapia. Se ci sono anche assistiti, il picker
  // li mostra tutti insieme a me.
  const medTargets = (() => {
    const self = myMemberForMeds();
    const list = [...assistedMembers];
    if (self && !list.some((m) => m.id === self.id)) list.unshift(self);
    return list;
  })();

  const onClickNewMed = () => {
    if (medTargets.length === 0) {
      // Account non collegato a nessun member: spiega invece di non fare nulla.
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: {
          text: t('meds_no_member') ||
            'Il tuo account non è ancora collegato a un membro della famiglia. Apri la tab Famiglia e chiedi a chi ti ha invitato di collegarti al tuo profilo.',
          tone: 'warning',
        },
      }));
      return;
    }
    if (medTargets.length === 1) setMedsForMember(medTargets[0]);
    else setShowMedsPicker(true);
  };



  // Eventi-compleanno legacy nella tabella events (creati in passato dai
  // modali membro, spesso con età ormai sbagliata): li escludiamo perché
  // i compleanni ora sono calcolati direttamente da members.birth_date.
  const cleanEvents = (events || []).filter(
    (ev) => !String(ev.title || '').startsWith('🎂 Compleanno di')
  );

  // === Compleanni sintetici ===
  // Calcolati dai membri (INCLUSI i "solo contatto": è il loro scopo),
  // per anno scorso/corrente/prossimo così coprono la navigazione.
  const birthdayEvents = (() => {
    const out = [];
    const seen = new Set();
    const thisYear = new Date().getFullYear();
    const p2 = (n) => String(n).padStart(2, '0');
    for (const m of (members || [])) {
      if (!m.birth_date) continue;
      const inScope = familyId
        ? m.family_id === familyId
        : (families || []).some((f) => f.id === m.family_id);
      if (!inScope) continue;
      // Dedupe: la stessa persona può avere member rows in più famiglie
      const dk = `${m.user_id || m.name}|${String(m.birth_date).slice(0, 10)}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      const [by, bm, bd] = String(m.birth_date).slice(0, 10).split('-').map(Number);
      if (!bm || !bd) continue;
      for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
        const age = year - by;
        if (age < 0) continue;
        const base = __t0('bday_event_title', { name: m.name });
        const label = base === 'bday_event_title' ? `Compleanno di ${m.name}` : base;
        out.push({
          id: `bday-${m.id}-${year}`,
          _isBirthday: true,
          family_id: m.family_id,
          created_by: null,
          title: `🎂 ${label}${age > 0 ? ` (${age})` : ''}`,
          starts_at: `${year}-${p2(bm)}-${p2(bd)}T09:00:00`,
          category: 'other',
        });
        // 🎁 Promemoria 7 giorni prima — per tutta la famiglia TRANNE il
        // festeggiato (niente spoiler a chi compie gli anni). Gestisce da
        // solo il cambio mese/anno (es. compleanno 3 gennaio → 27 dicembre).
        if (!(m.user_id && m.user_id === session?.user?.id)) {
          const rd = new Date(year, bm - 1, bd - 7, 9, 0, 0);
          const rBase = __t0('bday_reminder_title', { name: m.name });
          const rLabel = rBase === 'bday_reminder_title'
            ? `Tra una settimana: compleanno di ${m.name}` : rBase;
          out.push({
            id: `bdayrem-${m.id}-${year}`,
            _isBirthday: true,
            family_id: m.family_id,
            created_by: null,
            title: `🎁 ${rLabel}`,
            starts_at: `${rd.getFullYear()}-${p2(rd.getMonth() + 1)}-${p2(rd.getDate())}T09:00:00`,
            category: 'other',
          });
        }
      }
    }
    return out;
  })();

  const expandedEvents = [...expandEvents(cleanEvents), ...birthdayEvents];
  // Task con due_date che non sono done, da mostrare in calendario/agenda.
  // Espandi le ricorrenze (settimanali + giorni del mese).
  const baseDueTasks = (tasks || []).filter((tk) => tk.due_date && tk.status !== 'done');
  const dueTasks = expandTasks(baseDueTasks);

  // Task SENZA due_date: appaiono nel calendario sul GIORNO DI CREAZIONE,
  // con flag `_undated` per evidenziarli con label "Senza data" nella card.
  // (Richiesta utente 13 giu: tasks senza data devono comunque essere
  // trovabili in Agenda, sull'unico giorno sensato disponibile.)
  const undatedTasks = (tasks || [])
    .filter((tk) => !tk.due_date && tk.status !== 'done' && tk.created_at)
    .map((tk) => {
      // Estrai YYYY-MM-DD dal created_at (timestamp UTC → data locale)
      const created = new Date(tk.created_at);
      const localDate = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
      return { ...tk, due_date: localDate, _undated: true };
    });
  const allDueTasks = [...dueTasks, ...undatedTasks];

  // Filtro "Solo a me": eventi dove sono assegnato (event_assignees) o creatore,
  // task dove sono assegnatario (task_assignees, multi-assignee) o autore.
  // Considera TUTTI i member_id dell'utente (vista multi-famiglia).
  const myMemberIdSet = new Set(
    (members || []).filter((m) => m.user_id === session?.user?.id).map((m) => m.id)
  );
  const myEventIds = new Set(eventAssignees.filter((a) => myMemberIdSet.has(a.member_id)).map((a) => a.event_id));
  const myAssignedTaskIds = new Set(
    (taskAssignees || []).filter((a) => myMemberIdSet.has(a.member_id)).map((a) => a.task_id)
  );
  const filterEvent = (ev) => {
    if (ev._isBirthday) return true; // i compleanni si vedono sempre, per tutti
    if (!onlyMine) return true;
    if (!me?.id) return false;
    const origId = ev._origId || ev.id;
    return myEventIds.has(origId) || myMemberIdSet.has(ev.created_by);
  };
  const filterTask = (tk) => {
    if (!onlyMine) return true;
    if (!me?.id) return false;
    const origId = tk._origId || tk.id;
    if (myAssignedTaskIds.has(origId)) return true;
    if (myMemberIdSet.has(tk.author_id)) return true;
    // Legacy single-assignee fallback
    if (tk.assigned_to && myMemberIdSet.has(tk.assigned_to)) return true;
    if (tk.delegated_to && myMemberIdSet.has(tk.delegated_to)) return true;
    return false;
  };
  const filteredEvents = expandedEvents.filter(filterEvent);
  const filteredTasks = allDueTasks.filter(filterTask);

  // Occorrenze "sospese" (escluse) — solo per il giorno selezionato.
  // Mostra una card placeholder "🚫 Sospeso oggi" per dare contesto
  // ("doveva esserci ma è stato saltato").
  const skippedForDay = (() => {
    if (!selectedDay) return [];
    const dayKey = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`;
    const out = [];
    const wd = (selectedDay.getDay() + 6) % 7;
    const dom = selectedDay.getDate();

    // Eventi sospesi: la data è in recurring_exceptions
    for (const ev of (events || [])) {
      if (!ev.recurring_days || ev.recurring_days.length === 0) continue;
      if (!ev.recurring_exceptions?.includes(dayKey)) continue;
      // Verifica: oggi è effettivamente uno dei giorni della serie?
      if (!ev.recurring_days.includes(wd)) continue;
      // entro orizzonte?
      if (ev.recurring_until && new Date(ev.recurring_until) < selectedDay) continue;
      if (!filterEvent(ev)) continue;
      out.push({ kind: 'event', id: `skip-e-${ev.id}-${dayKey}`, title: ev.title, realId: ev.id, dateKey });
    }
    for (const tk of (tasks || [])) {
      if (!tk.recurring_days || tk.recurring_days.length === 0) continue;
      if (!tk.recurring_exceptions?.includes(dayKey)) continue;
      const weekdays = tk.recurring_days.filter((v) => v <= 6);
      const monthDays = tk.recurring_days.filter((v) => v > 6).map((v) => v - 6);
      if (!weekdays.includes(wd) && !monthDays.includes(dom)) continue;
      if (tk.recurring_until && new Date(tk.recurring_until) < selectedDay) continue;
      if (!filterTask(tk)) continue;
      out.push({ kind: 'task', id: `skip-t-${tk.id}-${dayKey}`, title: tk.title, realId: tk.id, dateKey });
    }
    return out;
  })();

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const today = new Date();
  const referenceDay = selectedDay || new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfToday = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), referenceDay.getDate());
  const endOfToday = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), referenceDay.getDate() + 1);

  // Eventi suddivisi per data
  const todayEvents = filteredEvents.filter((e) => {
    const d = new Date(e.starts_at);
    return d >= startOfToday && d < endOfToday;
  });
  const futureEvents = filteredEvents.filter((e) => new Date(e.starts_at) >= endOfToday);
  const pastEvents = filteredEvents.filter((e) => new Date(e.starts_at) < startOfToday);

  // Task suddivisi per data
  const taskDate = (tk) => new Date(tk.due_date + 'T09:00:00');
  const todayTasks = filteredTasks.filter((tk) => {
    const d = taskDate(tk);
    return d >= startOfToday && d < endOfToday;
  });
  const futureTasks = filteredTasks.filter((tk) => taskDate(tk) >= endOfToday);
  const pastTasks = filteredTasks.filter((tk) => taskDate(tk) < startOfToday);

  // Conteggi totali (eventi + task)
  const todayCount = todayEvents.length + todayTasks.length;

  // Assenze del giorno di riferimento (per render dentro la sezione "Oggi")
  const refIso = `${referenceDay.getFullYear()}-${String(referenceDay.getMonth() + 1).padStart(2, '0')}-${String(referenceDay.getDate()).padStart(2, '0')}`;
  const userId = session?.user?.id;
  const todayAbsences = (absences || []).filter((a) => {
    if (a.start_date > refIso || a.end_date < refIso) return false;
    if (isAll) return true;
    if (a.user_id === userId) return true;
    return Array.isArray(a.visible_to_families) && a.visible_to_families.includes(familyId);
  });
  // Tutte le assenze visibili all'utente (senza filtro sul giorno):
  // serve per NON far scattare lo stato vuoto globale quando esistono
  // solo assenze (o solo task senza data).
  const visibleAbsences = (absences || []).filter((a) => {
    if (isAll) return true;
    if (a.user_id === userId) return true;
    return Array.isArray(a.visible_to_families) && a.visible_to_families.includes(familyId);
  });
  const futureCount = futureEvents.length + futureTasks.length;
  const pastCount = pastEvents.length + pastTasks.length;

  const restoreSkippedOccurrence = async (skipped) => {
    const table = skipped.kind === 'event' ? 'events' : 'tasks';
    if (!confirm(`Ripristinare "${skipped.title}" per questa data?`)) return;
    const { data: cur } = await supabase
      .from(table).select('recurring_exceptions').eq('id', skipped.realId).maybeSingle();
    const next = (cur?.recurring_exceptions || []).filter((d) => d !== skipped.dateKey);
    await supabase.from(table).update({ recurring_exceptions: next }).eq('id', skipped.realId);
    onChanged();
  };

  const removeEvent = async (event) => {
    if (!confirm(t('agenda_delete_confirm'))) return;
    const idToDelete = event._origId || event.id;
    await supabase.from('events').delete().eq('id', idToDelete);
    onChanged();
  };

  const targetFamilyId = familyId || families?.[0]?.id;
  const targetFamily = families?.find((f) => f.id === targetFamilyId);
  const getFamily = (item) => families?.find((f) => f.id === item.family_id);
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // Mescola eventi e task ordinati per data
  const renderItems = (evts, tks, past) => {
    const items = [
      ...evts.map((e) => ({ kind: 'event', date: new Date(e.starts_at), data: e })),
      ...tks.map((tk) => ({ kind: 'task', date: taskDate(tk), data: tk })),
    ].sort((a, b) => a.date - b.date);

    return items.slice(0, 80).map((it) => it.kind === 'event' ? (
      <EventCard key={`e-${it.data.id}`} event={it.data} me={me} family={isAll ? getFamily(it.data) : null} past={past}
        onRemove={() => { if (!it.data._isBirthday) removeEvent(it.data); }}
        onClick={() => { if (!it.data._isBirthday) setSelEvent(it.data); }} />
    ) : (
      <TaskAsEventCard key={`t-${it.data.id}`} task={it.data} family={isAll ? getFamily(it.data) : null} past={past} onClick={() => {
        // Se è un'istanza ricorrente o un task "senza data" (mappato sul
        // created_at), apri il task ORIGINALE dal DB invece della copia.
        const origId = it.data._origId || it.data.id;
        const orig = (tasks || []).find((tk) => tk.id === origId) || it.data;
        setSelTask(orig);
      }} />
    ));
  };

  // Etichette dinamiche: se l'utente ha selezionato un giorno DIVERSO da oggi,
  // i bucket "Oggi/Futuri/Passati" diventano "📌 <data> / Dopo / Prima di".
  const isViewingOtherDay = selectedDay && !sameDay(selectedDay, today);
  const fmtSel = selectedDay
    ? selectedDay.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })
    : '';
  const todayLabel = isViewingOtherDay ? `📌 ${fmtSel}` : t('agenda_today');
  const futureLabel = isViewingOtherDay ? `🗓️ ${t('agenda_after_label') || 'Dopo'} ${fmtSel}` : t('agenda_future');
  const pastLabel = isViewingOtherDay ? `⏪ ${t('agenda_before_label') || 'Prima di'} ${fmtSel}` : t('agenda_past');

  return (
    <>
      {/* Header agenda compatto stile iPhone Calendar:
          - FamilySwitcher pill a sx (solo se >1 famiglia) — più discreto
          - Bottone "Oggi" se sto guardando un mese diverso → snap back
          - Bottone Export icona (kebab-style minimal) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '4px 16px 0',
      }}>
        {families && families.length > 1 ? (
          <FamilySwitcher
            families={families}
            activeFamily={isAll ? 'all' : targetFamilyId}
            isAll={isAll}
            onSwitch={onSwitchFamily}
            testidPrefix="agenda-family"
            variant="pill"
          />
        ) : <span />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(() => {
            const todayDate = new Date();
            const viewIsCurrentMonth = viewMonth.getFullYear() === todayDate.getFullYear()
              && viewMonth.getMonth() === todayDate.getMonth();
            if (viewIsCurrentMonth) return null;
            return (
              <button
                type="button"
                data-testid="agenda-jump-today-btn"
                onClick={() => {
                  setViewMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
                  setSelectedDay(todayDate);
                }}
                style={{
                  padding: '6px 12px', borderRadius: 100,
                  background: 'var(--ab)', border: 'none',
                  color: 'var(--ac)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                }}>
                {t('agenda_today') || 'Oggi'}
              </button>
            );
          })()}
          <button
            type="button"
            data-testid="agenda-export-btn"
            onClick={() => setShowExportAll(true)}
            title={t('export_sheet_title') || 'Esporta calendario'}
            aria-label={t('export_sheet_title') || 'Esporta calendario'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--ab)', border: 'none',
              color: 'var(--k)', fontSize: 16,
              cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
            📥
          </button>
          {/* AI: apre l'AIAssistantDrawer */}
          {onOpenAI && (
            <button
              type="button"
              data-testid="agenda-ai-btn"
              onClick={() => onOpenAI()}
              title={t('ai_assistant') || 'Assistente AI'}
              aria-label={t('ai_assistant') || 'Assistente AI'}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--gn)', border: 'none',
                color: 'white', fontSize: 17,
                cursor: 'pointer', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(124,142,118,0.35)',
              }}>
              ✨
            </button>
          )}
          {/* "+" azioni rapide: apre bottom-sheet con nuovo incarico/assenza/medicina.
              Pulsa quando l'utente seleziona un giorno nel calendario. */}
          <button
            type="button"
            data-testid="agenda-new-btn"
            className={fabPulse ? 'fammy-pulse-attract' : ''}
            onClick={() => setShowQuickActions(true)}
            title={t('fab_new_title') || 'Nuovo'}
            aria-label={t('fab_new_title') || 'Nuovo'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--ac)', border: 'none',
              color: 'white', fontSize: 22, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, lineHeight: 1,
              boxShadow: '0 2px 6px rgba(193,98,75,0.35)',
            }}>
            +
          </button>
        </div>
      </div>

      <MonthWeekToggle viewMode={viewMode} onChange={setViewMode} t={t} />

      {viewMode === 'month' ? (
        <MonthGrid
          month={viewMonth}
          events={filteredEvents}
          tasks={filteredTasks}
          absences={absences}
          members={members}
          familyId={isAll ? null : targetFamilyId}
          selectedDay={selectedDay}
          onSelectDay={(d) => {
            const same = selectedDay && sameDay(selectedDay, d);
            setSelectedDay(same ? null : d);
            // Apri auto la sezione "Oggi" così l'utente vede subito eventi/assenze del giorno
            if (!same) setOpenSections((s) => ({ ...s, today: true }));
          }}
          onPrev={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          onNext={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          events={filteredEvents}
          tasks={filteredTasks}
          absences={absences}
          members={members}
          familyId={isAll ? null : targetFamilyId}
          selectedDay={selectedDay}
          onSelectDay={(d) => {
            setSelectedDay(d);
            if (d) setOpenSections((s) => ({ ...s, today: true }));
          }}
          onPrev={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d);
          }}
          onNext={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d);
          }}
          onClickEvent={(eventId) => {
            const ev = (events || []).find((e) => e.id === eventId);
            if (ev) setSelEvent(ev);
          }}
          onClickTask={(taskId) => {
            const tk = (tasks || []).find((t) => t.id === taskId);
            if (tk) setSelTask(tk);
          }}
        />
      )}

      {me?.id && (
        <div style={{ padding: '0 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            data-testid="agenda-only-mine-toggle"
            onClick={() => setOnlyMine((v) => !v)}
            style={{
              padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
              borderColor: onlyMine ? 'var(--k)' : 'var(--sm)',
              background: onlyMine ? 'var(--k)' : 'white',
              color: onlyMine ? 'white' : 'var(--km)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {onlyMine ? `✓ ${t('agenda_only_mine') || 'Solo a me'}` : `👤 ${t('agenda_only_mine') || 'Solo a me'}`}
          </button>
          {onlyMine && (
            <span style={{ fontSize: 11, color: 'var(--km)' }}>
              {filteredEvents.length + filteredTasks.length} {(filteredEvents.length + filteredTasks.length) === 1
                ? (t('agenda_result_one') || 'risultato')
                : (t('agenda_result_many') || 'risultati')}
            </span>
          )}
        </div>
      )}

      {(expandedEvents.length === 0 && allDueTasks.length === 0 && visibleAbsences.length === 0) ? (
        <div className="empty">
          <div className="empty-emoji">📅</div>
          <h3>{t('agenda_empty_h')}</h3>
          <p>{t('agenda_empty_p')}</p>
        </div>
      ) : (
        <>
          {/* === LISTA ITEMS DEL GIORNO === stile Apple Calendar:
              quando l'utente tappa un giorno (o default = oggi) vede SOLO
              quello che c'è in quel giorno. Niente più 3 sezioni
              Today/Upcoming/Past. */}
          {(() => {
            const dayItems = todayEvents.length > 0 || todayTasks.length > 0;
            const hasAnything = dayItems || todayAbsences.length > 0 || skippedForDay.length > 0;
            const dayLabel = isViewingOtherDay
              ? selectedDay.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
              : t('agenda_today') || 'Oggi';

            return (
              <div style={{ padding: '4px 16px 0' }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8,
                  marginBottom: 10,
                }}>
                  <h3 style={{
                    margin: 0, fontSize: 18, fontWeight: 700,
                    color: 'var(--k)',
                    textTransform: 'capitalize',
                    fontFamily: 'var(--fs)',
                  }}>{dayLabel}</h3>
                  {hasAnything && (
                    <span style={{ fontSize: 12, color: 'var(--km)', fontWeight: 600 }}>
                      · {todayEvents.length + todayTasks.length + todayAbsences.length}
                    </span>
                  )}
                </div>

                {/* Items: assenze prima (chi è via), poi eventi/task */}
                {todayAbsences.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                    {todayAbsences.map((a) => {
                      const member = members.find((m) => m.user_id === a.user_id);
                      const isMine = a.user_id === userId;
                      return (
                        <AbsenceCard key={`day-${a.id}`}
                          absence={a}
                          memberName={member?.name || a.member_name || 'Membro'}
                          isMine={isMine} isOngoing={true}
                          onClick={() => { setEditingAbsence(a); setShowAbsence(true); }}
                        />
                      );
                    })}
                  </div>
                )}

                {dayItems && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {renderItems(todayEvents, todayTasks, false)}
                  </div>
                )}

                {skippedForDay.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {skippedForDay.map((s) => (
                      <button key={s.id} data-testid={s.id}
                        type="button"
                        onClick={() => restoreSkippedOccurrence(s)}
                        title="Tocca per ripristinare questa occorrenza"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', marginBottom: 6, width: '100%',
                          background: 'var(--ab)', border: '1px dashed var(--sm)',
                          borderRadius: 12, opacity: 0.75, cursor: 'pointer',
                          textAlign: 'left', fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🚫</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: 'var(--km)',
                            textDecoration: 'line-through',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{s.title}</div>
                          <div style={{ fontSize: 10, color: 'var(--km)', marginTop: 1, opacity: 0.85 }}>
                            ↩️ tocca per ripristinare
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!hasAnything && (
                  <div style={{
                    padding: '32px 16px', textAlign: 'center',
                    color: 'var(--km)', fontSize: 14,
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🌤️</div>
                    {t('agenda_day_empty') || 'Nessun impegno per questo giorno'}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* Quick actions bottom-sheet (sostituisce il floating FAB).
          Triggered da "+" nel header. */}
      {showQuickActions && (
        <div
          data-testid="agenda-quick-actions-backdrop"
          onClick={() => setShowQuickActions(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(28,22,17,0.35)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="agenda-quick-actions-sheet"
            style={{
              width: '100%', maxWidth: 520, background: 'var(--w, #fff)',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 6,
              animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
            }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--sm)', margin: '0 auto 12px' }} />
            <ActionRow icon="🗓️" label={t('fab_new_event') || 'Nuovo evento'}
              testid="agenda-action-event"
              onClick={() => { setShowQuickActions(false); setShowAdd(true); }} />
            <ActionRow icon="📋" label={t('fab_new_task') || 'Nuovo incarico'}
              testid="agenda-action-task"
              onClick={() => { setShowQuickActions(false); setShowAddTask(true); }} />
            <ActionRow icon="🛒" label={t('fab_new_shopping') || 'Spesa'}
              accent="#6E87A0"
              testid="agenda-action-shopping"
              onClick={() => {
                setShowQuickActions(false);
                setAddPrefill({ title: t('shopping_task_title') || 'Spesa', category: 'spese', shopping: true });
                setShowAddTask(true);
              }} />
            <ActionRow icon="✈️" label={t('fab_new_absence') || 'Nuova assenza'}
              testid="agenda-action-absence"
              onClick={() => { setShowQuickActions(false); setShowAbsence(true); }} />
            {medTargets.length > 0 && (
              <ActionRow icon="💊" label={t('fab_new_med') || 'Nuova medicina'}
                accent="var(--gn)"
                testid="agenda-action-med"
                onClick={() => { setShowQuickActions(false); onClickNewMed(); }} />
            )}
            <button
              type="button"
              onClick={() => setShowQuickActions(false)}
              data-testid="agenda-actions-cancel"
              style={{
                marginTop: 6, padding: '12px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'var(--w, #fff)',
                fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
              }}>{t('cancel') || 'Annulla'}</button>
          </div>
        </div>
      )}

      {showAddTask && (
        <AddTaskModal
          familyId={isAll ? (families[0]?.id || null) : targetFamilyId}
          families={families}
          members={members}
          authorMemberId={me?.id}
          initialTitle={addPrefill?.title || ''}
          initialCategory={addPrefill?.category || null}
          shoppingMode={!!addPrefill?.shopping}
          initialChecklistOpen={!!addPrefill?.shopping}
          /* Prefill: se l'utente ha cliccato un giorno nel calendario,
             quel giorno viene precaricato come scadenza del task. */
          initialDueDate={selectedDay
            ? `${selectedDay.getFullYear()}-${String(selectedDay.getMonth()+1).padStart(2,'0')}-${String(selectedDay.getDate()).padStart(2,'0')}`
            : null}
          onClose={() => { setShowAddTask(false); setAddPrefill(null); }}
          onCreated={() => { setShowAddTask(false); setAddPrefill(null); onChanged(); }}
        />
      )}

      {/* Modal di MODIFICA task — aperto dal click sulla penna ✏️ nel
          TaskDetailModal. Pre-popola tutti i campi del task esistente. */}
      {editingTask && (
        <AddTaskModal
          familyId={editingTask.family_id || targetFamilyId}
          families={families}
          members={members}
          authorMemberId={me?.id}
          editingTask={editingTask}
          onClose={() => setEditingTask(null)}
          onCreated={() => { setEditingTask(null); onChanged(); }}
        />
      )}

      {showAdd && (
        <AddEventModal
          familyId={targetFamilyId}
          families={families}
          members={members}
          authorMemberId={me?.id}
          initialStartsAt={selectedDay
            ? `${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`
            : ''}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onChanged(); }}
        />
      )}

      {selEvent && (
        <EventDetailModal
          event={selEvent}
          families={families}
          members={members}
          me={me}
          onClose={() => setSelEvent(null)}
          onChanged={onChanged}
        />
      )}

      {selTask && (
        <TaskDetailModal
          task={selTask}
          members={members}
          me={me}
          onClose={() => setSelTask(null)}
          onChanged={() => { onChanged(); }}
          onClosed={() => setSelTask(null)}
          /* Fix: senza onEdit il click sulla penna ✏️ chiudeva solo il modale
             senza riaprire AddTaskModal in modalità edit. */
          onEdit={(taskToEdit) => setEditingTask(taskToEdit)}
        />
      )}

      {showCalendar && targetFamily && (
        <CalendarShareModal
          family={targetFamily}
          onClose={() => setShowCalendar(false)}
          onChanged={onChanged}
        />
      )}

      {showExportAll && families.length > 0 && (
        <ExportAllCalendarsModal
          families={families}
          onClose={() => setShowExportAll(false)}
          onChanged={onChanged}
        />
      )}

      {showAbsence && (
        <AbsenceModal
          session={session}
          profile={profile}
          families={families}
          tasks={tasks}
          members={members}
          editingAbsence={editingAbsence}
          onClose={() => { setShowAbsence(false); setEditingAbsence(null); }}
          onSaved={() => { setShowAbsence(false); setEditingAbsence(null); onChanged && onChanged(); }}
          onDeleted={() => { setShowAbsence(false); setEditingAbsence(null); onChanged && onChanged(); }}
        />
      )}

      {/* Care Hub aperto dal FAB "💊 Nuova medicina" */}
      {medsForMember && (
        <MedicationsModal
          member={medsForMember}
          me={me}
          initialTab="meds"
          onClose={() => { setMedsForMember(null); onChanged && onChanged(); }}
        />
      )}

      {/* Picker bottom-sheet: scegli per quale persona assistita.
          Mostrato solo se ci sono ≥2 assistiti. */}
      {showMedsPicker && (
        <div
          data-testid="meds-picker-backdrop"
          onClick={() => setShowMedsPicker(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(28,22,17,0.35)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="meds-picker-sheet"
            style={{
              width: '100%', maxWidth: 520, background: 'var(--w, #fff)',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 8,
              animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
              maxHeight: '70vh', overflowY: 'auto',
            }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--sm)', margin: '0 auto 8px' }} />
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--km)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              textAlign: 'center', marginBottom: 6,
            }}>
              {t('meds_picker_h') || 'Per chi vuoi aggiungere medicine?'}
            </div>
            {medTargets.map((m) => {
              const isSelf = m.user_id && m.user_id === session.user.id;
              const fam = families?.find((f) => f.id === m.family_id);
              const displayName = isSelf
                ? (t('meds_picker_self_name') || 'Per me')
                : m.name;
              const displaySub = isSelf
                ? (t('meds_picker_self_sub') || 'Le tue medicine')
                : fam ? `${fam.emoji} ${fam.name}` : null;
              return (
                <button
                  key={m.id} type="button"
                  data-testid={`meds-picker-item-${m.id}`}
                  onClick={() => { setShowMedsPicker(false); setMedsForMember(m); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 14,
                    border: `1.5px solid ${isSelf ? 'var(--ac)' : 'var(--sm)'}`,
                    background: isSelf ? 'var(--ab)' : 'white',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: m.avatar_color || 'var(--ac)', color: 'white',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 15, flexShrink: 0,
                  }}>
                    {isSelf ? '👤' : (m.avatar_letter || (m.name || '?').charAt(0).toUpperCase())}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{displayName}</div>
                    {displaySub && (
                      <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
                        {displaySub}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            <button
              type="button" onClick={() => setShowMedsPicker(false)}
              data-testid="meds-picker-cancel"
              style={{
                marginTop: 6, padding: '12px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'var(--w, #fff)',
                fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
              }}>{t('cancel') || 'Annulla'}</button>
          </div>
        </div>
      )}
    </>
  );
}

// === ABSENCE CARD ===
const ABSENCE_TONE = {
  vacation: { icon: '🏖️', color: '#2E7D52', bg: 'rgba(46,125,82,0.10)' },
  work:     { icon: '💼', color: '#2A6FDB', bg: 'rgba(42,111,219,0.10)' },
  health:   { icon: '🏥', color: '#C0392B', bg: 'rgba(192,57,43,0.10)' },
  other:    { icon: '✈️', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
};

function AbsenceCard({ absence, memberName, isMine, isOngoing, onClick }) {
  const { t: __t0, lang } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const localeMap = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  const tone = ABSENCE_TONE[absence.reason] || ABSENCE_TONE.other;
  const label = absenceLabel(absence);
  const range = fmtAbsenceRange(absence, localeMap[lang] || 'it-IT');
  return (
    <button
      type="button"
      data-testid={`agenda-absence-card-${absence.id}`}
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: 'left', width: '100%',
        padding: 12,
        background: tone.bg,
        border: `1.5px solid ${tone.color}`,
        borderRadius: 14,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        fontFamily: 'inherit',
      }}>
      <span style={{ fontSize: 26, lineHeight: 1, marginTop: 1 }}>{tone.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--k)' }}>{memberName}</span>
          {isMine && (
            <span style={{
              padding: '1px 8px', borderRadius: 100,
              background: 'var(--w, #fff)', border: `1px solid ${tone.color}`,
              color: tone.color, fontSize: 10, fontWeight: 700,
            }}>({t('you') || 'tu'})</span>
          )}
          {isOngoing && (
            <span style={{
              padding: '1px 8px', borderRadius: 100,
              background: tone.color, color: 'white',
              fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>● {t('absence_now_badge') || 'ora'}</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: tone.color, fontWeight: 600, marginTop: 2 }}>
          {label} · {range}
        </div>
        {absence.note && (
          <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 4 }}>{absence.note}</div>
        )}
      </div>
      {isMine && (
        <span style={{ color: tone.color, fontSize: 14, fontWeight: 700 }}>✏️</span>
      )}
    </button>
  );
}

// === EXPORT CALENDAR HELPERS ===

/**
 * Esporta gli eventi visibili nel calendario del telefono dell'utente.
 * Genera SEMPRE lo stesso file .ics (formato universale):
 *  - provider='apple': scarica e basta — iOS lo apre auto in Apple Calendar
 *  - provider='google': scarica + apre la pagina di import di Google Calendar
 *
 * Su Android, sia Apple-style download che Google aprono il file nel calendar
 * predefinito (di solito Google Calendar). Su desktop, Apple = download
 * generico, Google = apre la pagina di import nel browser.
 *
 * Filtra per esportFamilies se siamo in "tutte le famiglie".
 */
function exportToCalendar({ provider, events, tasks, families, targetFamily, isAll, exportFamilies, filterEvent, filterTask }) {
  // Determina quali family_id includere
  const allowedFamilyIds = isAll && exportFamilies !== null
    ? new Set(exportFamilies)
    : null; // null = no filtering aggiuntivo

  const visibleEvents = (events || []).filter((e) => {
    if (allowedFamilyIds && !allowedFamilyIds.has(e.family_id)) return false;
    return filterEvent({ ...e });
  });
  const visibleTasks = (tasks || []).filter((tk) => {
    if (!tk.due_date) return false;
    if (allowedFamilyIds && !allowedFamilyIds.has(tk.family_id)) return false;
    return filterTask(tk);
  });

  // Nome calendario (anche in base a famiglie scelte)
  let cn;
  if (isAll) {
    if (allowedFamilyIds && allowedFamilyIds.size < families.length) {
      const picked = families.filter((f) => allowedFamilyIds.has(f.id)).map((f) => f.name);
      cn = `FAMMY · ${picked.join(' + ')}`;
    } else {
      cn = 'FAMMY · Tutte le famiglie';
    }
  } else {
    cn = `FAMMY · ${targetFamily?.name || 'Agenda'}`;
  }
  const filename = `fammy-${(targetFamily?.name || 'agenda').toLowerCase().replace(/\s+/g, '-')}.ics`;

  downloadIcs({ events: visibleEvents, tasks: visibleTasks, calName: cn, filename });
  try { localStorage.setItem('fammy_exported_ics', '1'); } catch (e) {}

  // Toast contestuale + redirect Google se richiesto
  if (provider === 'google') {
    // Apre la pagina di "Importa" di Google Calendar in una nuova tab —
    // l'utente trascina/seleziona il .ics appena scaricato e lo importa.
    window.setTimeout(() => {
      window.open('https://calendar.google.com/calendar/u/0/r/settings/export', '_blank', 'noopener,noreferrer');
    }, 600);
    window.dispatchEvent(new CustomEvent('fammy_toast', {
      detail: {
        text: '📅 Calendario scaricato. Aprilo dalla pagina di Google Calendar che si è appena aperta.',
        tone: 'info',
      },
    }));
  } else {
    window.dispatchEvent(new CustomEvent('fammy_toast', {
      detail: {
        text: '📲 Calendario scaricato. Apri il file per aggiungerlo al tuo iPhone.',
        tone: 'success',
      },
    }));
  }
}

/**
 * ExportFamiliesPicker — chip toggle per scegliere quali famiglie includere
 * nell'export del calendario telefono. Visibile solo in modalità "Tutte".
 */
function ExportFamiliesPicker({ families, selected, onChange, t }) {
  const isAllSelected = selected.length === families.length;
  const toggle = (fid) => {
    if (selected.includes(fid)) {
      // Mai disabilitare tutto
      if (selected.length === 1) return;
      onChange(selected.filter((x) => x !== fid));
    } else {
      onChange([...selected, fid]);
    }
  };
  const setAll = () => onChange(families.map((f) => f.id));
  return (
    <div
      data-testid="export-families-picker"
      style={{
        padding: '10px 12px',
        background: 'var(--ab)',
        border: '1px solid var(--sm)',
        borderRadius: 12,
        marginBottom: 4,
      }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--km)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>📦 {t('export_pick_families') || 'Famiglie da esportare'}</span>
        {!isAllSelected && (
          <button type="button" onClick={setAll}
            data-testid="export-families-all"
            style={{
              background: 'transparent', border: 'none', padding: 0,
              color: 'var(--ac)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              textTransform: 'none', letterSpacing: 0,
            }}>{t('export_select_all') || 'Tutte'}</button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {families.map((f) => {
          const active = selected.includes(f.id);
          return (
            <button key={f.id} type="button"
              data-testid={`export-fam-${f.id}`}
              onClick={() => toggle(f.id)}
              style={{
                padding: '6px 12px', borderRadius: 100,
                border: `1.5px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
                background: active ? 'var(--ac)' : 'white',
                color: active ? 'white' : 'var(--k)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              {active && '✓ '}{f.emoji} {f.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ month, events, tasks = [], absences = [], members = [], familyId = null, selectedDay, onSelectDay, onPrev, onNext }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const weekdays = t('weekday_short');
  const months = t('months');

  // Animazione slide al cambio mese: setta una direzione (l/r) prima di
  // notificare il parent, poi la cleara dopo 300ms (durata animazione CSS).
  const [slideDir, setSlideDir] = useState(null);
  const prevMonthRef = useRef(month?.getTime());
  useEffect(() => {
    const cur = month?.getTime();
    if (prevMonthRef.current && cur !== prevMonthRef.current) {
      // Solo se l'animazione non è già stata settata dallo swipe
      const id = setTimeout(() => setSlideDir(null), 320);
      prevMonthRef.current = cur;
      return () => clearTimeout(id);
    }
    prevMonthRef.current = cur;
  }, [month]);

  const goPrev = () => { setSlideDir('right'); onPrev && onPrev(); };
  const goNext = () => { setSlideDir('left');  onNext && onNext(); };

  // Swipe orizzontale per cambiare mese (mobile + desktop).
  // Soglia: 60px orizzontale, max 40px verticale (per non confondere con scroll).
  const touchStart = useRef({ x: 0, y: 0, active: false });
  const onTouchStart = (e) => {
    const tc = e.touches?.[0] || e;
    touchStart.current = { x: tc.clientX, y: tc.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current.active) return;
    const tc = e.changedTouches?.[0] || e;
    const dx = tc.clientX - touchStart.current.x;
    const dy = tc.clientY - touchStart.current.y;
    touchStart.current.active = false;
    if (Math.abs(dy) > 40) return; // troppo verticale → è uno scroll
    if (Math.abs(dx) < 60) return; // troppo poco → click/tap
    if (dx > 0) goPrev();
    else goNext();
  };

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === year && today.getMonth() === m && today.getDate() === d;

  // Eventi, task e ASSENZE per giorno
  const itemsByDay = {};
  events.forEach((e) => {
    const d = new Date(e.starts_at);
    if (d.getFullYear() === year && d.getMonth() === m) {
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = { events: 0, tasks: 0, absences: 0 };
      itemsByDay[day].events += 1;
    }
  });
  tasks.forEach((tk) => {
    if (!tk.due_date) return;
    const d = new Date(tk.due_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === m) {
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = { events: 0, tasks: 0, absences: 0 };
      itemsByDay[day].tasks += 1;
    }
  });
  // Filtra assenze rilevanti a questa famiglia (o tutte se isAll/null)
  const relevantAbsences = (absences || []).filter((a) => {
    if (!familyId) return true; // isAll
    return Array.isArray(a.visible_to_families) && a.visible_to_families.includes(familyId);
  });
  // Per ogni giorno del mese, raccogli i colori dei membri assenti (max 4)
  // così possiamo dipingere pallini distinti per persona invece di tutti viola.
  // Fallback: se il membro non ha avatar_color, usa il viola "assenza generico".
  for (let d = 1; d <= daysInMonth; d++) {
    const isoDay = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    for (const a of relevantAbsences) {
      if (a.start_date <= isoDay && a.end_date >= isoDay) {
        if (!itemsByDay[d]) itemsByDay[d] = { events: 0, tasks: 0, absences: 0, absenceColors: [] };
        if (!itemsByDay[d].absenceColors) itemsByDay[d].absenceColors = [];
        itemsByDay[d].absences += 1;
        // Trova membro: prima per user_id, poi fallback per nome
        const member = (members || []).find((mm) =>
          (a.user_id && mm.user_id === a.user_id) ||
          (a.member_name && mm.name === a.member_name));
        const color = member?.avatar_color || '#7C3AED';
        if (!itemsByDay[d].absenceColors.includes(color)) {
          itemsByDay[d].absenceColors.push(color);
        }
      }
    }
  }

  return (
    <div
      className="month-grid-wrap"
      data-testid="month-grid-swipe"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        touchAction: 'pan-y', overflow: 'hidden',
        padding: '0 16px',
      }}>
      {/* Header: anno pill a sinistra (cliccabile per scegliere altro
          mese veloce in futuro), titolo mese GRANDE bold, niente ‹ ›
          decorative — l'utente swipe-a per cambiare mese. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '12px 0 4px',
      }}>
        <button
          type="button"
          onClick={goPrev}
          data-testid="month-prev-btn"
          aria-label="Mese precedente"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px 6px 10px', borderRadius: 100,
            background: 'var(--ab)', border: 'none',
            fontSize: 14, fontWeight: 600, color: 'var(--k)',
            cursor: 'pointer',
          }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span> {year}
        </button>
        <button
          type="button"
          onClick={goNext}
          data-testid="month-next-btn"
          aria-label="Mese successivo"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px 6px 12px', borderRadius: 100,
            background: 'var(--ab)', border: 'none',
            fontSize: 14, fontWeight: 600, color: 'var(--k)',
            cursor: 'pointer',
          }}>
          ›
        </button>
      </div>
      <h2 style={{
        margin: '0 0 12px',
        fontSize: 32, fontWeight: 800,
        letterSpacing: '-0.02em',
        color: 'var(--k)',
        fontFamily: 'var(--fs)',
      }}>
        {Array.isArray(months) ? months[m] : ''}
      </h2>

      <div
        key={`${year}-${m}`}
        className={slideDir === 'left' ? 'month-slide-in-r' : slideDir === 'right' ? 'month-slide-in-l' : ''}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 0, marginBottom: 4,
        borderBottom: '1px solid var(--sm)',
        paddingBottom: 6,
      }}>
        {Array.isArray(weekdays) && weekdays.map((w, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600,
            color: i >= 5 ? 'var(--km)' : 'var(--k)',
            letterSpacing: '0.04em',
          }}>{w}</div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        rowGap: 4, columnGap: 0,
      }}>
        {cells.map((d, i) => {
          const dayItems = d ? itemsByDay[d] : null;
          const eventCount = dayItems?.events || 0;
          const taskCount = dayItems?.tasks || 0;
          const absenceCount = dayItems?.absences || 0;
          const totalCount = eventCount + taskCount + absenceCount;
          const hasItems = totalCount > 0;
          const isSelected = d && selectedDay && selectedDay.getFullYear() === year && selectedDay.getMonth() === m && selectedDay.getDate() === d;
          const today_b = isToday(d);
          // Giorni passati: prima della data di oggi → grigi/sbiaditi
          const cellDate = d ? new Date(year, m, d) : null;
          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isPast = cellDate && cellDate < todayMidnight;
          const isWeekend = i % 7 >= 5;
          // Colore numero: oggi=accent, selezionato=k, passato=dim, weekend=km, normale=k
          const numColor = today_b
            ? 'var(--ac)'
            : isPast ? 'var(--sm-dark, #B8AC9A)'
            : isWeekend ? 'var(--km)'
            : 'var(--k)';

          return (
            <button
              key={i}
              data-testid={d ? `month-day-${d}` : `month-empty-${i}`}
              disabled={!d}
              onClick={() => d && onSelectDay(new Date(year, m, d))}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 0 6px',
                minHeight: 56,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: d ? 'pointer' : 'default',
                position: 'relative',
              }}>
              {d && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28,
                  borderRadius: '50%',
                  fontSize: 17, fontWeight: today_b ? 700 : 500,
                  color: today_b ? 'white' : numColor,
                  background: today_b ? 'var(--ac)' : 'transparent',
                  border: isSelected && !today_b ? '1.5px solid var(--ac)' : 'none',
                  lineHeight: 1,
                  fontFamily: 'var(--fs)',
                  transition: 'all 0.15s ease',
                }}>
                  {d}
                </span>
              )}
              {/* Pallini riassuntivi sotto il numero: max 3 colorati */}
              {hasItems && (
                <div style={{
                  display: 'flex', gap: 3, alignItems: 'center',
                  height: 6,
                }}>
                  {eventCount > 0 && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ac)' }} />
                  )}
                  {taskCount > 0 && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F39C12' }} />
                  )}
                  {absenceCount > 0 && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C3AED' }} />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      </div>{/* end month-slide-in wrapper */}
    </div>
  );
}

function CollapsibleSection({ label, count, open, onToggle, children, accent }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={onToggle} className="collapsible-header" style={accent ? { borderLeft: `3px solid ${accent}` } : {}}>
        <span className="collapsible-arrow" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
        <span className="collapsible-label">{label}</span>
        <span className="collapsible-count">{count}</span>
      </button>
      {open && <div className="list">{children}</div>}
    </div>
  );
}

function EventCard({ event, me, family, past, onRemove, onClick }) {
  const start = new Date(event.starts_at);
  const canDelete = !event.created_by || event.created_by === me?.id;
  const handleCardClick = (e) => {
    // Non scattare onClick se l'utente ha cliccato il bottone elimina
    if (e.target.closest('button')) return;
    onClick && onClick();
  };
  return (
    <div className="card" data-testid={`event-card-${event.id}`}
      onClick={handleCardClick}
      style={{ opacity: past ? 0.6 : 1, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="event-date">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
            {start.toLocaleDateString(undefined, { month: 'short' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--k)' }}>
            {start.getDate()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--km)' }}>
            {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            {event.title}
            {event._isRecurringInstance && <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>}
            {event.recurring_days && !event._isRecurringInstance && <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>}
          </div>
          {/* Riga compatta meta: ora + luogo (più visibile, in 1 colpo d'occhio) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            fontSize: 12, color: 'var(--km)', marginTop: 4, fontWeight: 600,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              🕐 {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            {event.location && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                · 📍 {event.location}
              </span>
            )}
          </div>
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
          {event.description && <div style={{ color: 'var(--km)', fontSize: 13, marginTop: 4 }}>{event.description}</div>}
        </div>
        {canDelete && (
          <button onClick={onRemove}
            style={{ background: 'none', border: 'none', color: 'var(--km)', fontSize: 16, padding: 4 }}
            title="Elimina (solo creatore)">✕</button>
        )}
      </div>
    </div>
  );
}

// Card per task con due_date mostrato in agenda
function TaskAsEventCard({ task, family, past, onClick }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const due = new Date(task.due_date + 'T00:00:00');
  const priority = task.priority || (task.urgent ? 'high' : 'normal');
  const accentColor = priority === 'high' ? 'var(--rd)' : '#F39C12';
  const isUndated = !!task._undated;
  return (
    <div className="card" onClick={onClick} style={{
      opacity: past ? 0.6 : 1, cursor: 'pointer',
      borderLeft: `4px solid ${accentColor}`,
      background: priority === 'high' ? 'var(--rd)11' : '#F39C1211',
      borderStyle: isUndated ? 'dashed' : 'solid',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="event-date">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
            {due.toLocaleDateString(undefined, { month: 'short' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--k)' }}>{due.getDate()}</div>
          <div style={{ fontSize: 11, color: '#F39C12', fontWeight: 700 }}>📋</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            {priority === 'high' && <span>🚨</span>}
            <span>{TASK_CAT_EMOJI[task.category] || '📌'}</span>
            <span>{task.title}</span>
            {(task._isRecurringInstance || (task.recurring_days && task.recurring_days.length > 0)) && (
              <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>
            )}
          </div>
          {/* Riga meta: ora (se presente) + luogo */}
          {(task.due_time || task.location) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: 12, color: 'var(--km)', marginTop: 4, fontWeight: 600,
            }}>
              {task.due_time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  🕐 {task.due_time}
                </span>
              )}
              {task.location && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {task.due_time && '· '}📍 {task.location}
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {isUndated ? (
              <span
                title={`${t('agenda_task_undated_hint') || 'Mostrato qui perché non ha una data: l\'hai creato il'} ${due.toLocaleDateString()}`}
                style={{
                  padding: '2px 8px', borderRadius: 100,
                  background: 'var(--ab)', color: 'var(--km)',
                  fontSize: 11, fontWeight: 600,
                  border: '1px dashed var(--sm)',
                }}>📅 {t('agenda_task_undated') || 'Senza data'}</span>
            ) : (
              <span style={{
                padding: '2px 8px', borderRadius: 100,
                background: '#F39C1222', color: '#B36E00',
                fontSize: 11, fontWeight: 600,
              }}>Incarico</span>
            )}
            {family && (
              <span style={{
                padding: '2px 8px', borderRadius: 100,
                background: family.color ? family.color + '22' : 'var(--sm)',
                color: family.color || 'var(--km)',
                fontSize: 11, fontWeight: 600,
              }}>
                {family.emoji} {family.name}
              </span>
            )}
            {task.note && <span style={{ fontSize: 12, color: 'var(--km)' }}>{task.note}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Toggle compatto Mese ↔ Settimana sopra il calendario
function MonthWeekToggle({ viewMode, onChange, t }) {
  return (
    <div style={{
      padding: '0 16px 8px',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        display: 'inline-flex', gap: 4, padding: 3,
        background: 'var(--ab)', borderRadius: 100,
        border: '1px solid var(--sm)',
      }} role="tablist">
        {[
          { id: 'month', label: t('agenda_view_month') || 'Mese', emoji: '📅' },
          { id: 'week',  label: t('agenda_view_week') || 'Settimana', emoji: '📆' },
        ].map((opt) => {
          const active = viewMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.id)}
              data-testid={`agenda-view-${opt.id}`}
              style={{
                padding: '6px 14px', borderRadius: 100, border: 'none',
                background: active ? 'white' : 'transparent',
                color: active ? 'var(--k)' : 'var(--km)',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms ease',
              }}>
              {opt.emoji} {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
