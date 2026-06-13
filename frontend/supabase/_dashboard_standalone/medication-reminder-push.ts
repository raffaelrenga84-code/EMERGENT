// =============================================================================
// FAMMY — medication-reminder-push
// =============================================================================
// Cron Edge Function eseguita ogni minuto via pg_cron.
//
// Logica:
//   1. Calcola "now" (UTC) e "ora corrente" in HH:MM
//   2. Cerca tutte le medicines attive con `times_of_day` che contiene
//      l'ora corrente (entro la finestra del minuto)
//   3. Per ciascuna, controlla se per oggi NON c'è già un log
//      (taken/skipped). Se c'è snoozed, usa snoozed_until.
//   4. Manda push a tutti i membri della famiglia del medicato
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

function todayStartUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function timeKey(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// Data (YYYY-MM-DD) e minuti correnti nel fuso Europe/Rome — gli orari delle
// medicine sono inseriti dagli utenti in ora locale italiana, NON in UTC.
function nowInRome(now: Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // "YYYY-MM-DD"
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now); // "HH:MM"
  const [h, m] = time.split(':').map(Number);
  return { date, minutes: h * 60 + m };
}

// Orari attivi OGGI per una medicina con eventuali fasi di frequenza
// (schedule_phases: [{from:'YYYY-MM-DD', times:['08:00']}]). L'ultima fase
// con from <= oggi vince; senza fasi valide → times_of_day.
function activeTimesForToday(med: { schedule_phases?: unknown; times_of_day?: string[] }, todayYMD: string): string[] {
  const phases = Array.isArray(med.schedule_phases)
    ? (med.schedule_phases as Array<{ from?: string; times?: string[] }>).filter((p) => p && p.from)
    : [];
  if (phases.length > 0) {
    const sorted = [...phases].sort((a, b) => String(a.from).localeCompare(String(b.from)));
    let act: { from?: string; times?: string[] } | null = null;
    for (const p of sorted) if (String(p.from) <= todayYMD) act = p;
    if (act) return act.times || [];
  }
  return med.times_of_day || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const now = new Date();
    const currentTime = timeKey(now);
    const rome = nowInRome(now);
    const dayStart = todayStartUTC();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Carico TUTTE le medicine attive (potremmo filtrare per times_of_day @>
    // [currentTime] ma fallback safe). Limitare le righe è utile su grandi DB.
    const { data: meds } = await supabaseAdmin
      .from('medications')
      .select('id, name, dose, times_of_day, member_id, start_date, end_date, schedule_phases')
      .eq('active', true);

    if (!meds || meds.length === 0) return json({ sent: 0, reason: 'no_active_medications' });

    // Pre-fetch logs di OGGI per evitare doppie notifiche
    const medIds = meds.map((m) => m.id);
    const { data: logs } = await supabaseAdmin
      .from('medication_logs')
      .select('medication_id, scheduled_at, action, snoozed_until')
      .in('medication_id', medIds)
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString());

    // Mappa: medication_id -> [logs]
    const logsByMed = new Map<string, any[]>();
    for (const l of (logs || [])) {
      const arr = logsByMed.get(l.medication_id) || [];
      arr.push(l);
      logsByMed.set(l.medication_id, arr);
    }

    let sentTotal = 0;
    let skippedAlreadyHandled = 0;

    for (const med of meds) {
      // Finestra del periodo di assunzione (start/end in data Roma)
      if (med.start_date && String(med.start_date) > rome.date) continue;
      if (med.end_date && String(med.end_date) < rome.date) continue;

      // Orari attivi oggi (fasi di frequenza variabile o times_of_day base)
      const times = activeTimesForToday(med, rome.date);
      // Match con ORA ITALIANA corrente (con tolleranza ±1 minuto)
      const nowMinutes = rome.minutes;
      const matched = times.find((tStr: string) => {
        const [h, m] = tStr.split(':').map(Number);
        const tMinutes = h * 60 + m;
        // ±1 minuto (per evitare di mancare il push se il cron parte a XX:30:59)
        return Math.abs(tMinutes - nowMinutes) <= 1;
      });
      if (!matched) continue;

      // scheduled_at = istante UTC dell'orario italiano matchato.
      // Visto che |orario - adesso| <= 1 min, lo ricaviamo da `now` spostandolo
      // della differenza e azzerando i secondi (indipendente dall'offset CET/CEST).
      const [h, m] = matched.split(':').map(Number);
      const diffMin = (h * 60 + m) - nowMinutes;
      const scheduledAt = new Date(Math.floor(now.getTime() / 60000) * 60000 + diffMin * 60000);
      const scheduledISO = scheduledAt.toISOString();

      // Già gestito (taken/skipped) per questo scheduled_at?
      const medLogs = logsByMed.get(med.id) || [];
      const finalized = medLogs.some((l) =>
        (l.action === 'taken' || l.action === 'skipped') &&
        new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
      );
      if (finalized) { skippedAlreadyHandled++; continue; }

      // Anti-double-fire: se già esiste un log "snoozed" per questo orario,
      // significa che abbiamo già notificato — ignoriamo (il prossimo
      // controllo userà snoozed_until).
      // Tuttavia se snoozed_until è già passato, dobbiamo notificare di nuovo.
      const snoozeLog = medLogs.find((l) =>
        l.action === 'snoozed' &&
        new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
      );
      if (snoozeLog && snoozeLog.snoozed_until) {
        if (new Date(snoozeLog.snoozed_until).getTime() > now.getTime()) {
          // Ancora in finestra snooze, salta
          skippedAlreadyHandled++; continue;
        }
      }

      // Risali al membro target (incluso cared_by) e poi calcola il target
      // della notifica: caregiver assegnati (se presenti) → solo loro;
      // altrimenti fallback alla famiglia intera.
      const { data: targetMember } = await supabaseAdmin
        .from('members').select('id, name, family_id, user_id, cared_by').eq('id', med.member_id).single();
      if (!targetMember) continue;

      const caredBy: string[] = (targetMember as any).cared_by || [];
      let userIds: string[] = [];

      if (caredBy.length > 0) {
        // Caregivers assegnati → notifichiamo SOLO loro (più l'assistito se ha
        // anche lui un account, per doppio canale di sicurezza).
        const { data: cgs } = await supabaseAdmin
          .from('members').select('id, user_id').in('id', caredBy);
        userIds = (cgs || []).map((m: any) => m.user_id).filter(Boolean);
        if (targetMember.user_id) userIds.push(targetMember.user_id);
      } else {
        // STRICT (13 giu 2026): nessun caregiver selezionato → solo l'assistito
        // stesso (se ha un account) riceve la notifica. NIENTE fallback
        // "tutta la famiglia" — era confondente: l'utente non capiva perché
        // gli arrivassero notifiche di medicine altrui senza essere stato
        // selezionato come caregiver.
        if (targetMember.user_id) userIds = [targetMember.user_id];
      }

      // Dedup
      userIds = Array.from(new Set(userIds));
      if (userIds.length === 0) continue;

      // Chiama la stessa Edge Function send-push (riusa la logica web-push)
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
            title: `💊 ${targetMember.name}: ${med.name}`,
            body: med.dose
              ? `È ora di prendere ${med.dose} · 🕒 ${matched}`
              : `È ora! · 🕒 ${matched}`,
            tag: `med-reminder-${med.id}-${matched}`,
            data: {
              kind: 'medication',
              medication_id: med.id,
              member_id: targetMember.id,
              scheduled_at: scheduledISO,
            },
          }),
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          sentTotal += j?.sent || 0;
        }
      } catch (_) { /* skip silent */ }
    }

    return json({
      sent_total: sentTotal,
      skipped_already_handled: skippedAlreadyHandled,
      current_time_utc: currentTime,
    });
  } catch (err) {
    console.error('medication-reminder-push error:', err);
    return json({ error: String(err) }, 500);
  }
});
