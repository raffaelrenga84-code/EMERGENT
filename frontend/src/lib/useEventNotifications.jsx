import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabase.js';
import { wasSelfAssignment } from './assignMarker.js';
import { isBirthdayTomorrow } from './birthdayUtils.js';

const NOTIFICATIONS_ENABLED_KEY = 'fammy_notifications_enabled';
const QUIET_HOURS_KEY = 'fammy_quiet_hours'; // JSON: { enabled, startHour, endHour }

// Verifica se l'ora corrente cade nelle "ore silenziose" (default 22-07)
// e quindi le notifiche locali NON vanno mostrate. Le push del server sono
// gestite lato Edge Function (cron-digest non gira nelle quiet hours).
export function inQuietHours() {
  try {
    const raw = localStorage.getItem(QUIET_HOURS_KEY);
    if (!raw) return false;
    const cfg = JSON.parse(raw);
    if (!cfg?.enabled) return false;
    const now = new Date();
    const h = now.getHours();
    const s = Number(cfg.startHour ?? 22);
    const e = Number(cfg.endHour ?? 7);
    if (s === e) return false;
    // Range che attraversa la mezzanotte (es 22-07): h>=s || h<e
    if (s > e) return (h >= s || h < e);
    // Range normale (es 13-15)
    return (h >= s && h < e);
  } catch (err) { return false; }
}

/**
 * Hook per gestire le notifiche push e l'auto-refresh dei dati:
 *  - notifica 30 min prima dei tuoi eventi
 *  - notifica quando nuovi eventi/task vengono creati nella tua famiglia
 *  - notifica quando un task ti viene delegato (delegated_to = me)
 *  - notifica quando un task diventa urgente (priority='high', es. "Ho un imprevisto")
 *  - notifica il giorno prima dei compleanni
 *  - realtime subscriptions per refresh automatico
 */
// Safe accessor: in alcune webview iOS / in-app browser, 'Notification' non
// esiste come identifier globale -> l'optional chaining NON salva da ReferenceError.
// 'typeof X !== "undefined"' e' l'unico controllo sicuro.
function safeNotificationPermission() {
  try {
    if (typeof Notification === 'undefined') return 'default';
    return Notification.permission || 'default';
  } catch (e) { return 'default'; }
}

