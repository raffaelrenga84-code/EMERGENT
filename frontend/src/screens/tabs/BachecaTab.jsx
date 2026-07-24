import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import BirthdayReminder from '../../components/BirthdayReminder.jsx';
import FamilyOfferBanner from '../../components/FamilyOfferBanner.jsx';
import DomainMigrationBanner from '../../components/DomainMigrationBanner.jsx';
import FriendJoinedBanner from '../../components/FriendJoinedBanner.jsx';
import AddTaskModal from '../../components/AddTaskModal.jsx';
import AddEventModal from '../../components/AddEventModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import OnboardingChecklist from '../../components/OnboardingChecklist.jsx';
import SwipeableRow from '../../components/SwipeableRow.jsx';
import AbsenceModal from '../../components/AbsenceModal.jsx';
import FabSpeedDial from '../../components/FabSpeedDial.jsx';
import MedicationsModal from '../../components/MedicationsModal.jsx';
import CaregiverGreeting from '../../components/CaregiverGreeting.jsx';
import DonateBanner from '../../components/DonateBanner.jsx';
import DonateModal from '../../components/DonateModal.jsx';
import FeedbackModal from '../../components/FeedbackModal.jsx';
import { markFirstTaskCreated } from '../../lib/installPrompt.js';
import { dedupeByUser } from '../../lib/memberDedupe.js';
import { sendPush, memberIdsToUserIds } from '../../lib/pushClient.js';

const CAT = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

