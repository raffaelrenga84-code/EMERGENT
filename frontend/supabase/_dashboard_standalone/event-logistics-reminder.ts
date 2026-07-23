// =============================================================================
// FAMMY — event-logistics-reminder
// =============================================================================
// Cron Edge Function: promemoria "avvisa X prima" a chi porta / chi riprende.
// Va schedulata via pg_cron ogni 5 minuti (vedi snippet in fondo al file).
//
// Logica ad ogni tick:
//   1. Prende gli eventi con `logi_remind_min` impostato e almeno un taggato
//      (bring_member_id / pickup_member_id).
//   2. Per ciascuno calcola l'occorrenza rilevante:
//        - evento singolo  → il suo starts_at (assoluto).
//        - evento ricorrente → l'occorrenza di OGGI (se oggi è un giorno di
//          ricorrenza e non oltre recurring_until), stesso orario locale
//          (Europe/Rome) di starts_at, convertito in UTC (DST-aware).
//   3. Se adesso è dentro la finestra [occorrenza − logi_remind_min,
//      +5 min di catch-up), invia la push.
//   4. ANTI-DOPPIONE: inserisce (event_id, occ_date) in
//      event_logi_reminder_sent; se la PK è già presente (23505) salta.
//
// Test manuale: POST { "manual": true } → risponde con i conteggi.
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

// Finestra di catch-up: il cron gira ogni 5 min, tolleriamo fino a 6 minuti
// di ritardo dall'istante di promemoria. Mai in anticipo.
const CATCHUP_MS = 6 * 60 * 1000;

// Offset di Europe/Rome (in minuti) per un dato istante — gestisce CET/CEST.
function romeOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).reduce((a: Record<string, string>, p) => { a[p.type] = p.value; return a; }, {});
  const asRome = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asRome - d.getTime()) / 60000);
}
// "YYYY-MM-DD" + "HH:MM" locali (Rome) → Date UTC.
function romeLocalToUtc(dateStr: string, hh: number, mm: number): Date {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const guess = Date.UTC(Y, M - 1, D, hh, mm);
  const off = romeOffsetMinutes(new Date(guess));
  return new Date(guess - off * 60000);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const nowMs = Date.now();

    // Data di oggi (Rome) e weekday in convenzione app (0=Lun … 6=Dom)
    const romeToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const wdName = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome', weekday: 'short',
    }).format(new Date());
    const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const todayWd = WD[wdName];

    const { data: evs } = await supabaseAdmin
      .from('events')
      .select('id, title, starts_at, family_id, bring_member_id, pickup_member_id, logi_remind_min, recurring_days, recurring_until')
      .not('logi_remind_min', 'is', null)
      .or('bring_member_id.not.is.null,pickup_member_id.not.is.null');

    let sent = 0;
    let due = 0;

    for (const ev of evs || []) {
      if (!ev.starts_at || !ev.logi_remind_min) continue;
      const start = new Date(ev.starts_at);
      const days: number[] = Array.isArray(ev.recurring_days) ? ev.recurring_days : [];

      // Occorrenza rilevante
      let occMs: number;
      let occDate: string;
      if (days.length === 0) {
        occMs = start.getTime();
        occDate = ev.starts_at.slice(0, 10);
      } else {
        if (ev.recurring_until && romeToday > ev.recurring_until) continue;
        if (!days.includes(todayWd)) continue;
        // Orario locale (Rome) dell'evento
        const hhmm = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(start);
        const [hh, mm] = hhmm.split(':').map(Number);
        occMs = romeLocalToUtc(romeToday, hh, mm).getTime();
        occDate = romeToday;
      }

      const remindAtMs = occMs - ev.logi_remind_min * 60000;
      const delta = nowMs - remindAtMs;
      if (delta < 0 || delta > CATCHUP_MS) continue; // non ancora / troppo tardi
      due++;

      // Anti-doppione: se già inviato per questa occorrenza, l'insert fallisce.
      const { error: dupErr } = await supabaseAdmin
        .from('event_logi_reminder_sent')
        .insert({ event_id: ev.id, occ_date: occDate });
      if (dupErr) continue;

      // Destinatari: chi porta + chi riprende → user_id
      const memberIds = [ev.bring_member_id, ev.pickup_member_id].filter(Boolean);
      const { data: ms } = await supabaseAdmin
        .from('members').select('id, user_id').in('id', memberIds);
      const userIds = [...new Set((ms || []).map((m) => m.user_id).filter(Boolean))] as string[];
      if (userIds.length === 0) continue;

      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          user_ids: userIds,
          title: `🚗 ${ev.title || 'Evento'}`,
          body: 'Tra poco: ricordati che porti/riprendi.',
          tag: `event-logi-${ev.id}-${occDate}`,
          data: { kind: 'event_logistics', event_id: ev.id, url: '/?tab=agenda' },
        }),
      }).catch(() => {});
      sent += userIds.length;
    }

    return json({ ok: true, candidates: (evs || []).length, due, sent, today_rome: romeToday });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

// =============================================================================
// SCHEDULING (pg_cron) — esegui UNA VOLTA nel SQL Editor, come per gli altri
// cron che hai già. Sostituisci <SERVICE_ROLE_KEY> con la tua service-role key
// (Project Settings → API). L'URL usa il tuo project ref.
//
//   select cron.schedule(
//     'event-logistics-reminder', '*/5 * * * *',
//     $$ select net.http_post(
//          url := 'https://jwzoymvtxjzpymaywjtw.supabase.co/functions/v1/event-logistics-reminder',
//          headers := jsonb_build_object(
//            'Content-Type','application/json',
//            'Authorization','Bearer <SERVICE_ROLE_KEY>'),
//          body := '{}'::jsonb
//        ); $$
//   );
//
// Per rimuoverlo:  select cron.unschedule('event-logistics-reminder');
// =============================================================================
