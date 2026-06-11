// =============================================================================
// FAMMY — cron-digest (digest mattutino 8:00 + serale 21:00 + weekly domenica)
// =============================================================================
// Chiamata da pg_cron via SQL. Per ogni utente con almeno una push_subscription:
//   - kind="morning" → conta i task con due_date=OGGI non done + eventi OGGI,
//                     invia "☀️ Buongiorno! Oggi ti aspettano X incarichi e Y eventi"
//   - kind="daily"  → conta i task con due_date=domani non done + eventi domani,
//                     invia "🌙 Pronto per domani? Domani ti aspettano X task e Y eventi"
//   - kind="weekly" → conta i task done della settimana e gli upcoming events,
//                     invia "✨ Riepilogo settimanale pronto"
//
// Non chiama Gemini (riduce costi / latency). La generazione AI completa la fa
// il frontend quando l'utente apre l'app dopo la notifica.
//
// Body: { kind: "daily" | "weekly" }
//
// IMPORTANT: questa funzione gestisce
//   - multi-assegnatari (tabella `task_assignees`), non solo legacy `assigned_to`
//   - task ricorrenti (`recurring_days` + `recurring_until` + `recurring_exceptions`
//     + `task_completions`)
//   - eventi ricorrenti (`recurring_days` + `recurring_until` + `recurring_exceptions`)
// =============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Weekday convention FAMMY: 0=Lunedì, 1=Martedì, ..., 6=Domenica
// JS getDay() restituisce 0=Sunday, 1=Monday, ..., 6=Saturday → conversione:
function fammyWeekday(d: Date) {
  const js = d.getDay();        // 0=Sun, 1=Mon, ..., 6=Sat
  return (js + 6) % 7;          // 0=Mon, ..., 6=Sun
}

// True se la data target è una occorrenza valida del task/evento ricorrente.
function isRecurringOccurrence(
  recurringDays: number[] | null | undefined,
  recurringUntil: string | null | undefined,
  recurringExceptions: string[] | null | undefined,
  targetDate: Date,
  targetDateKey: string,
): boolean {
  if (!recurringDays || recurringDays.length === 0) return false;
  const wd = fammyWeekday(targetDate);
  if (!recurringDays.includes(wd)) return false;
  if (recurringUntil) {
    // recurring_until è una date YYYY-MM-DD: skip se target > until
    if (targetDateKey > String(recurringUntil).slice(0, 10)) return false;
  }
  if (recurringExceptions && recurringExceptions.includes(targetDateKey)) return false;
  return true;
}