export function useEventNotifications(session, profile, families, events, taskAssignees, members = [], tasks = [], onDataChange, absences = []) {
  const [notificationPermission, setNotificationPermission] = useState(safeNotificationPermission());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
      return saved === null ? true : saved === 'true';
    } catch (e) { return true; }
  });
  const scheduledNotificationsRef = useRef(new Map());

  // Service worker (per future push API)
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.log('SW registration failed:', err);
    });
  }, []);

  // Richiedi permessi notifica al primo accesso
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default' && session?.user?.id) {
      setTimeout(() => {
        try {
          try { Notification.requestPermission().then((perm) => setNotificationPermission(perm)); } catch (e) {}
        } catch (e) { /* webview senza supporto */ }
      }, 3000);
    }
  }, [session?.user?.id]);

  // Notifiche programmate 30 min prima degli eventi
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled) return;

    const myEvents = events.filter((event) => new Date(event.starts_at) > new Date());
    myEvents.forEach((event) => {
      const notificationKey = `event-${event.id}`;
      if (scheduledNotificationsRef.current.has(notificationKey)) return;

      const eventTime = new Date(event.starts_at);
      const notificationTime = new Date(eventTime.getTime() - 30 * 60 * 1000);
      const now = new Date();

      if (notificationTime > now) {
        const delay = notificationTime.getTime() - now.getTime();
        const timeoutId = setTimeout(() => {
          showEventNotification(event);
          scheduledNotificationsRef.current.delete(notificationKey);
        }, delay);
        scheduledNotificationsRef.current.set(notificationKey, timeoutId);
      }
    });

    return () => {
      scheduledNotificationsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      scheduledNotificationsRef.current.clear();
    };
  }, [events, notificationPermission, session?.user?.id, notificationsEnabled]);

  // === REALTIME: subscribe a tasks/events/expenses + notifiche per cambi rilevanti ===
  useEffect(() => {
    if (!session?.user?.id) return;
    if (!families || families.length === 0) return;

    const familyIds = families.map((f) => f.id);
    const familyIdsCsv = familyIds.join(',');
    const userId = session.user.id;
    // Trova i member.id dell'utente nelle varie famiglie (per filtri di interesse)
    const myMemberIds = (members || []).filter((m) => m.user_id === userId).map((m) => m.id);

    // TASKS — INSERT/UPDATE/DELETE
    const tasksChannel = supabase
      .channel('rt-tasks')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `family_id=in.(${familyIdsCsv})`,
      }, (payload) => {
        // Refresh dei dati
        if (typeof onDataChange === 'function') onDataChange();

        if (notificationPermission !== 'granted' || !notificationsEnabled) return;

        if (payload.eventType === 'INSERT') {
          // ⛔️ Nessuna notifica locale per i nuovi task: ci pensa il server
          // (coda task_notify_queue → push "Nuovo incarico" alla famiglia,
          // esclusi autore e assegnatari che ricevono "Assegnato a te").
          // La doppia notifica locale+push era un doppione.
          return;
        } else if (payload.eventType === 'UPDATE') {
          const oldT = payload.old;
          const newT = payload.new;
          // Notifica se diventa urgente (es. "Ho un imprevisto")
          if (oldT?.priority !== 'high' && newT?.priority === 'high') {
            const family = families.find((f) => f.id === newT.family_id);
            showUrgentTaskNotification(newT, family);
          }
          // Notifica se viene delegato a me
          if (oldT?.delegated_to !== newT?.delegated_to && newT?.delegated_to && myMemberIds.includes(newT.delegated_to)) {
            const family = families.find((f) => f.id === newT.family_id);
            showDelegatedTaskNotification(newT, family);
          }
        }
      })
      .subscribe();

    // EVENTS — INSERT (esiste già nella vecchia logica ma raddoppio per coerenza)
    const eventsChannel = supabase
      .channel('rt-events')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'events',
        filter: `family_id=in.(${familyIdsCsv})`,
      }, (payload) => {
        if (typeof onDataChange === 'function') onDataChange();
        if (notificationPermission !== 'granted' || !notificationsEnabled) return;
        if (payload.eventType === 'INSERT') {
          const e = payload.new;
          if (e.created_by !== userId && !myMemberIds.includes(e.created_by)) {
            const family = families.find((f) => f.id === e.family_id);
            showNewEventNotification(e, family);
          }
        }
      })
      .subscribe();

    // EXPENSES — refresh only (no notifica push, è meno time-sensitive)
    const expensesChannel = supabase
      .channel('rt-expenses')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'expenses',
        filter: `family_id=in.(${familyIdsCsv})`,
      }, () => {
        if (typeof onDataChange === 'function') onDataChange();
      })
      .subscribe();

    // TASK ASSIGNEES — refresh + notifica al CREATOR quando qualcuno si prende un task
    const assigneesChannel = supabase
      .channel('rt-task-assignees')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'task_assignees',
      }, async (payload) => {
        if (typeof onDataChange === 'function') onDataChange();
        if (notificationPermission !== 'granted' || !notificationsEnabled) return;
        if (payload.eventType !== 'INSERT') return;
        const row = payload.new || {};
        if (!row.task_id || !row.member_id) return;
        // Salta se l'assegnatario sono io stesso (no auto-notifica)
        if (myMemberIds.includes(row.member_id)) return;
        // ⛔️ Salta se l'assegnazione l'ho fatta IO da questo dispositivo
        // (creazione/modifica/delega): notifico solo quando QUALCUN ALTRO
        // si prende in carico un mio incarico.
        if (wasSelfAssignment(row.task_id)) return;
        try {
          const { data: task } = await supabase
            .from('tasks').select('id, title, family_id, author_id, created_at')
            .eq('id', row.task_id).maybeSingle();
          if (!task) return;
          if (!familyIds.includes(task.family_id)) return;
          // Notifica SOLO se il creator sono io (= sto seguendo questo task)
          if (!task.author_id || !myMemberIds.includes(task.author_id)) return;
          // ⛔️ Assegnazione contestuale alla CREAZIONE del task (fatta dal
          // creatore, anche da un altro dispositivo): il creatore sa già
          // a chi l'ha assegnato → niente notifica.
          if (task.created_at && (Date.now() - new Date(task.created_at).getTime()) < 120000) return;
          // Nome del nuovo assegnatario per il body
          const assignee = members.find((m) => m.id === row.member_id);
          // ⛔️ Membro placeholder senza account: non può essersi preso
          // l'incarico da solo → è stato assegnato da qualcuno. Salta.
          if (!assignee?.user_id) return;
          showAssignedToMyTaskNotification(task, assignee);
        } catch (e) { /* silent */ }
      })
      .subscribe();

    // TASK RESPONSES (commenti) — notifica all'autore/assegnatari quando qualcuno
    // commenta. Ignoriamo i propri commenti e i system message.
    const responsesChannel = supabase
      .channel('rt-task-responses')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_responses',
      }, async (payload) => {
        if (typeof onDataChange === 'function') onDataChange();
        if (notificationPermission !== 'granted' || !notificationsEnabled) return;

        const resp = payload.new || {};
        if (resp.type === 'system') return;
        if (resp.author_id && myMemberIds.includes(resp.author_id)) return; // mio commento

        // recupera task e verifica che sia di una mia famiglia + che mi riguardi
        // (autore originale, assegnatario corrente o nelle delegated_from).
        try {
          const { data: task } = await supabase
            .from('tasks').select('*').eq('id', resp.task_id).maybeSingle();
          if (!task) return;
          if (!familyIds.includes(task.family_id)) return;

          const { data: asg } = await supabase
            .from('task_assignees').select('member_id').eq('task_id', resp.task_id);
          const assigneeIds = (asg || []).map((a) => a.member_id);

          const involved =
            (task.author_id && myMemberIds.includes(task.author_id)) ||
            assigneeIds.some((id) => myMemberIds.includes(id)) ||
            (Array.isArray(task.delegated_from) && task.delegated_from.some((id) => myMemberIds.includes(id)));

          if (!involved) return;
          showNewCommentNotification(task, resp);
        } catch (e) { /* silent */ }
      })
      .subscribe();

    // EVENT ASSIGNEES — quando qualcuno mi assegna a un evento, notifico
    const eventAssigneesChannel = supabase
      .channel('rt-event-assignees')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'event_assignees',
      }, async (payload) => {
        const row = payload.new;
        // Risolvi member -> user_id per capire se l'INSERT riguarda l'utente corrente
        const { data: m } = await supabase
          .from('members').select('user_id, name').eq('id', row.member_id).maybeSingle();
        if (!m || m.user_id !== session.user.id) return;
        // Recupera dettagli evento
        const { data: ev } = await supabase
          .from('events').select('title, starts_at, created_by').eq('id', row.event_id).maybeSingle();
        if (!ev) return;
        // Non notificare se sono io ad assegnarmi (creatore == me)
        const myMember = (members || []).find((mm) => mm.user_id === session.user.id);
        if (myMember && ev.created_by === myMember.id) return;
        showEventAssigneeNotification(ev);
        if (typeof onDataChange === 'function') onDataChange();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(assigneesChannel);
      supabase.removeChannel(responsesChannel);
      supabase.removeChannel(eventAssigneesChannel);
    };
  }, [families, members, session?.user?.id, notificationPermission, notificationsEnabled, onDataChange]);

  // Auto-refresh quando l'utente torna sull'app (tab focus)
  useEffect(() => {
    if (typeof onDataChange !== 'function') return;
    const onFocus = () => onDataChange();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onDataChange();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onDataChange]);

  // === Gestione ACTIONS click dalle notifiche follow-up urgenti ===
  // Riceve messaggi dal Service Worker (`NOTIFICATION_CLICK`) e dal query
  // param `?fammy_action=claim&task=<id>` (quando l'app non era già aperta).
  // - claim  → mi assegno il task + status='taken'
  // - remind → posto un commento di sistema "🔔 Sollecitato"
  useEffect(() => {
    if (!session?.user?.id) return;

    const myUserId = session.user.id;
    const myMemberIdsForFamily = (familyId) => (members || [])
      .filter((m) => m.user_id === myUserId && m.family_id === familyId)
      .map((m) => m.id);

    const claimTask = async (taskId) => {
      const { data: task } = await supabase
        .from('tasks').select('id, family_id, title').eq('id', taskId).maybeSingle();
      if (!task) return;
      const myMember = myMemberIdsForFamily(task.family_id)[0];
      if (!myMember) return;
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      await supabase.from('task_assignees').insert({ task_id: taskId, member_id: myMember });
      await supabase.from('tasks').update({
        status: 'taken', urgent: false, priority: 'normal',
        delegated_to: null,
      }).eq('id', taskId);
      await supabase.from('task_responses').insert({
        task_id: taskId, author_id: myMember,
        text: 'Me ne occupo io ✓ (da promemoria)',
        type: 'system',
      });
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: `✋ Hai preso "${task.title}" — buona giornata!` }
      }));
      if (typeof onDataChange === 'function') onDataChange();
    };

    const remindTask = async (taskId) => {
      const { data: task } = await supabase
        .from('tasks').select('id, family_id, title').eq('id', taskId).maybeSingle();
      if (!task) return;
      const myMember = myMemberIdsForFamily(task.family_id)[0];
      if (!myMember) return;
      await supabase.from('task_responses').insert({
        task_id: taskId, author_id: myMember,
        text: '🔔 Sollecito gentile — questa task è in scadenza',
        type: 'system',
      });
      // bump priority a 'medium' per evidenziarla a tutti
      await supabase.from('tasks').update({ priority: 'medium' }).eq('id', taskId);
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: `🔔 Sollecito inviato per "${task.title}"` }
      }));
      if (typeof onDataChange === 'function') onDataChange();
    };

    const handleAction = (action, data) => {
      // Supporta sia data.taskId (vecchio) sia data.task_id (nuovo, dal trigger DB)
      const taskId = data?.taskId || data?.task_id;
      if (!taskId) return;
      if (action === 'claim')  return void claimTask(taskId);
      if (action === 'remind') return void remindTask(taskId);
      // 'open' o default: apri direttamente il task (anche se l'app è già aperta).
      // Dispatcho un evento globale che HomeScreen ascolta per aprire il modale.
      window.dispatchEvent(new CustomEvent('fammy_open_task', {
        detail: { taskId, kind: data?.kind || 'task' },
      }));
    };

    // 1) Listener Service Worker (app già aperta al click della notifica)
    const onSWMessage = (event) => {
      const msg = event.data || {};
      if (msg.type !== 'NOTIFICATION_CLICK') return;
      handleAction(msg.action, msg.data || {});
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSWMessage);
    }

    // 2) Query param all'avvio (app aperta dal click di un'action button
    //    quando non era già live, OPPURE click su notifica chat).
    try {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('fammy_action');
      const taskId = params.get('task');
      if (taskId) {
        // Se c'è solo `?task=...` senza action → trattalo come "open"
        handleAction(action || 'open', { taskId });
        // pulisci l'URL
        const url = new URL(window.location.href);
        url.searchParams.delete('fammy_action');
        url.searchParams.delete('task');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) { /* silent */ }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSWMessage);
      }
    };
  }, [session?.user?.id, members, onDataChange]);

  // Compleanni: programma notifica per domani alle 9:00
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled || !members || members.length === 0) return;

    const birthdaysTomorrow = members.filter((m) => {
      if (m.user_id === session.user.id) return false;
      return isBirthdayTomorrow(m.birth_date);
    });

    birthdaysTomorrow.forEach((member) => {
      const notificationKey = `birthday-${member.id}`;
      if (scheduledNotificationsRef.current.has(notificationKey)) return;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const now = new Date();
      if (tomorrow > now) {
        const delay = tomorrow.getTime() - now.getTime();
        const timeoutId = setTimeout(() => {
          showBirthdayNotification(member);
          scheduledNotificationsRef.current.delete(notificationKey);
        }, delay);
        scheduledNotificationsRef.current.set(notificationKey, timeoutId);
      }
    });

    return () => {
      scheduledNotificationsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [members, notificationPermission, session?.user?.id, notificationsEnabled]);

  // Riepilogo AI della settimana — notifica locale ogni domenica alle 20:00.
  // Una vera spinta server-side richiede una Edge Function + cron su Supabase
  // (vedi PUSH_NOTIFICATIONS_SETUP.md). Questo scheduler locale copre il caso
  // in cui l'app/PWA è installata e aperta nel weekend.
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled) return;

    const isoWeekKey = (d) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };

    const seenKey = 'fammy_weekly_ai_notified_' + isoWeekKey(new Date());
    if (localStorage.getItem(seenKey)) return;

    const now = new Date();
    const targetSunday = new Date(now);
    const dow = targetSunday.getDay(); // 0=Sun
    const daysUntilSunday = (7 - dow) % 7;
    targetSunday.setDate(targetSunday.getDate() + daysUntilSunday);
    targetSunday.setHours(20, 0, 0, 0);
    // se siamo già passati le 20:00 di domenica, fissalo a domenica prossima
    if (targetSunday <= now) targetSunday.setDate(targetSunday.getDate() + 7);

    const delay = targetSunday.getTime() - now.getTime();
    if (delay <= 0 || delay > 8 * 86400000) return;

    const key = 'weekly-ai-summary';
    if (scheduledNotificationsRef.current.has(key)) {
      clearTimeout(scheduledNotificationsRef.current.get(key));
    }
    const timeoutId = setTimeout(() => {
      showWeeklyAISummaryNotification();
      try { localStorage.setItem(seenKey, '1'); } catch (e) {}
      scheduledNotificationsRef.current.delete(key);
    }, delay);
    scheduledNotificationsRef.current.set(key, timeoutId);

    return () => {
      const tid = scheduledNotificationsRef.current.get(key);
      if (tid) clearTimeout(tid);
    };
  }, [notificationPermission, session?.user?.id, notificationsEnabled]);

  // Digest serale alle 21:00 — "Domani hai X incarichi e Y eventi".
  // Si programma ogni giorno (re-arm quando tasks/events cambiano o dopo il fire).
  // Dedupe per giornata via localStorage: una sola notifica per data.
  // Non scatta se domani non hai NULLA (no spam).
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled) return;

    const dayKey = (d) => {
      // YYYY-MM-DD in local time (la dedupe è "per giorno locale dell'utente")
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();
    const target = new Date(now);
    target.setHours(21, 0, 0, 0);
    // Se sono già passate le 21:00 di oggi, programma per domani
    if (target <= now) target.setDate(target.getDate() + 1);

    const targetDayKey = dayKey(target);                 // giorno in cui la notifica scatta
    const tomorrowOfTarget = new Date(target);
    tomorrowOfTarget.setDate(tomorrowOfTarget.getDate() + 1);
    const tomorrowKey = dayKey(tomorrowOfTarget);        // giorno di cui parla il digest

    const seenKey = `fammy_daily_digest_notified_${targetDayKey}`;
    if (localStorage.getItem(seenKey)) return;

    const delay = target.getTime() - now.getTime();
    if (delay <= 0 || delay > 25 * 3600 * 1000) return;

    const key = 'daily-digest';
    if (scheduledNotificationsRef.current.has(key)) {
      clearTimeout(scheduledNotificationsRef.current.get(key));
    }
    const timeoutId = setTimeout(() => {
      // Conta task per domani (due_date == tomorrowKey, non già completati)
      const tomorrowTasks = (tasks || []).filter((t) => {
        if (!t?.due_date) return false;
        if (t.status === 'done') return false;
        // due_date può essere YYYY-MM-DD o ISO; normalizza ai primi 10 char
        const dd = String(t.due_date).slice(0, 10);
        return dd === tomorrowKey;
      }).length;
      // Conta eventi per domani (starts_at cade nello stesso giorno locale)
      const tomorrowEvents = (events || []).filter((e) => {
        if (!e?.starts_at) return false;
        const d = new Date(e.starts_at);
        if (Number.isNaN(d.getTime())) return false;
        return dayKey(d) === tomorrowKey;
      }).length;

      // No spam: salta se domani non hai niente
      if (tomorrowTasks > 0 || tomorrowEvents > 0) {
        showDailyDigestNotification(tomorrowTasks, tomorrowEvents);
      }
      try { localStorage.setItem(seenKey, '1'); } catch (e) {}
      scheduledNotificationsRef.current.delete(key);
    }, delay);
    scheduledNotificationsRef.current.set(key, timeoutId);

    return () => {
      const tid = scheduledNotificationsRef.current.get(key);
      if (tid) clearTimeout(tid);
    };
  }, [tasks, events, notificationPermission, session?.user?.id, notificationsEnabled]);

  // === Return-home notification ALLE 9:00 ===
  // Se un membro della mia famiglia rientra OGGI da un'assenza, mando una
  // notifica gentile alle 9:00 del giorno dopo `end_date`. È utile per:
  //  • Salutarlo ("👋 Maria è tornata!")
  //  • Decidere quante task in sospeso può prendere
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled) return;
    if (!absences || absences.length === 0) return;

    const dayKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const now = new Date();
    const target = new Date(now);
    target.setHours(9, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const targetDayKey = dayKey(target);
    // L'assenza è "appena finita" se end_date === ieri rispetto al target.
    const yesterdayOfTarget = new Date(target);
    yesterdayOfTarget.setDate(yesterdayOfTarget.getDate() - 1);
    const yesterdayKey = dayKey(yesterdayOfTarget);

    const delay = target.getTime() - now.getTime();
    if (delay <= 0 || delay > 25 * 3600 * 1000) return;

    const myUserId = session.user.id;

    const key = 'return-home';
    if (scheduledNotificationsRef.current.has(key)) {
      clearTimeout(scheduledNotificationsRef.current.get(key));
    }
    const timeoutId = setTimeout(() => {
      try {
        const returners = absences.filter((a) =>
          a.end_date === yesterdayKey && a.user_id !== myUserId
        );
        for (const abs of returners) {
          const seenKey = `fammy_return_notified_${targetDayKey}_${abs.id}`;
          if (localStorage.getItem(seenKey)) continue;
          const member = members.find((m) => m.user_id === abs.user_id);
          const name = member?.name || abs.member_name || 'Un membro';
          showReturnHomeNotification(name);
          try { localStorage.setItem(seenKey, '1'); } catch (e) {}
        }
      } catch (e) { /* silent */ }
      scheduledNotificationsRef.current.delete(key);
    }, delay);
    scheduledNotificationsRef.current.set(key, timeoutId);

    return () => {
      const tid = scheduledNotificationsRef.current.get(key);
      if (tid) clearTimeout(tid);
    };
  }, [absences, members, notificationPermission, session?.user?.id, notificationsEnabled]);

  // === Follow-up reminders alle 19:00 ===
  // Per le task che IO HO CREATO ma nessuno si è preso in carico (status='todo').
  // 1. ⚠️ URGENTE: scade DOMANI e nessuno l'ha presa → notifica forte
  // 2. 🕊️ GENTILE: creata da >= 3 giorni, ancora 'todo', senza assegnatari
  //    "attivi" (nessuno claim/delegate) → reminder soft
  // Dedupe per giorno × task (no spam) e rispetto delle quiet hours.
  useEffect(() => {
    if (notificationPermission !== 'granted' || !session?.user?.id || !notificationsEnabled) return;

    const dayKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const myUserId = session.user.id;
    const myMemberIds = (members || [])
      .filter((m) => m.user_id === myUserId)
      .map((m) => m.id);

    const now = new Date();
    const target = new Date(now);
    target.setHours(19, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    const targetDayKey = dayKey(target);
    const tomorrowOfTarget = new Date(target);
    tomorrowOfTarget.setDate(tomorrowOfTarget.getDate() + 1);
    const tomorrowKey = dayKey(tomorrowOfTarget);

    const delay = target.getTime() - now.getTime();
    if (delay <= 0 || delay > 25 * 3600 * 1000) return;

    const key = 'follow-up-reminders';
    if (scheduledNotificationsRef.current.has(key)) {
      clearTimeout(scheduledNotificationsRef.current.get(key));
    }
    const timeoutId = setTimeout(() => {
      try {
        // Solo task create da me, non completate, e dove nessuno ha ancora
        // accettato (status='todo', no delegated_to).
        const candidates = (tasks || []).filter((t) => {
          if (!t || t.status === 'done') return false;
          if (t.status !== 'todo') return false; // 'taken' = qualcuno se n'è preso carico
          if (t.delegated_to) return false; // qualcuno è stato designato
          // Devo essere io l'autore: confronto con i miei member_id
          return !!(t.author_id && myMemberIds.includes(t.author_id));
        });

        const urgent = []; // scade domani
        const gentle = []; // ferma da >=3 giorni
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        for (const t of candidates) {
          const seenKey = `fammy_followup_notified_${targetDayKey}_${t.id}`;
          if (localStorage.getItem(seenKey)) continue;

          // URGENT: scade domani
          if (t.due_date && String(t.due_date).slice(0, 10) === tomorrowKey) {
            urgent.push(t);
            continue;
          }
          // GENTILE: creata da >= 3 giorni
          if (t.created_at) {
            const created = new Date(t.created_at);
            if (!Number.isNaN(created.getTime()) && created <= threeDaysAgo) {
              gentle.push(t);
            }
          }
        }

        // Cap: max 5 notifiche per evitare spam (le altre verranno notificate domani)
        const all = [...urgent.slice(0, 3), ...gentle.slice(0, 2)];
        all.forEach((task) => {
          const isUrgent = urgent.includes(task);
          if (isUrgent) showFollowUpUrgentNotification(task);
          else showFollowUpGentleNotification(task);
          try {
            localStorage.setItem(
              `fammy_followup_notified_${targetDayKey}_${task.id}`, '1'
            );
          } catch (e) { /* storage pieno */ }
        });
      } catch (e) { /* silent */ }
      scheduledNotificationsRef.current.delete(key);
    }, delay);
    scheduledNotificationsRef.current.set(key, timeoutId);

    return () => {
      const tid = scheduledNotificationsRef.current.get(key);
      if (tid) clearTimeout(tid);
    };
  }, [tasks, members, notificationPermission, session?.user?.id, notificationsEnabled]);

  return {
    notificationPermission,
    notificationsEnabled,
    requestPermission: () => {
      if (Notification?.permission === 'default') {
        try { Notification.requestPermission().then((perm) => setNotificationPermission(perm)); } catch (e) {}
      }
    },
    setNotificationsEnabled: (enabled) => {
      setNotificationsEnabled(enabled);
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
    },
  };
}