export default function BachecaTab({ familyId, families, tasks, members, taskAssignees = [], taskMeta = {}, absences = [], profile, me, session, isAll, onChanged, onOpenExpenseForTask, openTaskId, onTaskOpened , openMedsMemberId, onMedsOpened }) {
  const allMembers = members;
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  const [showAdd, setShowAdd] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  // Prefill per "Fare la spesa" dal FAB (titolo + categoria già impostati)
  const [addPrefill, setAddPrefill] = useState(null);
  const [showAbsence, setShowAbsence] = useState(false);
  const [medsForMember, setMedsForMember] = useState(null);
  const [showMedsPicker, setShowMedsPicker] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selTask, setSelTask] = useState(null);
  // Lightbox foto aperto direttamente dalla card: { photos: [{id,url}], index }
  const [photoLightbox, setPhotoLightbox] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [openSections, setOpenSections] = useState({ mine: true, all: true, done: false });
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(null);
  // Filtro rapido in cima alla bacheca: todo (default) | all | mine | urgent | followup
  const [quickFilter, setQuickFilter] = useState('todo');
  // Filtro temporale per archivio "Fatti": '7d' (default) | '30d' | 'all'
  const [donesRange, setDonesRange] = useState('7d');
  // Idle-pulse: se l'utente non fa nulla per ~1s, il FAB "+" pulsa per
  // richiamare l'attenzione. Si ripete ogni ~3s finché resta inattivo.
  const [idlePulse, setIdlePulse] = useState(false);

  useEffect(() => {
    let idleStartTimer = null;
    let pulseOffTimer = null;
    let nextPulseTimer = null;

    const stopAll = () => {
      if (idleStartTimer) clearTimeout(idleStartTimer);
      if (pulseOffTimer) clearTimeout(pulseOffTimer);
      if (nextPulseTimer) clearTimeout(nextPulseTimer);
    };

    const pulseLoop = () => {
      setIdlePulse(true);
      // Animazione fammy-fab-attract dura 1400ms → lascia un piccolo cuscino
      pulseOffTimer = setTimeout(() => {
        setIdlePulse(false);
        nextPulseTimer = setTimeout(pulseLoop, 1400); // pausa fra pulse
      }, 1500);
    };

    const startIdle = () => {
      idleStartTimer = setTimeout(pulseLoop, 1000); // 1s di idle → primo pulse
    };

    const reset = () => {
      stopAll();
      setIdlePulse(false);
      startIdle();
    };

    startIdle();
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'keydown', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      stopAll();
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);
  // Mappa { taskId: [{id, text, created_at, author_id}] } caricata on-demand
  // quando il filtro 'followup' è attivo: mini-timeline degli ultimi system msg.
  const [followUpHistory, setFollowUpHistory] = useState({});
  const family = families?.find((f) => f.id === familyId);

  // Auto-apre il TaskDetailModal quando arriva una richiesta esterna (push
  // notification cliccata → HomeScreen passa `openTaskId`). Una volta aperto,
  // notifica al parent così non rifa l'auto-open al refresh successivo.
  useEffect(() => {
    if (!openTaskId) return;
    const target = (tasks || []).find((tk) => tk.id === openTaskId);
    if (target) {
      setSelTask(target);
      onTaskOpened && onTaskOpened();
    }
  }, [openTaskId, tasks, onTaskOpened]);

  // Apre il Care Hub sul membro indicato da una notifica medicine
  // (promemoria dose / dose non registrata / scorte). Speculare a openTaskId.
  useEffect(() => {
    if (!openMedsMemberId) return;
    const target = (members || []).find((m) => m.id === openMedsMemberId);
    if (target) {
      setMedsForMember(target);
      onMedsOpened && onMedsOpened();
    }
  }, [openMedsMemberId, members, onMedsOpened]);

  const ST_LABEL = {
    todo: t('section_todo'), taken: 'In carico', done: 'Fatto', to_pay: 'Da pagare',
  };

  const assigneesForTask = (taskId) => {
    const memberIds = taskAssignees.filter((a) => a.task_id === taskId).map((a) => a.member_id);
    if (memberIds.length === 0) {
      const t = tasks.find((x) => x.id === taskId);
      if (t?.assigned_to) {
        const m = members.find((x) => x.id === t.assigned_to);
        return m ? [m] : [];
      }
      return [];
    }
    return memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  };

  // Un task è in "Solo le mie da fare" quando:
  //  - delegated_to === me → qualcuno mi ha chiesto "Lo fai tu?"
  //  - sono l'UNICO assegnatario → ho cliccato "Me ne occupo io"
  // L'assegnazione di gruppo (più persone) resta in "Tutte".
  // Lo status non è rilevante: anche un task 'todo' su cui sono unico
  // responsabile è "mio". Il flag 'taken' è un dettaglio di workflow,
  // non un criterio di visibilità.
  const isMine = (task) => {
    if (!me) return false;
    if (task.delegated_to && task.delegated_to === me.id) return true;
    const list = assigneesForTask(task.id);
    return list.length === 1 && list[0].id === me.id;
  };

  // Una task è "da seguire" se l'ho creata io ma NON è assegnata solo a me
  // (ovvero: l'ho delegata ad altri / a tutta la famiglia → voglio fare follow-up).
  const isFollowUp = (task) => {
    if (!me || task.status === 'done') return false;
    if (task.author_id !== me.id) return false;
    return !isMine(task);
  };

  const todos = tasks.filter((task) => task.status !== 'done');
  const dones = tasks.filter((task) => task.status === 'done');
  const myTasks = todos.filter(isMine);
  const otherTasks = todos.filter((t) => !isMine(t));
  const followUpTasks = todos.filter(isFollowUp);

  // ===== Chat non lette (stile WhatsApp) =====
  // Tracking "visto" per device via localStorage: un task ha chat non letta
  // se l'ultimo messaggio è di qualcun altro ed è successivo all'ultima
  // apertura del dettaglio su questo dispositivo.
  const [chatSeen, setChatSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fammy_chat_seen_v1')) || {}; }
    catch (_) { return {}; }
  });
  const markChatSeen = (taskId) => {
    setChatSeen((prev) => {
      const next = { ...prev, [taskId]: new Date().toISOString() };
      try { localStorage.setItem('fammy_chat_seen_v1', JSON.stringify(next)); } catch (_) { /* ignore */ }
      return next;
    });
  };
  const myMemberIds = new Set(
    (members || []).filter((m) => m.user_id === session.user.id).map((m) => m.id)
  );
  const hasUnreadChat = (task) => {
    const m = taskMeta[task._origId || task.id];
    if (!m?.lastMsg?.at) return false;
    if (m.lastMsg.author_id && myMemberIds.has(m.lastMsg.author_id)) return false;
    const seen = chatSeen[task._origId || task.id];
    return !seen || new Date(m.lastMsg.at) > new Date(seen);
  };

  // Ordinamento "novità in alto" (come WhatsApp): prima i task con chat non
  // letta (più recente in cima), poi urgenti/medi, poi il resto nell'ordine
  // consueto (Array.sort è stabile).
  const prioRank = (x) => ((x.priority === 'high' || x.urgent) ? 2 : x.priority === 'medium' ? 1 : 0);
  const lastMsgTime = (task) => {
    const m = taskMeta[task._origId || task.id];
    return m?.lastMsg?.at ? new Date(m.lastMsg.at).getTime() : 0;
  };
  const sortByNews = (list) => [...list].sort((a, b) => {
    const ua = hasUnreadChat(a) ? 1 : 0;
    const ub = hasUnreadChat(b) ? 1 : 0;
    if (ua !== ub) return ub - ua;
    if (ua && ub) return lastMsgTime(b) - lastMsgTime(a);
    const pa = prioRank(a);
    const pb = prioRank(b);
    if (pa !== pb) return pb - pa;
    return 0;
  });

  // Filtri rapidi applicati ai TODO
  const applyQuickFilter = (list) => {
    if (quickFilter === 'all')      return list;
    if (quickFilter === 'todo')     return list.filter((x) => x.status !== 'done');
    if (quickFilter === 'urgent')   return list.filter((x) => (x.priority === 'high') || x.urgent);
    if (quickFilter === 'mine')     return list.filter(isMine);
    if (quickFilter === 'followup') return list.filter(isFollowUp);
    return list;
  };

  // Filtri applicati alla sezione "✓ Fatti" — usano lo stesso quickFilter
  // ma ignorano 'todo' (perché contraddittorio: una task done non è "da fare").
  const applyQuickFilterToDones = (list) => {
    if (quickFilter === 'urgent')   return list.filter((x) => (x.priority === 'high') || x.urgent);
    if (quickFilter === 'mine')     return list.filter(isMine);
    if (quickFilter === 'followup') return list.filter((x) => me && x.author_id === me.id);
    return list; // 'all' e 'todo' → tutto l'archivio
  };

  const visibleMyTasks    = applyQuickFilter(myTasks);
  const visibleOtherTasks = applyQuickFilter(otherTasks);
  // Pre-filtra per quick filter; il filtro temporale viene applicato dopo.
  const filteredDones     = applyQuickFilterToDones(dones);

  // Carica la cronologia (system messages) quando il filtro 'followup' è
  // attivo. Una sola query batch per tutti i task_id in follow-up.
  useEffect(() => {
    if (quickFilter !== 'followup' || followUpTasks.length === 0) {
      return;
    }
    let cancelled = false;
    const taskIds = followUpTasks.map((t) => t._origId || t.id);
    (async () => {
      const { data } = await supabase
        .from('task_responses')
        .select('id, task_id, text, created_at, author_id, type')
        .eq('type', 'system')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });
      if (cancelled || !data) return;
      // Raggruppa per task_id e tieni solo i primi 3 (sono già DESC)
      const grouped = {};
      for (const row of data) {
        if (!grouped[row.task_id]) grouped[row.task_id] = [];
        if (grouped[row.task_id].length < 3) grouped[row.task_id].push(row);
      }
      setFollowUpHistory(grouped);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, followUpTasks.map((t) => t.id).join(',')]);

  const openPriorityMenu = (e, task) => {
    e.stopPropagation();
    if (task.status === 'done') return;
    setPriorityMenuOpen({ taskId: task.id });
  };

  const setPriority = async (taskId, priority) => {
    await supabase.from('tasks').update({
      priority, urgent: priority === 'high',
    }).eq('id', taskId);
    setPriorityMenuOpen(null);
    onChanged();
  };

  // === Swipe actions ===
  // 🔔 Push al CREATORE del task (e agli altri assegnatari) quando qualcuno
  // agisce con le swipe actions. Chi clicca è SEMPRE escluso: a lui non
  // serve la notifica della propria azione.
  const notifyQuickAction = async (task, title) => {
    try {
      const id = task._origId || task.id;
      const recipients = new Set();
      if (task.author_id) recipients.add(task.author_id);
      for (const a of assigneesForTask(task.id)) if (a?.id) recipients.add(a.id);
      if (me?.id) recipients.delete(me.id);
      const userIds = await memberIdsToUserIds([...recipients]);
      if (me?.user_id) userIds.delete(me.user_id);
      if (userIds.size === 0) return;
      sendPush({
        userIds: [...userIds],
        title,
        body: task.title || '',
        tag: `task-action-${id}`,
        data: { task_id: id, kind: 'task' },
      });
    } catch (_) { /* push best-effort */ }
  };
  const myFirstName = () => (me?.name || '').split(' ')[0] || 'Qualcuno';
  // Traduzione con fallback robusto: se la chiave non esiste, t() restituisce
  // la chiave stessa (non una stringa vuota) → qui lo intercettiamo e usiamo
  // il fallback. Evita di mostrare la chiave grezza per stringhe non ancora
  // tradotte in i18n.jsx.
  const tf = (key, fallback) => { const v = t(key); return (!v || v === key) ? fallback : v; };

  // Azioni rapide offline: avvisa invece di fallire in silenzio
  const guardOnline = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      alert(t('offline_warn') || "⚠️ Nessuna connessione: l'azione non è stata salvata. Riprova quando sei online.");
      return false;
    }
    return true;
  };

  const quickToggleDone = async (task) => {
    if (!guardOnline()) return;
    // Per le istanze ricorrenti, l'id reale è in _origId (le ricorrenze
    // sono soggette a un workflow speciale; per swipe veloce trattiamo
    // l'intera serie).
    const id = task._origId || task.id;
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: nextStatus }).eq('id', id);
    if (nextStatus === 'done') {
      notifyQuickAction(task, `✅ ${myFirstName()} ${t('push_act_done') || 'ha completato'}`);
    }
    onChanged();
  };

  // === Task in ritardo: azioni rapide ===
  const localTodayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // In ritardo = scadenza passata, non fatto, non ricorrente
  // (le ricorrenze hanno il loro workflow e non vanno "spostate").
  const isOverdueTask = (x) =>
    x.due_date && x.due_date < localTodayYMD() &&
    x.status !== 'done' && !x._origId &&
    !(x.recurring_days && x.recurring_days.length > 0);

  const quickMoveToToday = async (task) => {
    if (!guardOnline()) return;
    await supabase.from('tasks').update({ due_date: localTodayYMD() }).eq('id', task.id);
    onChanged();
  };

  // Rimanda a domani (solo task singoli con scadenza, non ricorrenti)
  const quickPostponeTomorrow = async (task) => {
    if (!guardOnline()) return;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await supabase.from('tasks').update({ due_date: ymd }).eq('id', task.id);
    notifyQuickAction(task, `📅 ${myFirstName()} ${tf('push_act_postponed', 'ha rimandato a domani')}`);
    onChanged();
  };

  // Vedi TaskDetailModal: in vista "Tutte" `me` puo' essere il membro di
  // un'altra famiglia. Qui risolviamo il membro giusto per l'incarico.
  const meForTask = (task) => {
    if (!me) return null;
    const fid = task?.family_id;
    if (!fid) return me;
    return allMembers.find(
      (m) => m.user_id === me.user_id && m.family_id === fid
    ) || null;
  };

  const quickAssignMe = async (task) => {
    if (!guardOnline()) return;
    if (!me) return;
    const mine = meForTask(task);
    if (!mine) {
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: t('claim_wrong_family') || 'Non risulti membro di questa famiglia.', tone: 'error' },
      }));
      return;
    }
    const id = task._origId || task.id;
    // Rimuovi assignees attuali e aggiungi me. L'INSERT viene verificato:
    // se fallisce si ripristinano gli assegnatari precedenti, per non
    // lasciare l'incarico orfano (bug "incarico sparito").
    const prev = taskAssignees.filter((a) => a.task_id === id).map((a) => a.member_id);
    await supabase.from('task_assignees').delete().eq('task_id', id);
    const { error: insErr } = await supabase
      .from('task_assignees').insert({ task_id: id, member_id: mine.id });
    if (insErr) {
      if (prev.length > 0) {
        await supabase.from('task_assignees')
          .insert(prev.map((mid) => ({ task_id: id, member_id: mid })));
      }
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: (t('claim_failed') || 'Non sono riuscito ad assegnarti l\u2019incarico: ') + insErr.message, tone: 'error' },
      }));
      return;
    }
    await supabase.from('tasks').update({
      status: 'taken', urgent: false, priority: 'normal',
      delegated_to: null,
    }).eq('id', id);
    notifyQuickAction(task, `✋ ${myFirstName()} ${t('push_act_claim') || 'se ne occupa'}`);
    onChanged();
  };

  // Quick "Non posso": senza modificare lo stato del task, inserisce un
  // messaggio di sistema in chat per notificare gli altri. Lo snapshot
  // del nome viene salvato dal trigger BEFORE INSERT (iter 16.5.24).
  const quickDecline = async (task) => {
    if (!guardOnline()) return;
    if (!me) return;
    const id = task._origId || task.id;
    await supabase.from('task_responses').insert({
      task_id: id,
      author_id: me.id,
      type: 'system',
      text: `🤚 ${me.name || ''} ${t('decline_msg') || 'non può occuparsene'}`.trim(),
    });
    // Se ero io assegnato, mi rimuovo (così il task torna "libero")
    if (me.id) {
      await supabase.from('task_assignees').delete()
        .eq('task_id', id).eq('member_id', me.id);
    }
    notifyQuickAction(task, `🤚 ${myFirstName()} ${t('push_act_decline') || 'non può occuparsene'}`);
    onChanged();
  };

  // Quick "Ho un imprevisto" — per un incarico già tuo: lo rimette tra i
  // "da fare" per tutti, lo segna urgente così emerge ("serve aiuto"),
  // scrive un messaggio di sistema e notifica. Stessa semantica di
  // `unassignMe` nel modale dettagli (riassegna l'eventuale gruppo originale).
  const quickUnexpected = async (task) => {
    if (!guardOnline()) return;
    if (!me) return;
    const id = task._origId || task.id;
    await supabase.from('task_assignees').delete().eq('task_id', id);
    let restoreIds = [];
    if (Array.isArray(task.delegated_from) && task.delegated_from.length > 0) {
      restoreIds = task.delegated_from.filter((x) => x !== me.id);
    } else {
      restoreIds = assigneesForTask(task.id).filter((a) => a.id !== me.id).map((a) => a.id);
    }
    if (restoreIds.length > 0) {
      await supabase.from('task_assignees').insert(
        restoreIds.map((mid) => ({ task_id: id, member_id: mid }))
      );
    }
    await supabase.from('task_responses').insert({
      task_id: id, author_id: me.id,
      text: t('td_sys_unexpected'), type: 'system',
    });
    await supabase.from('tasks').update({
      status: restoreIds.length === 0 ? 'todo' : 'taken',
      urgent: true, priority: 'high',
      delegated_from: null, delegated_to: null,
    }).eq('id', id);
    notifyQuickAction(task, `🚨 ${myFirstName()} ${tf('push_act_unexpected', 'ha un imprevisto — serve aiuto')}`);
    onChanged();
  };

  const getFamily = (task) => families?.find((f) => f.id === task.family_id);
  const targetFamilyId = familyId || families?.[0]?.id;
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // Membri assistiti accessibili (limitati al family scope se non "Tutte").
  // Usati per popolare la voce FAB "💊 Nuova medicina".
  // DEDUPE: se sono membro di più famiglie, il mio stesso user_id appare
  // in più member rows → mostro una sola entry per persona (la prima).
  // SORT: me stesso ("Per me") sempre in cima per discoverability.
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
      // Succede quando l'account dell'utente non è collegato a nessun
      // member (user_id null): mai fallire in silenzio, spiega il perché.
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



  // Costruisce le actions del FAB. La voce "Nuova medicina" appare solo
  // se ci sono membri assistiti accessibili (anche se sei tu stesso).
  const buildFabActions = (testidPrefix) => {
    const list = [
      { id: 'task',    icon: '📋', label: t('fab_new_task') || 'Nuovo incarico', onClick: () => setShowAdd(true), testid: `${testidPrefix}-new-task` },
      { id: 'event',   icon: '🗓️', label: t('fab_new_event') || 'Nuovo evento', onClick: () => setShowAddEvent(true), testid: `${testidPrefix}-new-event` },
      { id: 'shopping', icon: '🛒',
        label: t('fab_new_shopping') || 'Spesa',
        onClick: () => {
          setAddPrefill({ title: t('shopping_task_title') || 'Spesa', category: 'spese', shopping: true });
          setShowAdd(true);
        },
        testid: `${testidPrefix}-new-shopping`,
        color: '#6E87A0',
      },
      { id: 'absence', icon: '✈️', label: t('fab_new_absence') || 'Nuova assenza', onClick: () => setShowAbsence(true), testid: `${testidPrefix}-new-absence` },
    ];
    // "Nuova medicina" è sempre disponibile: con assistiti apre il picker,
    // senza assistiti apre direttamente le medicine dell'utente stesso.
    // Se l'account non è collegato a un member, onClickNewMed mostra un
    // toast esplicativo invece di un pulsante che non fa nulla.
    list.push({
      id: 'med', icon: '💊',
      label: t('fab_new_med') || 'Nuova medicina',
      onClick: onClickNewMed,
      testid: `${testidPrefix}-new-med`,
      color: 'var(--gn)',
    });
    // Voce extra "feedback" — separata visivamente dalle 3 azioni produttive
    // tramite una proprietà `divider: true` (resa nel FabSpeedDial se la
    // supporta) e un colore neutro. Lascia all'utente un canale rapido per
    // farci sapere come va l'app, senza ingombrare il flusso principale.
    list.push({
      id: 'feedback', icon: '💬',
      label: t('fab_send_feedback') || 'Manda un feedback',
      onClick: () => setShowFeedback(true),
      testid: `${testidPrefix}-feedback`,
      color: '#7A6F62',
      divider: true,
    });
    return list;
  };

  const renderTaskList = (list) => (
    <div className="list">
      {list.map((task) => {
        const isDone = task.status === 'done';
        const isAssignedToMe = me && (
          (task.delegated_to && task.delegated_to === me.id) ||
          (assigneesForTask(task.id).length === 1 && assigneesForTask(task.id)[0].id === me.id)
        );
        // Swipe LEFT: azioni positive (mai distruttive). L'eliminazione
        // resta gestita solo dal modal di dettaglio (richiede conferma +
        // verifica autore).
        const rightActions = isDone
          ? [{
              id: 'undo',
              icon: '↩️',
              label: t('swipe_undo') || 'Riapri',
              color: '#F39C12',
              testid: `swipe-undo-${task.id}`,
              onAction: () => quickToggleDone(task),
            }]
          : isAssignedToMe
          ? [
              {
                id: 'done',
                icon: '✓',
                label: t('swipe_done') || 'Fatto',
                color: 'var(--gn)',
                testid: `swipe-done-${task.id}`,
                onAction: () => quickToggleDone(task),
              },
              // "→ Domani" solo per task singoli con scadenza: rimandare
              // è un'azione di chi se ne occupa. Le ricorrenze sono escluse
              // (hanno il loro calendario) e senza scadenza non ha senso.
              ...(task.due_date && !task._origId && !(task.recurring_days && task.recurring_days.length > 0)
                ? [{
                    id: 'tomorrow',
                    icon: '📅',
                    label: tf('swipe_tomorrow', '→ Domani'),
                    color: '#6E87A0',
                    testid: `swipe-tomorrow-${task.id}`,
                    onAction: () => quickPostponeTomorrow(task),
                  }]
                : []),
              {
                id: 'unexpected',
                icon: '🚨',
                label: tf('swipe_unexpected', 'Ho un imprevisto'),
                color: 'var(--rd)',
                testid: `swipe-unexpected-${task.id}`,
                onAction: () => quickUnexpected(task),
              },
            ]
          : [
              {
                id: 'done',
                icon: '✓',
                label: t('swipe_done') || 'Fatto',
                color: 'var(--gn)',
                testid: `swipe-done-${task.id}`,
                onAction: () => quickToggleDone(task),
              },
              {
                id: 'claim',
                icon: '✋',
                label: t('swipe_claim') || 'Me ne occupo',
                color: 'var(--ac)',
                testid: `swipe-claim-${task.id}`,
                onAction: () => quickAssignMe(task),
              },
              {
                id: 'decline',
                icon: '🤚',
                label: t('swipe_decline') || 'Non posso',
                color: 'var(--rd)',
                testid: `swipe-decline-${task.id}`,
                onAction: () => quickDecline(task),
              },
            ];
        // Swipe RIGHT: azione veloce contestuale (singola, identica a quella
        // rapida dello swipe sinistro nello stato corrente).
        const leftAction = isDone
          ? {
              id: 'undo',
              icon: '↩️',
              label: t('swipe_undo') || 'Riapri',
              color: '#F39C12',
              testid: `swipe-quick-undo-${task.id}`,
              onAction: () => quickToggleDone(task),
            }
          : isAssignedToMe
          ? {
              id: 'quickdone',
              icon: '✓',
              label: t('swipe_done') || 'Fatto',
              color: 'var(--gn)',
              testid: `swipe-quickdone-${task.id}`,
              onAction: () => quickToggleDone(task),
            }
          : {
              id: 'assign',
              icon: '✋',
              label: t('swipe_claim') || 'Me ne occupo',
              color: 'var(--ac)',
              testid: `swipe-quick-claim-${task.id}`,
              onAction: () => quickAssignMe(task),
            };
        return (
          <SwipeableRow
            key={task.id}
            rightActions={rightActions}
            leftAction={leftAction}
            disabled={priorityMenuOpen?.taskId === task.id}
            testidContainer={`task-swipe-${task.id}`}
          >
            <TaskCard
              task={task}
              meta={taskMeta[task._origId || task.id]}
              unread={hasUnreadChat(task)}
              onOpenPhoto={(idx) => setPhotoLightbox({
                photos: taskMeta[task._origId || task.id]?.photos || [],
                index: idx,
              })}
              family={isAll ? getFamily(task) : null}
              assignees={assigneesForTask(task.id)}
              statusLabel={ST_LABEL[task.status]}
              isFollowUp={isFollowUp(task)}
              followUpLabel={t('badge_follow_up') || '✏️ Creata da te'}
              followUpHistory={
                quickFilter === 'followup' && isFollowUp(task)
                  ? (followUpHistory[task._origId || task.id] || [])
                  : []
              }
              members={members}
              onClick={() => {
                if (priorityMenuOpen?.taskId === task.id) {
                  setPriorityMenuOpen(null);
                } else {
                  markChatSeen(task._origId || task.id);
                  setSelTask(task);
                }
              }}
              onCheck={(e) => openPriorityMenu(e, task)}
              priorityMenu={priorityMenuOpen?.taskId === task.id}
              onSetPriority={(p) => setPriority(task.id, p)}
              onClosePriorityMenu={() => setPriorityMenuOpen(null)}
            />
          </SwipeableRow>
        );
      })}
    </div>
  );

  if (tasks.length === 0) {
    return (
      <>
        <div className="empty">
          <div className="empty-emoji">📋</div>
          <h3>{t('bacheca_empty_h')}</h3>
          <p>{t('bacheca_empty_p')}</p>
        </div>
        <FabSpeedDial
          testid="bacheca-fab"
          actions={buildFabActions('bacheca-fab')}
          pulse={idlePulse}
        />
        {showAdd && (
          <AddTaskModal familyId={targetFamilyId} families={families} members={allMembers}
            authorMemberId={me?.id}
            absences={absences}
            initialTitle={addPrefill?.title || ''}
            initialCategory={addPrefill?.category || null}
            shoppingMode={!!addPrefill?.shopping}
            initialChecklistOpen={!!addPrefill?.shopping}
            onClose={() => { setShowAdd(false); setAddPrefill(null); }}
            onCreated={() => { setShowAdd(false); setAddPrefill(null); onChanged(); }} />
        )}
        {showAddEvent && (
          <AddEventModal familyId={targetFamilyId} families={families} members={allMembers}
            authorMemberId={me?.id}
            onClose={() => setShowAddEvent(false)}
            onCreated={() => { setShowAddEvent(false); onChanged(); }} />
        )}
        {showAbsence && (
          <AbsenceModal session={session} profile={profile} families={families}
            tasks={tasks} members={allMembers}
            onClose={() => setShowAbsence(false)}
            onSaved={() => { setShowAbsence(false); onChanged(); }}
            onDeleted={() => { setShowAbsence(false); onChanged(); }} />
        )}
      </>
    );
  }

  return (
    <>
      <CaregiverGreeting session={session} members={members} me={me} />

      {/* Banner "Offrici un caffè" — appare in momenti di valore percepito alto */}
      <DonateBanner
        onOpen={() => setShowDonate(true)}
        completedTaskCount={dones.length}
      />

      <FriendJoinedBanner session={session} families={families} />
      <DomainMigrationBanner />
      <FamilyOfferBanner session={session} onChanged={onChanged} />
      <BirthdayReminder members={members} session={session} familyId={familyId} families={families} />

      {/* Onboarding checklist progressiva (sparisce a setup completo o dismissato) */}
      {!isAll && family && (
        <OnboardingChecklist
          family={family}
          members={members}
          tasks={tasks}
          notificationPermission={typeof Notification !== 'undefined' ? Notification.permission : 'denied'}
          onAddTask={() => setShowAdd(true)}
          onInviteFamily={() => window.dispatchEvent(new CustomEvent('fammy_go_family', { detail: { section: 'invite' } }))}
          onExportAgenda={() => window.dispatchEvent(new CustomEvent('fammy_go_profile', { detail: { section: 'export' } }))}
        />
      )}

      {/* Filtri rapidi: Da fare (default) → Urgenti → Solo mie → Da seguire → Tutte */}
      <div style={{
        padding: '6px 16px 8px',
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
      }} data-testid="bacheca-quick-filters">
        {[
          { id: 'todo',     label: t('filter_todo')     || '📋 Da fare',    count: todos.length },
          { id: 'urgent',   label: t('filter_urgent')   || '🚨 Urgenti',    count: todos.filter((x) => (x.priority === 'high') || x.urgent).length },
          { id: 'mine',     label: t('filter_mine')     || '👤 Solo mie',   count: myTasks.length },
          { id: 'followup', label: t('filter_followup') || '👁️ Da seguire', count: followUpTasks.length },
          { id: 'all',      label: t('filter_all')      || '🌍 Tutte',      count: todos.length },
        ].map((f) => {
          const active = quickFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`bacheca-filter-${f.id}`}
              onClick={() => setQuickFilter(f.id)}
              style={{
                padding: '7px 14px', borderRadius: 100,
                border: '1.5px solid', borderColor: active ? 'var(--k)' : 'var(--sm)',
                background: active ? 'var(--k)' : 'white',
                color: active ? 'white' : 'var(--km)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s ease',
              }}>
              <span>{f.label}</span>
              {f.count > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.22)' : 'var(--ab)',
                  color: active ? 'white' : 'var(--km)',
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 100,
                }}>{f.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista task: prima le mie, poi le altre (no più sotto-sezioni:
          i filtri rapidi qui sopra forniscono già il filtering UX) */}
      {(() => {
        const combined = sortByNews([...visibleMyTasks, ...visibleOtherTasks]);
        const overdue = combined
          .filter(isOverdueTask)
          .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
        const rest = combined.filter((x) => !isOverdueTask(x));
        const fmtShort = (ymd) => {
          const [y, mo, da] = (ymd || '').split('-').map(Number);
          return new Date(y, mo - 1, da)
            .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        };
        return (
          <>
            {overdue.length > 0 && (
              <div style={{
                marginBottom: 12, padding: '10px 12px', borderRadius: 14,
                background: 'rgba(184,74,74,0.07)',
                border: '1px solid rgba(184,74,74,0.30)',
              }} data-testid="overdue-section">
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--rd)', marginBottom: 8 }}>
                  ⏰ {tf('overdue_h', 'In ritardo')} ({overdue.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {overdue.map((task) => (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'var(--w, #fff)', border: '1px solid var(--sm)',
                      borderRadius: 10, padding: '8px 10px',
                    }} data-testid={`overdue-row-${task.id}`}>
                      <div style={{ flex: 1, minWidth: 0 }}
                        onClick={() => setSelTask(task)}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: 'var(--k)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{task.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--rd)' }}>
                          📅 {tf('overdue_was_due', 'scadeva')} {fmtShort(task.due_date)}
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => quickMoveToToday(task)}
                        data-testid={`overdue-today-${task.id}`}
                        style={{
                          flexShrink: 0, padding: '7px 10px', borderRadius: 100,
                          border: '1px solid var(--sm)', background: 'var(--w, #fff)',
                          fontSize: 11, fontWeight: 700, color: 'var(--k)', cursor: 'pointer',
                        }}>
                        → {tf('overdue_to_today', 'Oggi')}
                      </button>
                      <button type="button"
                        onClick={() => quickToggleDone(task)}
                        data-testid={`overdue-done-${task.id}`}
                        style={{
                          flexShrink: 0, padding: '7px 10px', borderRadius: 100,
                          border: 'none', background: 'var(--gn)',
                          fontSize: 11, fontWeight: 700, color: 'white', cursor: 'pointer',
                        }}>
                        ✓ {tf('overdue_done', 'Fatto')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(rest.length + overdue.length) === 0 ? (
              <FilterEmptyState
                filter={quickFilter}
                onResetFilter={() => setQuickFilter('todo')}
                t={t}
              />
            ) : (
              renderTaskList(rest)
            )}
          </>
        );
      })()}

      {/* Sezione "Fatti": SEMPRE visibile (a prescindere dal filtro "Da fare")
          ma rispetta gli altri filtri (Solo mie, Urgenti, Da seguire).
          All'interno: pill temporali + raggruppamento per giorno. */}
      {dones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <CollapsibleSection
            label={t('section_done_short')}
            count={filteredDones.length}
            open={openSections.done}
            onToggle={() => toggle('done')}
          >
            <DoneArchive
              dones={filteredDones}
              range={donesRange}
              onRangeChange={setDonesRange}
              t={t}
              renderTaskList={renderTaskList}
            />
          </CollapsibleSection>
        </div>
      )}

      <FabSpeedDial
        testid="bacheca-fab-2"
        actions={buildFabActions('bacheca-fab2')}
        pulse={idlePulse}
      />

      {showAdd && (
        <AddTaskModal
          familyId={targetFamilyId}
          families={families}
          members={allMembers}
          authorMemberId={me?.id}
          absences={absences}
          initialTitle={addPrefill?.title || ''}
          initialCategory={addPrefill?.category || null}
          shoppingMode={!!addPrefill?.shopping}
          initialChecklistOpen={!!addPrefill?.shopping}
          onClose={() => { setShowAdd(false); setAddPrefill(null); }}
          onCreated={() => { setShowAdd(false); setAddPrefill(null); onChanged(); }}
        />
      )}

      {showAddEvent && (
        <AddEventModal
          familyId={targetFamilyId}
          families={families}
          members={allMembers}
          authorMemberId={me?.id}
          onClose={() => setShowAddEvent(false)}
          onCreated={() => { setShowAddEvent(false); onChanged(); }}
        />
      )}

      {showAbsence && (
        <AbsenceModal
          session={session}
          profile={profile}
          families={families}
          tasks={tasks}
          members={allMembers}
          onClose={() => setShowAbsence(false)}
          onSaved={() => { setShowAbsence(false); onChanged(); }}
          onDeleted={() => { setShowAbsence(false); onChanged(); }}
        />
      )}

      {selTask && (
        <TaskDetailModal
          task={selTask}
          members={members}
          me={me}
          onClose={() => { markChatSeen(selTask._origId || selTask.id); setSelTask(null); }}
          onChanged={() => { onChanged(); }}
          onClosed={() => { markChatSeen(selTask._origId || selTask.id); setSelTask(null); }}
          onEdit={(task) => { setSelTask(null); setEditingTask(task); }}
          onOpenExpense={(task) => { setSelTask(null); onOpenExpenseForTask && onOpenExpenseForTask(task); }}
        />
      )}

      {/* Lightbox foto aperto dal tap sulla miniatura in card */}
      {photoLightbox && (
        <div onClick={() => setPhotoLightbox(null)} data-testid="bacheca-photo-lightbox"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, cursor: 'zoom-out',
          }}>
          <img src={photoLightbox.photos[photoLightbox.index]?.url} alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
          <button type="button" onClick={() => setPhotoLightbox(null)}
            data-testid="bacheca-lightbox-close"
            style={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14,
              width: 40, height: 40, borderRadius: 100, border: 'none',
              background: 'rgba(255,255,255,0.16)', color: 'white', fontSize: 18, cursor: 'pointer',
            }}>✕</button>
          {photoLightbox.photos.length > 1 && (
            <>
              <button type="button" data-testid="bacheca-lightbox-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoLightbox((lb) => ({ ...lb, index: (lb.index - 1 + lb.photos.length) % lb.photos.length }));
                }}
                style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  width: 44, height: 44, borderRadius: 100, border: 'none',
                  background: 'rgba(255,255,255,0.16)', color: 'white', fontSize: 22, cursor: 'pointer',
                }}>‹</button>
              <button type="button" data-testid="bacheca-lightbox-next"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoLightbox((lb) => ({ ...lb, index: (lb.index + 1) % lb.photos.length }));
                }}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  width: 44, height: 44, borderRadius: 100, border: 'none',
                  background: 'rgba(255,255,255,0.16)', color: 'white', fontSize: 22, cursor: 'pointer',
                }}>›</button>
              <div style={{
                position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
                left: '50%', transform: 'translateX(-50%)',
                color: 'white', fontSize: 13, fontWeight: 700,
                background: 'rgba(255,255,255,0.16)', borderRadius: 100, padding: '4px 12px',
              }}>{photoLightbox.index + 1} / {photoLightbox.photos.length}</div>
            </>
          )}
        </div>
      )}

      {editingTask && (
        <AddTaskModal
          familyId={editingTask.family_id}
          families={families}
          members={allMembers}
          authorMemberId={me?.id}
          absences={absences}
          editingTask={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { setEditingTask(null); onChanged(); }}
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
              width: '100%', maxWidth: 520,
              background: 'var(--w, #fff)',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 8,
              animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
              maxHeight: '70vh', overflowY: 'auto',
            }}>
            <div style={{
              width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
              margin: '0 auto 8px',
            }} />
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
                  key={m.id}
                  type="button"
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
              type="button"
              onClick={() => setShowMedsPicker(false)}
              data-testid="meds-picker-cancel"
              style={{
                marginTop: 6, padding: '12px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'var(--w, #fff)',
                fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
              }}>{t('cancel') || 'Annulla'}</button>
          </div>
        </div>
      )}

      {/* Bottom-sheet priority menu (fuori dallo SwipeableRow per non essere
          clippato dall'overflow:hidden delle card). */}
      {priorityMenuOpen && (() => {
        const target = tasks.find((tt) => tt.id === priorityMenuOpen.taskId);
        const currentPriority = target?.priority || (target?.urgent ? 'high' : 'normal');
        return (
          <div
            data-testid="priority-sheet-backdrop"
            onClick={() => setPriorityMenuOpen(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1500,
              background: 'rgba(28,22,17,0.35)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}>
            <div
              onClick={(e) => e.stopPropagation()}
              data-testid="priority-sheet"
              style={{
                width: '100%', maxWidth: 520,
                background: 'var(--w, #fff)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: 8,
                animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
              }}>
              <div style={{
                width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
                margin: '0 auto 8px',
              }} />
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--km)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                textAlign: 'center', marginBottom: 6,
              }}>{t('priority_sheet_title') || 'Imposta priorità'}</div>
              <PrioBtn color="var(--gn)" label="🟢 Normale"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'normal')}
                active={currentPriority === 'normal'} testid="prio-normal" />
              <PrioBtn color="#F39C12" label="🟠 Attenzione"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'medium')}
                active={currentPriority === 'medium'} testid="prio-medium" />
              <PrioBtn color="var(--rd)" label="🔴 Urgente / Imprevisto"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'high')}
                active={currentPriority === 'high'} testid="prio-high" />
              <button onClick={() => setPriorityMenuOpen(null)}
                data-testid="priority-sheet-cancel"
                style={{
                  marginTop: 6, padding: '12px', borderRadius: 12,
                  border: '1px solid var(--sm)', background: 'var(--w, #fff)',
                  fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
                }}>{t('cancel') || 'Annulla'}</button>
            </div>
          </div>
        );
      })()}

      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </>
  );
}