async function sendPushTo(userIds: string[], title: string, body: string, tag: string) {
  if (userIds.length === 0) return { sent: 0 };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ user_ids: userIds, title, body, tag }),
  });
  return await res.json().catch(() => ({ sent: 0 }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: { kind?: string };
  try { payload = await req.json(); } catch { payload = {}; }
  const kind = payload.kind || 'daily';

  // 1) Recupera tutti gli utenti con almeno una subscription attiva
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id');
  if (subsErr) return json({ error: subsErr.message }, 500);

  const userIds = [...new Set((subs || []).map((s) => s.user_id))];
  if (userIds.length === 0) return json({ kind, sent: 0, reason: 'no_users_subscribed' });

  // 2) Membri (per mappare user_id -> family_ids + member_ids)
  const { data: members } = await supabaseAdmin
    .from('members')
    .select('user_id, id, family_id')
    .in('user_id', userIds);

  if (!members || members.length === 0) return json({ kind, sent: 0, reason: 'no_members' });

  const familyIds = [...new Set(members.map((m) => m.family_id))];
  const userToFamilies: Record<string, string[]> = {};
  const userToMemberIds: Record<string, string[]> = {};
  for (const m of members) {
    (userToFamilies[m.user_id] = userToFamilies[m.user_id] || []).push(m.family_id);
    (userToMemberIds[m.user_id] = userToMemberIds[m.user_id] || []).push(m.id);
  }

  if (kind === 'weekly') {
    // Weekly: per ogni utente, conta task done negli ultimi 7gg + eventi prossima settimana
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysFwd = new Date();
    sevenDaysFwd.setDate(sevenDaysFwd.getDate() + 7);

    const { data: doneTasks } = await supabaseAdmin
      .from('tasks').select('family_id, completed_at, status')
      .eq('status', 'done')
      .gte('completed_at', sevenDaysAgo.toISOString())
      .in('family_id', familyIds);

    const { data: upcomingEvents } = await supabaseAdmin
      .from('events').select('family_id, starts_at')
      .gte('starts_at', new Date().toISOString())
      .lte('starts_at', sevenDaysFwd.toISOString())
      .in('family_id', familyIds);

    const sendList: string[] = [];
    for (const uid of userIds) {
      const fams = new Set(userToFamilies[uid] || []);
      const dCount = (doneTasks || []).filter((t) => fams.has(t.family_id)).length;
      const eCount = (upcomingEvents || []).filter((e) => fams.has(e.family_id)).length;
      // Skip se totale 0 (no spam)
      if (dCount === 0 && eCount === 0) continue;
      sendList.push(uid);
    }

    const result = await sendPushTo(
      sendList,
      '✨ Riepilogo della settimana',
      'Apri FAMMY per vedere com\'è andata e cosa ti aspetta!',
      'weekly-summary',
    );
    return json({ kind, candidate_users: userIds.length, sent_users: sendList.length, ...result });
  }

  // =========================================
  // ===== Daily digest (morning | daily) =====
  // =========================================
  // morning → la giornata di OGGI (cron 8:00). daily → DOMANI (cron 21:00).
  const isMorning = kind === 'morning';
  const target = new Date();
  if (!isMorning) target.setDate(target.getDate() + 1);
  const targetKey = dayKey(target);
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const endTarget = new Date(startTarget);
  endTarget.setDate(endTarget.getDate() + 1);

  // 3a) TASK: tutti i non-done delle famiglie target
  //     Includiamo SIA single (due_date=domani) SIA ricorrenti (recurring_days).
  const { data: allTasks } = await supabaseAdmin
    .from('tasks')
    .select('id, family_id, due_date, status, author_id, recurring_days, recurring_until, recurring_exceptions')
    .neq('status', 'done')
    .in('family_id', familyIds);

  // 3b) TASK_ASSIGNEES: chi è assegnato a quali task (multi-assignee).
  //     Filtra solo sui task selezionati sopra.
  const taskIds = (allTasks || []).map((t) => t.id);
  let assigneesByTask: Record<string, string[]> = {};
  let assignedTaskIds = new Set<string>();
  if (taskIds.length > 0) {
    const { data: ass } = await supabaseAdmin
      .from('task_assignees')
      .select('task_id, member_id')
      .in('task_id', taskIds);
    for (const a of ass || []) {
      (assigneesByTask[a.task_id] = assigneesByTask[a.task_id] || []).push(a.member_id);
      assignedTaskIds.add(a.task_id);
    }
  }

  // 3c) TASK_COMPLETIONS: istanze ricorrenti già completate per il giorno target
  let completedForTarget = new Set<string>();
  if (taskIds.length > 0) {
    const { data: comps } = await supabaseAdmin
      .from('task_completions')
      .select('task_id, occurrence_date')
      .in('task_id', taskIds)
      .eq('occurrence_date', targetKey);
    for (const c of comps || []) completedForTarget.add(c.task_id);
  }

  // 3d) Calcola quali task "scadono" nel giorno target (single OR ricorrente valido)
  const targetTasks = (allTasks || []).filter((t) => {
    if (completedForTarget.has(t.id)) return false;
    // Single task con due_date specifica
    if (t.due_date && String(t.due_date).slice(0, 10) === targetKey) return true;
    // Task ricorrente che cade nel giorno target
    return isRecurringOccurrence(
      t.recurring_days,
      t.recurring_until,
      t.recurring_exceptions,
      target,
      targetKey,
    );
  });

  // 4) EVENTI: include single + ricorrenti
  const { data: allEvents } = await supabaseAdmin
    .from('events')
    .select('id, family_id, starts_at, recurring_days, recurring_until, recurring_exceptions')
    .in('family_id', familyIds);

  const targetEvents = (allEvents || []).filter((e) => {
    if (!e.starts_at) return false;
    const startMs = new Date(e.starts_at).getTime();
    // Single event con starts_at che cade in [startTarget, endTarget)
    if (startMs >= startTarget.getTime() && startMs < endTarget.getTime()) return true;
    // Evento ricorrente: la prima occorrenza è precedente o uguale al target,
    // e il pattern include il giorno target come giorno valido
    if (startMs > endTarget.getTime()) return false; // partirà solo dopo il target
    return isRecurringOccurrence(
      e.recurring_days,
      e.recurring_until,
      e.recurring_exceptions,
      target,
      targetKey,
    );
  });

  // 5) Per ogni utente, conta task ed eventi rilevanti
  const sendList: { uid: string; body: string }[] = [];
  for (const uid of userIds) {
    const fams = new Set(userToFamilies[uid] || []);
    const myMemberSet = new Set(userToMemberIds[uid] || []);

    // Task del giorno per questo utente:
    //   - assegnato a me (in task_assignees) — MULTI-ASSIGNEE
    //   - oppure io sono l'autore
    //   - oppure non c'è alcun assegnatario → "task di famiglia" rilevante per tutti
    const myTasks = targetTasks.filter((t) => {
      if (!fams.has(t.family_id)) return false;
      const ass = assigneesByTask[t.id] || [];
      const isAssignedToMe = ass.some((mid) => myMemberSet.has(mid));
      const isMyAuthor = t.author_id && myMemberSet.has(t.author_id);
      const hasNoAssignee = ass.length === 0;
      return isAssignedToMe || isMyAuthor || hasNoAssignee;
    });

    const myEvents = targetEvents.filter((e) => fams.has(e.family_id));

    const totalTasks = myTasks.length;
    const totalEvents = myEvents.length;
    if (totalTasks === 0 && totalEvents === 0) continue;

    const parts: string[] = [];
    if (totalTasks > 0) parts.push(totalTasks === 1 ? '1 incarico' : `${totalTasks} incarichi`);
    if (totalEvents > 0) parts.push(totalEvents === 1 ? '1 evento' : `${totalEvents} eventi`);
    const body = isMorning
      ? `Oggi ti aspettano ${parts.join(' e ')}. Buona giornata! ☀️`
      : `Domani ti aspettano ${parts.join(' e ')}. Buona serata! 🌙`;
    sendList.push({ uid, body });
  }

  // Invio aggregato
  const pushTitle = isMorning ? '☀️ Buongiorno! Ecco la tua giornata' : '🌙 Pronto per domani?';
  const pushTag = isMorning ? 'morning-digest' : 'daily-digest';
  let sentTotal = 0;
  await Promise.all(sendList.map(async ({ uid, body }) => {
    const r = await sendPushTo([uid], pushTitle, body, pushTag);
    if (r?.sent) sentTotal += r.sent;
  }));

  return json({
    kind,
    candidate_users: userIds.length,
    eligible_users: sendList.length,
    total_pushes_sent: sentTotal,
    // Diagnostica (utile in fase di debug, niente PII):
    debug: {
      target_key: targetKey,
      target_weekday: fammyWeekday(target),
      total_tasks_window: targetTasks.length,
      total_events_window: targetEvents.length,
    },
  });
});
