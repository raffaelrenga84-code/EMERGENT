// useUnreadTaskCount — calcola in tempo reale il numero di task che hanno
// commenti NUOVI dopo la mia ultima apertura del task.
//
// Persistenza: in localStorage usiamo una chiave per ogni task:
//   `fammy_task_lastread_<task_id>` = ISO timestamp dell'ultima apertura.
//
// Quando apri il TaskDetailModal, chiama `markTaskRead(taskId)` per resettare
// il count. Il hook restituisce:
//   - unreadTaskIds: Set<string> dei task con messaggi non letti
//   - count: number (size del Set)
//
// La query è fatta una volta all'apertura (taskList cambia) e poi si
// affida al realtime di Supabase per aggiornarsi (postgres_changes su
// task_responses).

import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const LAST_READ_KEY = (taskId) => `fammy_task_lastread_${taskId}`;

export function markTaskRead(taskId) {
  try {
    localStorage.setItem(LAST_READ_KEY(taskId), new Date().toISOString());
    // Notifica eventuali listener di re-fetchare
    window.dispatchEvent(new CustomEvent('fammy:task-read', { detail: { taskId } }));
  } catch (_) {}
}

export function useUnreadTaskCount(tasks = [], myMemberIds = new Set()) {
  const [unreadTaskIds, setUnreadTaskIds] = useState(new Set());

  const taskIds = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'paid')
    .map((t) => t.id);

  useEffect(() => {
    let cancelled = false;
    if (taskIds.length === 0) {
      setUnreadTaskIds(new Set());
      return;
    }

    const compute = async () => {
      // Per ogni task: prendiamo gli ultimi task_responses NON miei.
      // Confrontiamo con `lastRead` in localStorage.
      const { data } = await supabase
        .from('task_responses')
        .select('id, task_id, author_id, created_at, type')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false })
        .limit(500); // safety cap

      if (cancelled) return;
      const unread = new Set();
      const byTask = new Map();
      for (const r of (data || [])) {
        if (r.type === 'system') continue;
        if (myMemberIds.has(r.author_id)) continue; // commento mio
        if (!byTask.has(r.task_id)) byTask.set(r.task_id, r.created_at);
      }
      for (const [taskId, latestAt] of byTask.entries()) {
        let lastRead = null;
        try { lastRead = localStorage.getItem(LAST_READ_KEY(taskId)); } catch (_) {}
        if (!lastRead || new Date(latestAt) > new Date(lastRead)) {
          unread.add(taskId);
        }
      }
      if (!cancelled) setUnreadTaskIds(unread);
    };

    compute();

    // Realtime: nuovi commenti → ricalcola
    const channel = supabase
      .channel('home-unread-task-responses')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_responses',
      }, () => { compute(); })
      .subscribe();

    // Quando markTaskRead viene chiamato → ricalcola
    const onRead = () => compute();
    window.addEventListener('fammy:task-read', onRead);

    return () => {
      cancelled = true;
      window.removeEventListener('fammy:task-read', onRead);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds.join(','), [...myMemberIds].join(',')]);

  return { unreadTaskIds, count: unreadTaskIds.size };
}
