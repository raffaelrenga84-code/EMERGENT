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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const now = new Date();
    const currentTime = timeKey(now);
    const dayStart = todayStartUTC();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Carico TUTTE le medicine attive (potremmo filtrare per times_of_day @>
    // [currentTime] ma fallback safe). Limitare le righe è utile su grandi DB.
    const { data: meds } = await supabaseAdmin
      .from('medications')
      .select('id, name, dose, times_of_day, member_id')
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
      const times = med.times_of_day || [];
      // Match con tempo corrente (con tolleranza ±1 minuto per evitare drift)
      const hh = now.getUTCHours();
      const mm = now.getUTCMinutes();
      const nowMinutes = hh * 60 + mm;
      const matched = times.find((tStr: string) => {
        const [h, m] = tStr.split(':').map(Number);
        const tMinutes = h * 60 + m;
        // ±1 minuto (per evitare di mancare il push se il cron parte a XX:30:59)
        return Math.abs(tMinutes - nowMinutes) <= 1;
      });
      if (!matched) continue;

      // Calcola scheduled_at del giorno corrente per quel time
      const [h, m] = matched.split(':').map(Number);
      const scheduledAt = new Date(dayStart);
      scheduledAt.setUTCHours(h, m, 0, 0);
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
        // Fallback comportamento storico: tutta la famiglia
        const { data: familyMembers } = await supabaseAdmin
          .from('members').select('user_id').eq('family_id', targetMember.family_id);
        userIds = (familyMembers || []).map((m: any) => m.user_id).filter(Boolean);
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
