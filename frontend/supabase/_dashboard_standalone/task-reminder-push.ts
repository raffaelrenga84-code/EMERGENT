// =============================================================================
// FAMMY — task-reminder-push
// =============================================================================
// Cron Edge Function eseguita ogni minuto via pg_cron (vedi
// fammy-task-reminder-cron.sql).
//
// Logica:
//   1. Calcola data e ora correnti in EUROPE/ROME (gli utenti inseriscono
//      l'orario in ora locale italiana)
//   2. Cerca i task NON completati con due_date = oggi e due_time ≈ adesso
//      (finestra di catch-up: minuto esatto oppure fino a 1 minuto dopo)
//   3. Manda una push agli ASSEGNATARI del task (chi se lo è messo come
//      promemoria personale lo riceve al giorno e all'ora impostati)
//
// ANTI-DOPPIONE: la tolleranza ±1 minuto potrebbe far scattare lo stesso
// promemoria su due tick consecutivi del cron. Per evitarlo registriamo ogni
// invio in `task_reminder_sent` (PK = task_id+data+orario): il secondo
// tentativo viola la PK (errore 23505) e viene saltato.
// IMPORTANTE: se quella tabella NON esiste, la funzione NON si blocca →
// fa "fail-open" (invia comunque). In quel caso un eventuale doppione viene
// comunque collassato sul dispositivo grazie al `tag` identico.
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

// Data (YYYY-MM-DD), ora (HH:MM) e minuti-del-giorno correnti nel fuso Europe/Rome
function nowInRome() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // "YYYY-MM-DD"
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now); // "HH:MM"
  const [h, m] = time.split(':').map(Number);
  return { date, time, minutes: h * 60 + m };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { date: todayRome, time: nowRome, minutes: nowMinutes } = nowInRome();

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
    // C) FOLLOW-UP AL CREATORE (una volta al giorno, ore 18:00 Rome)
    //    Task che scadono DOMANI ancora status='todo' (nessuno se n'è preso
    //    carico) → push al CREATORE: "X non ha ancora interagito. Vuoi
    //    incaricare qualcun altro o scrivergli in chat?"
    //    Test manuale: POST con body { "manual_followup": true }
    // =====================================================================
    let followupSent = 0;
    let manualFollowup = false;
    try {
      const body = await req.json().catch(() => ({}));
      manualFollowup = !!body?.manual_followup;
    } catch (_) { /* no body (cron) */ }
    if (nowRome === '18:00' || manualFollowup) {
      try {
        const tomorrowRome = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(Date.now() + 24 * 3600 * 1000));

        const { data: pending } = await supabaseAdmin
          .from('tasks')
          .select('id, title, author_id, family_id')
          .eq('due_date', tomorrowRome)
          .eq('status', 'todo');

        for (const t of pending || []) {
          if (!t.author_id) continue;
          // Creatore → user_id (serve un account per ricevere push)
          const { data: author } = await supabaseAdmin
            .from('members').select('id, user_id').eq('id', t.author_id).maybeSingle();
          if (!author?.user_id) continue;

          // Assegnatari ≠ creatore (per il testo "X non ha interagito").
          const { data: asg } = await supabaseAdmin
            .from('task_assignees').select('member_id').eq('task_id', t.id);
          const allAsg = (asg || []).map((a) => a.member_id);
          const otherAsg = allAsg.filter((id) => id !== t.author_id);
          // Task assegnato SOLO al creatore stesso → è un suo promemoria
          // personale, niente follow-up "incarica qualcun altro".
          if (allAsg.length > 0 && otherAsg.length === 0) continue;

          let who = '';
          if (otherAsg.length > 0) {
            const { data: ms } = await supabaseAdmin
              .from('members').select('id, name').in('id', otherAsg);
            who = (ms || []).map((m) => (m.name || '').split(' ')[0])
              .filter(Boolean).join(', ');
          }

          await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              user_ids: [author.user_id],
              title: `👀 "${t.title}" scade domani`,
              body: who
                ? `${who} non ha ancora interagito. Vuoi incaricare qualcun altro o scrivergli in chat?`
                : `Nessuno se n'è ancora occupato. Vuoi incaricare qualcuno o scrivere in chat?`,
              tag: `task-followup-${t.id}`,
              data: { kind: 'task', task_id: t.id, url: `/?task=${t.id}` },
            }),
          }).catch(() => {});
          followupSent++;
        }
      } catch (e) {
        console.warn('followup creator error:', e);
      }
    }

    // =====================================================================
    // B) PROMEMORIA A ORARIO (due_date = oggi, due_time ≈ adesso)
    // =====================================================================

    // Task di OGGI con orario impostato e non ancora completati
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, due_time, status, family_id')
      .eq('due_date', todayRome)
      .not('due_time', 'is', null)
      .neq('status', 'done');

    if (!tasks || tasks.length === 0) {
      return json({ queue_sent: queueSent, followup_sent: followupSent, sent: 0, reason: 'no_tasks_today', now_rome: `${todayRome} ${nowRome}` });
    }

    // Finestra di catch-up: il promemoria scatta nel minuto ESATTO oppure
    // fino a 1 minuto DOPO (se il cron salta un tick). Mai in anticipo.
    // delta = (minuti correnti) - (minuti dell'orario impostato).
    const dueNow = tasks.filter((t) => {
      const hhmm = String(t.due_time).slice(0, 5);
      const [h, m] = hhmm.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return false;
      const delta = nowMinutes - (h * 60 + m);
      return delta === 0 || delta === 1;
    });
    if (dueNow.length === 0) {
      return json({ queue_sent: queueSent, followup_sent: followupSent, sent: 0, reason: 'no_match_this_minute', now_rome: `${todayRome} ${nowRome}` });
    }

    let sentTotal = 0;
    let skippedDuplicate = 0;
    const details: Array<{ task: string; users: number }> = [];

    for (const task of dueNow) {
      const dueHHMM = String(task.due_time).slice(0, 5);

      // Anti-doppione: prova a "prenotare" l'invio di questo task per questo
      // orario di oggi. Se la riga esiste già → 23505 → l'ha già mandato un
      // tick precedente, salta. Se l'errore è ALTRO (es. tabella mancante),
      // logga e prosegui comunque (fail-open: meglio un possibile doppione,
      // collassato dal tag, che un promemoria perso).
      const { error: dupErr } = await supabaseAdmin
        .from('task_reminder_sent')
        .insert({ task_id: task.id, scheduled_date: todayRome, scheduled_time: dueHHMM });
      if (dupErr) {
        if ((dupErr as { code?: string }).code === '23505') {
          skippedDuplicate++;
          continue;
        }
        console.warn('task_reminder_sent insert failed (non-conflict):', dupErr.message);
        // prosegue comunque (fail-open)
      }

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
            body: `È l'ora che avevi impostato · 🕒 ${dueHHMM}`,
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

    return json({
      queue_sent: queueSent,
      followup_sent: followupSent,
      sent_total: sentTotal,
      skipped_duplicate: skippedDuplicate,
      matched_tasks: dueNow.length,
      details,
      now_rome: `${todayRome} ${nowRome}`,
    });
  } catch (err) {
    console.error('task-reminder-push error:', err);
    return json({ error: String(err) }, 500);
  }
});
