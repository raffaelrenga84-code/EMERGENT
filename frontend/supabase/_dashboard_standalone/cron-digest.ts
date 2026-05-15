// =============================================================================
// FAMMY — cron-digest (digest serale 21:00 + weekly summary domenica)
// =============================================================================
// Chiamata da pg_cron via SQL. Per ogni utente con almeno una push_subscription:
//   - kind="daily"  → conta i task con due_date=domani non done + eventi domani,
//                     invia "🌙 Pronto per domani? Domani ti aspettano X task e Y eventi"
//   - kind="weekly" → conta i task done della settimana e gli upcoming events,
//                     invia "✨ Riepilogo settimanale pronto"
//
// Non chiama Gemini (riduce costi / latency). La generazione AI completa la fa
// il frontend quando l'utente apre l'app dopo la notifica.
//
// Body: { kind: "daily" | "weekly" }
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

  // 2) Per ogni user, calcola il payload del digest
  // Per efficienza: una sola query batch per tasks/events, poi filter per family
  const { data: members } = await supabaseAdmin
    .from('members')
    .select('user_id, id, family_id')
    .in('user_id', userIds);

  if (!members || members.length === 0) return json({ kind, sent: 0, reason: 'no_members' });

  const familyIds = [...new Set(members.map((m) => m.family_id))];
  const memberIdToUser: Record<string, string> = {};
  const userToFamilies: Record<string, string[]> = {};
  for (const m of members) {
    memberIdToUser[m.id] = m.user_id;
    (userToFamilies[m.user_id] = userToFamilies[m.user_id] || []).push(m.family_id);
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

  // === Daily digest ===
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = dayKey(tomorrow);
  const startTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const endTomorrow = new Date(startTomorrow);
  endTomorrow.setDate(endTomorrow.getDate() + 1);

  const { data: tomorrowTasks } = await supabaseAdmin
    .from('tasks')
    .select('id, family_id, due_date, status, assigned_to, author_id')
    .neq('status', 'done')
    .in('family_id', familyIds)
    .not('due_date', 'is', null);

  const { data: tomorrowEvents } = await supabaseAdmin
    .from('events')
    .select('id, family_id, starts_at, created_by')
    .gte('starts_at', startTomorrow.toISOString())
    .lt('starts_at', endTomorrow.toISOString())
    .in('family_id', familyIds);

  // Filter per due_date == tomorrow (string compare)
  const filteredTasks = (tomorrowTasks || []).filter(
    (t) => String(t.due_date).slice(0, 10) === tomorrowKey
  );

  const sendList: { uid: string; body: string }[] = [];
  for (const uid of userIds) {
    const fams = new Set(userToFamilies[uid] || []);
    const userMemberIds = members.filter((m) => m.user_id === uid).map((m) => m.id);
    const myMemberSet = new Set(userMemberIds);

    // Tasks: ASSEGNATI a me (assigned_to in myMember) o autore
    const myTasks = filteredTasks.filter(
      (t) => fams.has(t.family_id) && (myMemberSet.has(t.assigned_to) || myMemberSet.has(t.author_id))
    );
    // Tasks "famiglia" (no specifica assegnazione): chiunque della famiglia
    const familyTasks = filteredTasks.filter(
      (t) => fams.has(t.family_id) && !t.assigned_to
    );
    const totalTasks = myTasks.length + familyTasks.length;
    const totalEvents = (tomorrowEvents || []).filter((e) => fams.has(e.family_id)).length;

    if (totalTasks === 0 && totalEvents === 0) continue;

    const parts: string[] = [];
    if (totalTasks > 0) parts.push(totalTasks === 1 ? '1 incarico' : `${totalTasks} incarichi`);
    if (totalEvents > 0) parts.push(totalEvents === 1 ? '1 evento' : `${totalEvents} eventi`);
    const body = `Domani ti aspettano ${parts.join(' e ')}. Buona serata! 🌙`;
    sendList.push({ uid, body });
  }

  // Invio aggregato (ottimizzazione: raggruppa stessi body, ma per semplicita' inviamo uno per uno)
  let sentTotal = 0;
  await Promise.all(sendList.map(async ({ uid, body }) => {
    const r = await sendPushTo([uid], '🌙 Pronto per domani?', body, 'daily-digest');
    if (r?.sent) sentTotal += r.sent;
  }));

  return json({
    kind, candidate_users: userIds.length, eligible_users: sendList.length, total_pushes_sent: sentTotal,
  });
});
