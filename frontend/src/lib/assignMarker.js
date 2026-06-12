// assignMarker — anti-falsa-notifica "X se ne occupa".
//
// Quando l'utente CORRENTE modifica gli assegnatari di un task su questo
// dispositivo (creazione, modifica, delega, riassegnazione da assenza),
// segniamo il task con un timestamp. Il watcher realtime di task_assignees
// (useEventNotifications) controlla il marker e NON mostra la notifica
// "✅ X se ne occupa" per azioni fatte da me stesso: quella notifica ha
// senso solo quando QUALCUN ALTRO si prende in carico un mio incarico.
const KEY = (taskId) => `fammy_assign_marker_${taskId}`;

export function markSelfAssignment(taskId) {
  if (!taskId) return;
  try { localStorage.setItem(KEY(taskId), String(Date.now())); } catch (_) { /* ignore */ }
}

export function wasSelfAssignment(taskId, windowMs = 90000) {
  if (!taskId) return false;
  try {
    const v = Number(localStorage.getItem(KEY(taskId)) || 0);
    return v > 0 && (Date.now() - v) < windowMs;
  } catch (_) { return false; }
}