function showEventNotification(event) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const startTime = new Date(event.starts_at);
  const timeStr = startTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const notification = new Notification(`📅 ${event.title}`, {
    body: `Tra 30 minuti alle ${timeStr}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `event-${event.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showNewEventNotification(event, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const startTime = new Date(event.starts_at);
  const dateStr = startTime.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const notification = new Notification(`✨ Nuovo evento in ${family?.name || 'Famiglia'}`, {
    body: `${event.title} - ${dateStr}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `new-event-${event.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showUrgentTaskNotification(task, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const notification = new Notification(`🚨 Incarico urgente in ${family?.name || 'Famiglia'}`, {
    body: `${task.title} ha bisogno di attenzione`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `urgent-task-${task.id}`, requireInteraction: true,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showDelegatedTaskNotification(task, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const notification = new Notification(`🧡 Lo fai tu?`, {
    body: `Ti hanno chiesto di occuparti di: ${task.title}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `delegated-task-${task.id}`, requireInteraction: true,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

// Notifica al CREATOR quando qualcun altro si prende in carico (o gli viene
// assegnato) un task che il creator ha creato. Conferma il "follow-up loop"
// che chiude il cerchio per chi delega.
function showAssignedToMyTaskNotification(task, assignee) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return;
  const name = assignee?.name || 'Qualcuno';
  const notification = new Notification(`✅ ${name} se ne occupa`, {
    body: `Si è preso in carico: ${task.title}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `creator-assigned-${task.id}-${assignee?.id || 'x'}`,
    requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

// Promemoria GENTILE: task creato da me, ferma da >= 3 giorni senza che
// nessuno l'abbia presa. Tono soft, non interrompente.
function showFollowUpGentleNotification(task) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return;
  const notification = new Notification(`🕊️ Aspetta ancora qualcuno`, {
    body: `"${task.title}" — ti va di dare uno sguardo?`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `followup-gentle-${task.id}`,
    requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

// Promemoria URGENTE: task creato da me, scade DOMANI e nessuno l'ha presa.
// Tono d'allarme, requireInteraction per assicurare visibilità.
// Usa il Service Worker per supportare le actions "Lo faccio io" / "Sollecita"
// (le Notification dirette non supportano `actions`).
function showFollowUpUrgentNotification(task) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return;

  const title = `⚠️ Scade domani — nessuno l'ha presa`;
  const body = `"${task.title}" sta per scadere.`;
  const options = {
    body,
    icon: '/icon.png', badge: '/icon.png',
    tag: `followup-urgent-${task.id}`,
    requireInteraction: true,
    data: { taskId: task.id, kind: 'followup-urgent' },
    actions: [
      { action: 'claim',  title: '✋ Lo faccio io' },
      { action: 'remind', title: '🔔 Sollecita' },
    ],
  };

  // Preferisci SW (supporta actions). Fallback alla Notification semplice.
  if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => {
      try { reg.showNotification(title, options); } catch (e) {
        try { new Notification(title, { ...options, actions: undefined }); } catch (_) {}
      }
    }).catch(() => {
      try { new Notification(title, { ...options, actions: undefined }); } catch (_) {}
    });
  } else {
    try { new Notification(title, { ...options, actions: undefined }); } catch (_) {}
  }
}

// Notifica al RIENTRO: "X è tornato/a" — chi è tornato ieri ti viene
// segnalato alle 9:00 di oggi, una sola volta per assenza.
function showReturnHomeNotification(name) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return;
  const notification = new Notification(`👋 ${name} è tornato/a`, {
    body: `Buongiorno! ${name} è tornato/a oggi. Bentornato/a in famiglia.`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `return-home-${name}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showBirthdayNotification(member) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const notification = new Notification(`🎂 Compleanno domani!`, {
    body: `È il compleanno di ${member.name}! 🎉`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `birthday-${member.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showNewCommentNotification(task, response) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const preview = (response.text || '').slice(0, 80);
  const notification = new Notification(`💬 Nuovo commento`, {
    body: `${task.title}\n${preview}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `comment-${response.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showWeeklyAISummaryNotification() {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const notification = new Notification('✨ Riepilogo della settimana', {
    body: 'Il tuo riepilogo AI è pronto. Apri FAMMY per vedere come è andata!',
    icon: '/icon.png', badge: '/icon.png',
    tag: 'weekly-ai-summary', requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showEventAssigneeNotification(ev) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  if (inQuietHours()) return; // do not disturb
  const when = ev.starts_at ? new Date(ev.starts_at) : null;
  const whenStr = when
    ? when.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' alle ' + when.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : '';
  const n = new Notification('📅 Sei stato assegnato a un evento', {
    body: whenStr ? `${ev.title} · ${whenStr}` : ev.title,
    icon: '/icon.png', badge: '/icon.png',
    tag: `event-assignee-${ev.title}`, requireInteraction: false,
  });
  n.addEventListener('click', () => { window.focus(); n.close(); });
}

function showDailyDigestNotification(taskCount, eventCount) {  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  // Italiano colloquiale, plurale corretto
  const parts = [];
  if (taskCount > 0) parts.push(taskCount === 1 ? '1 incarico' : `${taskCount} incarichi`);
  if (eventCount > 0) parts.push(eventCount === 1 ? '1 evento' : `${eventCount} eventi`);
  const body = parts.length === 0
    ? 'Apri FAMMY per organizzare la giornata.'
    : `Domani ti aspettano ${parts.join(' e ')}. Buona serata! 🌙`;
  const notification = new Notification('🌙 Pronto per domani?', {
    body,
    icon: '/icon.png', badge: '/icon.png',
    tag: 'daily-digest', requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}