function CollapsibleSection({ label, count, open, onToggle, children, empty, accent, background }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={onToggle} className="collapsible-header"
        style={{
          borderLeft: accent ? `4px solid ${accent}` : '4px solid transparent',
          background: background ? `${background}15` : 'transparent',
          paddingLeft: 16,
        }}>
        <span className="collapsible-arrow" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
        <span className="collapsible-label" style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        <span className="collapsible-count" style={{ fontWeight: 700, fontSize: 12 }}>{count}</span>
      </button>
      {open && (
        count === 0
          ? <p style={{ padding: '6px 22px 14px', color: 'var(--km)', fontSize: 13 }}>{empty || '—'}</p>
          : children
      )}
    </div>
  );
}

function TaskCard({ task, meta, unread, onOpenPhoto, family, assignees, statusLabel, isFollowUp, followUpLabel, followUpHistory = [], members = [], onClick, onCheck, priorityMenu, onSetPriority, onClosePriorityMenu }) {
  const priority = task.priority || (task.urgent ? 'high' : 'normal');
  const priorityColor = priority === 'high' ? 'var(--rd)'
                      : priority === 'medium' ? '#F39C12'
                      : 'var(--gn)';
  const cardStyle = priority === 'high' ? {
        borderLeft: '6px solid var(--rd)', borderRadius: 0,
        background: 'var(--rdB)',
        boxShadow: '0 0 8px rgba(200, 74, 54, 0.18)',
      } : priority === 'medium' ? {
        borderLeft: '6px solid #F39C12', borderRadius: 0,
        background: '#F39C1222',
      } : { borderRadius: 8 };
  // Quando il menu priorità è aperto, alza lo stacking context della card
  // così il popup vince su qualsiasi card sorella.
  const stackingStyle = priorityMenu
    ? { position: 'relative', zIndex: 1000 }
    : {};
  return (
    <div className={`tc ${task.category} ${task.status === 'done' ? 'done' : ''}`} onClick={onClick} style={{ ...cardStyle, ...stackingStyle }}>
      <div className="tc-row" style={{ position: 'relative' }}>
        <button className="tc-check" onClick={onCheck}
          title={task.status === 'done' ? 'Fatto' : 'Imposta priorità'}
          style={task.status !== 'done' && priority !== 'normal' ? {
            background: priorityColor, color: 'white',
            border: `2px solid ${priorityColor}`,
          } : task.status === 'done' ? {} : {
            // Priorità normale: niente pallino colorato, cerchio neutro vuoto
            background: 'transparent', color: 'transparent',
            border: '1.5px dashed var(--sm)',
          }}>
          {task.status === 'done' ? '✓' : ' '}
        </button>
        <span className="tc-emoji">{CAT[task.category] || '📌'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tc-title" style={priority === 'high' ? { color: 'var(--rd)', fontWeight: 700, fontSize: 14 } : {}}>{priority === 'high' ? '🚨 ' : ''}{task.title}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {assignees.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 100,
                background: 'var(--ab)', color: 'var(--ac)',
                fontSize: 11, fontWeight: 600,
              }}>
                {assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.id}
                    name={a.name} avatarUrl={a.avatar_url}
                    avatarLetter={a.avatar_letter}
                    avatarColor={a.avatar_color || '#1C1611'}
                    size={16}
                    style={{ display: 'inline-flex' }} />
                ))}
                {assignees.length === 1 ? assignees[0].name : `${assignees.length}`}
              </span>
            )}
            {family && (
              <span style={{
                padding: '2px 8px', borderRadius: 100,
                background: family.color ? family.color + '22' : 'var(--sm)',
                color: family.color || 'var(--km)',
                fontSize: 11, fontWeight: 600,
              }}>{family.emoji} {family.name}</span>
            )}
            {task.note && <span className="tc-meta" style={{ marginTop: 0 }}>{task.note}</span>}
            {task.due_date && (
              <span className="tc-meta" style={{ marginTop: 0 }}>
                📅 {fmtDate(task.due_date)}{task.due_time ? ` · 🕐 ${task.due_time}` : ''}
              </span>
            )}
            {task.location && <span className="tc-meta" style={{ marginTop: 0 }}>📍 {task.location}</span>}
            {(meta?.msgs || 0) > 0 && (
              <span data-testid={`task-chat-badge-${task.id}`}
                role="button"
                onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
                className={unread ? 'chat-badge-unread' : ''}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px', borderRadius: 100,
                  background: unread ? '#2A6FDB' : 'var(--ab)',
                  color: unread ? 'white' : 'var(--ac)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  border: unread ? '1px solid #2A6FDB' : '1px solid rgba(193, 98, 75, 0.25)',
                }}>💬 {meta.msgs}</span>
            )}
            {(meta?.docs || 0) > 0 && (
              <span data-testid={`task-docs-badge-${task.id}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 100,
                background: 'var(--ab)', color: 'var(--km)',
                fontSize: 11, fontWeight: 700,
                border: '1px solid var(--sm)',
              }}>📎 {meta.docs}</span>
            )}
            {isFollowUp && (
              <span
                data-testid={`task-followup-badge-${task.id}`}
                style={{
                  padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(193, 98, 75, 0.12)',
                  color: 'var(--ac)',
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.01em',
                  border: '1px solid rgba(193, 98, 75, 0.25)',
                }}>{followUpLabel}</span>
            )}
          </div>
          {/* Miniature foto allegate — tap = foto a schermo intero */}
          {(meta?.photos?.length || 0) > 0 && (
            <div data-testid={`task-photos-${task.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              {meta.photos.slice(0, 3).map((p, i) => (p.url ? (
                <img key={p.id} src={p.url} alt=""
                  data-testid={`task-photo-thumb-${task.id}-${i}`}
                  onClick={(e) => { e.stopPropagation(); onOpenPhoto && onOpenPhoto(i); }}
                  style={{
                    width: 46, height: 46, borderRadius: 10, objectFit: 'cover',
                    border: '1.5px solid var(--sd)', cursor: 'zoom-in',
                    boxShadow: '0 1px 4px rgba(28,22,17,.14)',
                  }} />
              ) : (
                <span key={p.id} style={{
                  width: 46, height: 46, borderRadius: 10, background: 'var(--sm)',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18,
                }}>📷</span>
              )))}
              <span
                onClick={(e) => { e.stopPropagation(); onOpenPhoto && onOpenPhoto(0); }}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', cursor: 'pointer' }}>
                📷 {meta.photos.length}{meta.photos.length > 3 ? ` (+${meta.photos.length - 3})` : ''}
              </span>
            </div>
          )}
        </div>
        <span className={`sp ${task.status}`}>{statusLabel}</span>
      </div>

      {/* Mini-timeline cronologia follow-up (visibile solo dentro il filtro
          "Da seguire" e quando ci sono system messages da mostrare). */}
      {isFollowUp && followUpHistory.length > 0 && (
        <FollowUpTimeline events={followUpHistory} members={members} />
      )}
    </div>
  );
}

