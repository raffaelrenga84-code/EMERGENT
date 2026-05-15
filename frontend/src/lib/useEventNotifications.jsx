import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabase.js';
import { isBirthdayTomorrow } from './birthdayUtils.js';

const NOTIFICATIONS_ENABLED_KEY = 'fammy_notifications_enabled';

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

export function useEventNotifications(session, profile, families, events, taskAssignees, members = [], onDataChange) {
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
          const t = payload.new;
          const family = families.find((f) => f.id === t.family_id);
          showNewTaskNotification(t, family);
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

    // TASK ASSIGNEES — refresh per cambi di assegnazione
    const assigneesChannel = supabase
      .channel('rt-task-assignees')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'task_assignees',
      }, () => {
        if (typeof onDataChange === 'function') onDataChange();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(assigneesChannel);
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
  const startTime = new Date(event.starts_at);
  const dateStr = startTime.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const notification = new Notification(`✨ Nuovo evento in ${family?.name || 'Famiglia'}`, {
    body: `${event.title} - ${dateStr}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `new-event-${event.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showNewTaskNotification(task, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  const notification = new Notification(`📋 Nuovo incarico in ${family?.name || 'Famiglia'}`, {
    body: task.title || 'Apri FAMMY per vederlo',
    icon: '/icon.png', badge: '/icon.png',
    tag: `new-task-${task.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showUrgentTaskNotification(task, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  const notification = new Notification(`🚨 Incarico urgente in ${family?.name || 'Famiglia'}`, {
    body: `${task.title} ha bisogno di attenzione`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `urgent-task-${task.id}`, requireInteraction: true,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showDelegatedTaskNotification(task, family) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  const notification = new Notification(`🧡 Lo fai tu?`, {
    body: `Ti hanno chiesto di occuparti di: ${task.title}`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `delegated-task-${task.id}`, requireInteraction: true,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}

function showBirthdayNotification(member) {
  if (typeof Notification === 'undefined' || !('Notification' in window)) return;
  const notification = new Notification(`🎂 Compleanno domani!`, {
    body: `È il compleanno di ${member.name}! 🎉`,
    icon: '/icon.png', badge: '/icon.png',
    tag: `birthday-${member.id}`, requireInteraction: false,
  });
  notification.addEventListener('click', () => { window.focus(); notification.close(); });
}
