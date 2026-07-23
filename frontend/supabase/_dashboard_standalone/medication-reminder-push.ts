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


// La medicina va presa in questa data? Considera giorni-settimana,
// ciclo on/off e intervallo giorni (speculare a medSchedule.isMedDueOn).
function medDueOnDate(med: any, dateYMD: string): boolean {
  const dows = med?.days_of_week;
  if (Array.isArray(dows) && dows.length > 0) {
    const dow = new Date(dateYMD + 'T12:00:00Z').getUTCDay();
    if (!dows.includes(dow)) return false;
  }
  const cOn = Number(med?.cycle_on_days) || 0;
  const cOff = Number(med?.cycle_off_days) || 0;
  if (cOn > 0 && cOff > 0 && med?.start_date) {
    const diffC = Math.round((Date.parse(dateYMD) - Date.parse(String(med.start_date))) / 86400000);
    if (diffC < 0) return false;
    if ((diffC % (cOn + cOff)) >= cOn) return false;
  }
  const interval = Number(med?.interval_days) || 1;
  if (interval > 1 && med?.start_date) {
    const diff = Math.round((Date.parse(dateYMD) - Date.parse(String(med.start_date))) / 86400000);
    if (diff < 0 || diff % interval !== 0) return false;
  }
  return true;
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
      .select('id, name, dose, times_of_day, member_id, start_date, end_date, schedule_phases, interval_days, days_of_week, cycle_on_days, cycle_off_days, notify_on_taken, reminder_recipients, supply_total, supply_left, supply_alert_sent')
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

      // Intervallo giorni (1 = ogni giorno, 2 = giorni alterni, N = ogni N).
      // Conteggio ancorato a start_date: quel giorno si prende, poi ogni N.
      // Senza start_date → fail-open (come ogni giorno).
      if (!medDueOnDate(med, rome.date)) continue;

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

      // Destinatari ESPLICITI scelti per questa terapia (reminder_recipients):
      // se valorizzati, comandano loro e ignoriamo la regola automatica.
      const explicit: string[] = (med as any).reminder_recipients || [];
      if (explicit.length > 0) {
        const { data: rcp } = await supabaseAdmin
          .from('members').select('id, user_id').in('id', explicit);
        userIds = (rcp || []).map((m: any) => m.user_id).filter(Boolean);
      } else if (caredBy.length > 0) {
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

    // =====================================================================
    // C) ESCALATION AI CAREGIVER — dose non registrata
    // ---------------------------------------------------------------------
    // Se una dose prevista non risulta né "presa" né "saltata" dopo
    // ESCALATION_AFTER_MIN minuti, avvisa i caregiver assegnati (cared_by).
    // - Solo per membri CON caregiver: senza, l'escalation non ha senso.
    // - Finestra 60–180 min: oltre non insistiamo (e al primo deploy non
    //   spariamo avvisi per dosi vecchie di stamattina).
    // - Anti-doppione: medication_escalation_sent (1 avviso per dose/giorno).
    // =====================================================================
    const ESCALATION_AFTER_MIN = 60;
    const ESCALATION_MAX_MIN = 180;
    let escalationsSent = 0;

    for (const med of meds) {
      // Stesse regole di attivazione della sezione reminder
      if (med.start_date && String(med.start_date) > rome.date) continue;
      if (med.end_date && String(med.end_date) < rome.date) continue;
      if (!medDueOnDate(med, rome.date)) continue;

      const times = activeTimesForToday(med, rome.date);
      if (times.length === 0) continue;
      const nowMinutes = rome.minutes;
      const medLogs = logsByMed.get(med.id) || [];

      for (const tStr of times) {
        const [h, m] = String(tStr).slice(0, 5).split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const delta = nowMinutes - (h * 60 + m);
        if (delta < ESCALATION_AFTER_MIN || delta > ESCALATION_MAX_MIN) continue;

        // Istante UTC della dose (stessa aritmetica della sezione B)
        const diffMin = (h * 60 + m) - nowMinutes;
        const scheduledAt = new Date(Math.floor(now.getTime() / 60000) * 60000 + diffMin * 60000);

        // Dose già gestita (presa/saltata)? Oppure snooze ancora attivo?
        const finalized = medLogs.some((l) =>
          (l.action === 'taken' || l.action === 'skipped') &&
          new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
        );
        if (finalized) continue;
        const snoozeLog = medLogs.find((l) =>
          l.action === 'snoozed' &&
          new Date(l.scheduled_at).getTime() === scheduledAt.getTime()
        );
        if (snoozeLog?.snoozed_until &&
            new Date(snoozeLog.snoozed_until).getTime() > now.getTime()) continue;

        // Solo membri con caregiver assegnati
        const { data: targetMember } = await supabaseAdmin
          .from('members').select('id, name, family_id, user_id, cared_by')
          .eq('id', med.member_id).single();
        if (!targetMember) continue;
        const caredBy: string[] = (targetMember as any).cared_by || [];
        if (caredBy.length === 0) continue;

        // Anti-doppione: prenota l'avviso per questa dose di oggi.
        const hhmm = String(tStr).slice(0, 5);
        const { error: dupErr } = await supabaseAdmin
          .from('medication_escalation_sent')
          .insert({ medication_id: med.id, scheduled_date: rome.date, scheduled_time: hhmm });
        if (dupErr) {
          if ((dupErr as { code?: string }).code === '23505') continue; // già avvisato
          console.warn('medication_escalation_sent insert failed:', dupErr.message);
          // fail-open: meglio un possibile doppione che un avviso perso
        }

        // Destinatari: SOLO i caregiver (l'assistito ha già ricevuto il
        // promemoria normale; qui avvisiamo chi si prende cura di lui).
        const { data: cgs } = await supabaseAdmin
          .from('members').select('id, user_id').in('id', caredBy);
        const cgUserIds = Array.from(new Set(
          (cgs || []).map((mm: any) => mm.user_id).filter(Boolean)
        )).filter((u) => u !== targetMember.user_id);
        if (cgUserIds.length === 0) continue;

        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: SUPABASE_SERVICE_ROLE_KEY,
            },
            body: JSON.stringify({
              user_ids: cgUserIds,
              title: `⚠️ ${targetMember.name}: ${med.name} non registrata`,
              body: `La dose delle ${hhmm} non risulta né presa né saltata da più di un'ora. Meglio controllare come sta.`,
              tag: `med-escalation-${med.id}-${hhmm}`,
              data: {
                kind: 'medication_escalation',
                medication_id: med.id,
                member_id: targetMember.id,
                scheduled_at: scheduledAt.toISOString(),
              },
            }),
          });
          if (res.ok) {
            const j = await res.json().catch(() => ({}));
            escalationsSent += j?.sent || 0;
          }
        } catch (_) { /* skip silent */ }
      }
    }

    // =====================================================================
    // D) AVVISO SCORTE — "sta per finire"
    // ---------------------------------------------------------------------
    // Se supply_left è tracciato e restano ≤ 7 giorni (o ≤ 5 dosi), invia
    // UNA push all'assistito + caregiver. supply_alert_sent evita ripetizioni
    // e si riarma quando le scorte vengono ricaricate dall'app.
    // =====================================================================
    let supplyAlertsSent = 0;

    for (const med of meds) {
      const m = med as {
        supply_left?: number | null; supply_alert_sent?: boolean;
        interval_days?: number; start_date?: string; end_date?: string;
      };
      if (m.supply_left === null || m.supply_left === undefined) continue;
      if (m.supply_alert_sent) continue;
      if (med.end_date && String(med.end_date) < rome.date) continue;

      const left = Number(m.supply_left);
      const perDue = activeTimesForToday(med, rome.date).length;
      const interval = Number(m.interval_days) || 1;
      const rate = perDue > 0 ? perDue / interval : 0;
      const daysLeft = rate > 0 ? Math.floor(left / rate) : null;
      const low = (daysLeft !== null && daysLeft <= 7) || left <= 5;
      if (!low) continue;

      // Prenota subito il flag (anti-doppione anche se il push fallisse:
      // fail-closed qui è ok, il banner in-app resta comunque visibile).
      const { error: flagErr } = await supabaseAdmin
        .from('medications')
        .update({ supply_alert_sent: true })
        .eq('id', med.id)
        .eq('supply_alert_sent', false);
      if (flagErr) continue;

      const { data: targetMember } = await supabaseAdmin
        .from('members').select('id, name, user_id, cared_by')
        .eq('id', med.member_id).single();
      if (!targetMember) continue;

      let userIds: string[] = [];
      const caredBy: string[] = (targetMember as any).cared_by || [];
      if (caredBy.length > 0) {
        const { data: cgs } = await supabaseAdmin
          .from('members').select('user_id').in('id', caredBy);
        userIds = (cgs || []).map((mm: any) => mm.user_id).filter(Boolean);
      }
      if (targetMember.user_id) userIds.push(targetMember.user_id);
      userIds = Array.from(new Set(userIds));
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
            title: `📦 ${targetMember.name}: ${med.name} sta per finire`,
            body: daysLeft !== null
              ? `Restano ~${daysLeft} giorni (${left} dosi). Apri FAMMY per chiedere la ricetta al medico con un tocco.`
              : `Restano ${left} dosi. Apri FAMMY per chiedere la ricetta al medico con un tocco.`,
            tag: `med-supply-${med.id}`,
            data: {
              kind: 'medication_supply',
              medication_id: med.id,
              member_id: targetMember.id,
            },
          }),
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          supplyAlertsSent += j?.sent || 0;
        }
      } catch (_) { /* skip silent */ }
    }

    return json({
      sent_total: sentTotal,
      escalations_sent: escalationsSent,
      supply_alerts_sent: supplyAlertsSent,
      skipped_already_handled: skippedAlreadyHandled,
      current_time_utc: currentTime,
    });
  } catch (err) {
    console.error('medication-reminder-push error:', err);
    return json({ error: String(err) }, 500);
  }
});