function FollowUpTimeline({ events, members }) {
  return (
    <div
      data-testid="task-followup-timeline"
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed rgba(28, 22, 17, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--km)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        marginBottom: 2,
      }}>
        🕘 Cronologia
      </div>
      {events.map((ev) => {
        const { icon, tone } = classifySystemMessage(ev.text);
        const author = members.find((m) => m.id === ev.author_id);
        return (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 12, color: 'var(--k)', lineHeight: 1.4,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: -1 }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: tone === 'urgent' ? 'var(--rd)' : 'var(--k)', fontWeight: 600 }}>
                {truncate(ev.text, 60)}
              </span>
              {' '}
              <span style={{ color: 'var(--km)', fontSize: 11 }}>
                · {author?.name ? `${author.name.split(' ')[0]} · ` : ''}{relativeTime(ev.created_at)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function relativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ieri';
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Mappa il testo del system message all'icona + tono.
// I pattern coprono i messaggi creati dal codice esistente (TaskDetailModal
// e useEventNotifications follow-up actions).
function classifySystemMessage(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('sollecito') || t.includes('reminder'))    return { icon: '🔔', tone: 'urgent' };
  if (t.includes('imprevisto') || t.includes('unexpected')) return { icon: '⚠️', tone: 'urgent' };
  if (t.includes('rifiut') || t.includes('refus'))          return { icon: '🙅', tone: 'info' };
  if (t.includes('me ne occupo') || t.includes('claim'))    return { icon: '✋', tone: 'info' };
  if (t.includes('delega') || t.includes('lo fa'))          return { icon: '🧡', tone: 'info' };
  if (t.includes('ricorrenza') || t.includes('recurrence')) return { icon: '🔁', tone: 'info' };
  return { icon: '·', tone: 'info' };
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function PrioBtn({ color, label, onClick, active, testid }) {
  // Sfondo SEMPRE opaco: usiamo bianco per inattivo e una versione chiara opaca
  // per l'attivo (mescolando il colore con bianco, no alpha) così non trapela
  // nulla dalla card sottostante.
  const activeBg = `color-mix(in srgb, ${color} 18%, #ffffff)`;
  return (
    <button onClick={onClick}
      data-testid={testid}
      style={{
        padding: '14px 16px', borderRadius: 12,
        border: active ? `2px solid ${color}` : '1.5px solid var(--sm)',
        background: active ? activeBg : '#ffffff',
        color: 'var(--ink, #1C1611)',
        fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {label}{active ? ' ✓' : ''}
    </button>
  );
}

/**
 * DoneArchive — archivio incarichi completati con filtro temporale +
 * raggruppamento per giorno (pattern Things 3 / Todoist "Completed").
 *
 * Date di riferimento: `updated_at` se presente, altrimenti `created_at`.
 */
function DoneArchive({ dones, range, onRangeChange, t, renderTaskList }) {
  // Filtra per range temporale
  const now = Date.now();
  const cutoff = range === '7d'
    ? now - 7 * 24 * 3600 * 1000
    : range === '30d'
    ? now - 30 * 24 * 3600 * 1000
    : 0;
  const inRange = dones.filter((task) => {
    if (range === 'all') return true;
    const ref = task.updated_at || task.created_at;
    if (!ref) return false;
    return new Date(ref).getTime() >= cutoff;
  });

  // Raggruppa per "Oggi" / "Ieri" / weekday della settimana corrente /
  // "N settimane fa" / data assoluta
  const groups = groupDonesByDay(inRange, t);

  return (
    <div data-testid="done-archive">
      {/* Pill temporali */}
      <div style={{
        display: 'flex', gap: 6, padding: '0 16px 10px',
        flexWrap: 'wrap',
      }} data-testid="done-range-pills">
        {[
          { id: '7d',  label: t('done_range_7d')  || 'Ultimi 7 giorni' },
          { id: '30d', label: t('done_range_30d') || 'Ultimi 30 giorni' },
          { id: 'all', label: t('done_range_all') || 'Tutto' },
        ].map((r) => {
          const active = range === r.id;
          return (
            <button key={r.id} type="button"
              data-testid={`done-range-${r.id}`}
              onClick={() => onRangeChange(r.id)}
              style={{
                padding: '6px 12px', borderRadius: 100,
                border: active ? '1.5px solid var(--k)' : '1.5px solid var(--sm)',
                background: active ? 'var(--k)' : 'white',
                color: active ? 'white' : 'var(--km)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>{r.label}</button>
          );
        })}
      </div>

      {inRange.length === 0 ? (
        <div style={{
          padding: '24px 22px', textAlign: 'center',
          color: 'var(--km)', fontSize: 13,
        }}>
          {range === 'all'
            ? (t('done_empty_all') || 'Nessun incarico completato')
            : (t('done_empty_range') || 'Nessun incarico completato in questo periodo')}
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 8 }}>
              <div style={{
                padding: '6px 22px 4px',
                fontSize: 11, fontWeight: 800, color: 'var(--km)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{g.label} · {g.items.length}</div>
              {renderTaskList(g.items)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupDonesByDay(dones, t) {
  // Order DESC by date
  const sorted = [...dones].sort((a, b) => {
    const ra = new Date(a.updated_at || a.created_at || 0).getTime();
    const rb = new Date(b.updated_at || b.created_at || 0).getTime();
    return rb - ra;
  });

  const buckets = new Map(); // key -> { label, sortKey, items[] }

  for (const task of sorted) {
    const ref = task.updated_at || task.created_at;
    const d = ref ? new Date(ref) : null;
    let key, label, sortKey;
    if (!d || Number.isNaN(d.getTime())) {
      key = 'unknown';
      label = t('done_group_unknown') || 'Data ignota';
      sortKey = -Infinity;
    } else {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ref0 = new Date(d); ref0.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - ref0.getTime()) / (24 * 3600 * 1000));
      if (diffDays === 0) {
        key = 'today';
        label = t('done_group_today') || 'Oggi';
        sortKey = 1000;
      } else if (diffDays === 1) {
        key = 'yesterday';
        label = t('done_group_yesterday') || 'Ieri';
        sortKey = 900;
      } else if (diffDays < 7) {
        // Es. "Sabato" (giorno settimana)
        key = `wd-${ref0.toISOString().slice(0, 10)}`;
        label = ref0.toLocaleDateString(undefined, { weekday: 'long' });
        // capitalize first
        label = label.charAt(0).toUpperCase() + label.slice(1);
        sortKey = 800 - diffDays;
      } else if (diffDays < 14) {
        key = 'last-week';
        label = t('done_group_last_week') || 'Settimana scorsa';
        sortKey = 700;
      } else if (diffDays < 30) {
        key = 'this-month';
        label = t('done_group_this_month') || 'Questo mese';
        sortKey = 600;
      } else {
        // Per mese/anno
        key = ref0.toISOString().slice(0, 7); // YYYY-MM
        label = ref0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        label = label.charAt(0).toUpperCase() + label.slice(1);
        sortKey = -ref0.getTime();
      }
    }
    if (!buckets.has(key)) buckets.set(key, { key, label, sortKey, items: [] });
    buckets.get(key).items.push(task);
  }
  return Array.from(buckets.values()).sort((a, b) => b.sortKey - a.sortKey);
}


/**
 * FilterEmptyState — empty state visivo per quando un filtro rapido non
 * mostra risultati. Contestualizza il messaggio in base al filtro attivo
 * e offre un'azione di reset rapido + un suggerimento utile.
 */
function FilterEmptyState({ filter, onResetFilter, t }) {
  const config = {
    mine:    { emoji: '☕', h: t('empty_mine_h')    || 'Niente per te oggi',         p: t('empty_mine_p')    || 'Goditi la pausa! Quando ti assegneranno qualcosa lo vedrai qui.' },
    urgent:  { emoji: '🌿', h: t('empty_urgent_h')  || 'Nessuna urgenza',            p: t('empty_urgent_p')  || 'Respiro profondo: niente è urgente in questo momento.' },
    followup:{ emoji: '👀', h: t('empty_followup_h')|| 'Nulla da seguire',           p: t('empty_followup_p')|| 'Tieni d\'occhio i task degli altri marcandoli "Da seguire" 👁️.' },
    today:   { emoji: '🍃', h: t('empty_today_h')   || 'Giornata libera',            p: t('empty_today_p')   || 'Nessun incarico in scadenza oggi. Approfitta per riposare.' },
    todo:    { emoji: '✨', h: t('empty_todo_h')    || 'Tutto fatto!',               p: t('empty_todo_p')    || 'Non c\'è niente da fare. Hai sistemato tutto come un campione.' },
  };
  const { emoji, h, p } = config[filter] || config.todo;
  return (
    <div className="empty" data-testid={`bacheca-empty-${filter}`} style={{
      padding: '36px 22px 12px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 64, marginBottom: 14,
        display: 'inline-block',
      }}>{emoji}</div>
      <h3 style={{ marginBottom: 6 }}>{h}</h3>
      <p style={{ color: 'var(--km)', fontSize: 14, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>{p}</p>
      {filter !== 'todo' && (
        <button
          type="button"
          data-testid="bacheca-empty-reset"
          onClick={onResetFilter}
          style={{
            marginTop: 18, padding: '8px 18px', borderRadius: 100,
            border: '1.5px solid var(--sm)', background: 'var(--w, #fff)',
            color: 'var(--ac)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
          ← {t('empty_back_to_todo') || 'Vedi tutti i da fare'}
        </button>
      )}
    </div>
  );
}
