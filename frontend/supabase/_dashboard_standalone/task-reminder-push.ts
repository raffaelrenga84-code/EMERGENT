// =============================================================================
// FAMMY — task-reminder-push
// =============================================================================
// Cron Edge Function eseguita ogni minuto via pg_cron (vedi
// fammy-task-reminder-cron.sql).
//
// Logica:
//   1. Calcola data e ora correnti in EUROPE/ROME (gli utenti inseriscono
//      l'orario in ora locale italiana)
//   2. Cerca i task NON completati con due_date = oggi e due_time = adesso
//   3. Manda una push agli ASSEGNATARI del task (chi se lo è messo come
//      promemoria personale lo riceve al giorno e all'ora impostati)
//
// Body: nessuno (cron trigger) o { manual: true } per test
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

// Data (YYYY-MM-DD) e ora (HH:MM) correnti nel fuso Europe/Rome
function nowInRome() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // "YYYY-MM-DD"
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now); // "HH:MM"
  return { date, time };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { date: todayRome, time: nowRome } = nowInRome();

    // =====================================================================
    // A) CODA "NUOVO INCARICO" (debounce ~45s per conoscere gli assegnatari)
    //    Il trigger su tasks accoda in task_notify_queue; qui inviamo la
    //    push alla famiglia ESCLUDENDO autore e assegnatari (che hanno già
    //    ricevuto "Assegnato a te" dal trigger immediato).
    // =====================================================================
    let queueSent = 0;
    try {
      const cutoff = new Date(Date.now() - 45000).toISOString();
      const { data: queued } = await supabaseAdmin
        .from('task_notify_queue')
        .select('task_id')
        .lt('created_at', cutoff)
        .limit(20);

      for (const q of queued || []) {
        const removeFromQueue = () =>
          supabaseAdmin.from('task_notify_queue').delete().eq('task_id', q.task_id);

        const { data: task } = await supabaseAdmin
          .from('tasks')
          .select('id, title, family_id, author_id')
          .eq('id', q.task_id)
          .maybeSingle();
        if (!task) { await removeFromQueue(); continue; }

        const { data: asg } = await supabaseAdmin
          .from('task_assignees').select('member_id').eq('task_id', task.id);
        const assigneeMemberIds = new Set((asg || []).map((a) => a.member_id));

        const { data: fam } = await supabaseAdmin
          .from('members').select('id, user_id, name').eq('family_id', task.family_id);

        // L'autore può essere un membro di UN'ALTRA famiglia (task creato
        // dalla vista multi-famiglia): lookup globale di fallback.
        let author = (fam || []).find((m) => m.id === task.author_id) || null;
        if (!author && task.author_id) {
          const { data: a } = await supabaseAdmin
            .from('members').select('id, user_id, name')
            .eq('id', task.author_id).maybeSingle();
          author = a || null;
        }
        const excluded = new Set<string>();
        if (author?.user_id) excluded.add(author.user_id);
        for (const m of fam || []) {
          if (assigneeMemberIds.has(m.id) && m.user_id) excluded.add(m.user_id);
        }
        const recipients = [...new Set(
          (fam || []).map((m) => m.user_id).filter(Boolean) as string[]
        )].filter((u) => !excluded.has(u));

        if (recipients.length > 0) {
          await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              user_ids: recipients,
              title: `📌 ${author?.name || 'FAMMY'} · Nuovo incarico`,
              body: task.title || 'Nuovo incarico aggiunto',
              tag: `task-new-${task.id}`,
              data: { kind: 'task_new', task_id: task.id, family_id: task.family_id, url: `/?task=${task.id}` },
            }),
          }).catch(() => {});
          queueSent += recipients.length;
        }
        await removeFromQueue();
      }
    } catch (e) {
      console.warn('task_notify_queue error:', e);
    }

    // =====================================================================
    // B) PROMEMORIA A ORARIO (due_date = oggi, due_time = adesso)
    // =====================================================================

    // Task di OGGI con orario impostato e non ancora completati
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, due_time, status, family_id')
      .eq('due_date', todayRome)
      .not('due_time', 'is', null)
      .neq('status', 'done');

    if (!tasks || tasks.length === 0) {
      return json({ queue_sent: queueSent, sent: 0, reason: 'no_tasks_today', now_rome: `${todayRome} ${nowRome}` });
    }

    // Match sull'orario corrente (due_time può essere "HH:MM" o "HH:MM:SS")
    const dueNow = tasks.filter((t) => String(t.due_time).slice(0, 5) === nowRome);
    if (dueNow.length === 0) {
      return json({ queue_sent: queueSent, sent: 0, reason: 'no_match_this_minute', now_rome: `${todayRome} ${nowRome}` });
    }

    let sentTotal = 0;
    const details: Array<{ task: string; users: number }> = [];

    for (const task of dueNow) {
      // Assegnatari → user_id (i placeholder senza account vengono ignorati)
      const { data: asg } = await supabaseAdmin
        .from('task_assignees').select('member_id').eq('task_id', task.id);
      const memberIds = (asg || []).map((a) => a.member_id);
      if (memberIds.length === 0) continue;

      const { data: ms } = await supabaseAdmin
        .from('members').select('id, user_id').in('id', memberIds);
      const userIds = Array.from(new Set((ms || []).map((m) => m.user_id).filter(Boolean)));
      if (userIds.length === 0) continue;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            user_ids: userIds,
            title: `⏰ ${task.title}`,
            body: `È l'ora che avevi impostato · 🕒 ${nowRome}`,
            tag: `task-due-${task.id}`,
            data: { kind: 'task', task_id: task.id },
          }),
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          sentTotal += j?.sent || 0;
          details.push({ task: task.id, users: userIds.length });
        }
      } catch (_) { /* skip silent */ }
    }

    return json({ queue_sent: queueSent, sent_total: sentTotal, matched_tasks: dueNow.length, details, now_rome: `${todayRome} ${nowRome}` });
  } catch (err) {
    console.error('task-reminder-push error:', err);
    return json({ error: String(err) }, 500);
  }
});
