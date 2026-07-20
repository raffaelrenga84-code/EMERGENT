// ============================================================================
// FAMMY — Weekly Calendar Sync via Email (Resend)
//
// Edge Function richiamata da pg_cron ogni domenica alle 18:00 UTC.
// Per ogni utente con `user_preferences.weekly_email_sync = true`:
//  1. Fetcha tutti gli eventi+task delle famiglie dell'utente nei prossimi 14g
//  2. Genera un file .ics in memoria
//  3. Invia email via Resend con allegato .ics
//  4. Aggiorna `weekly_email_last_sent_at`
//
// Deploy:
//   supabase functions deploy weekly-calendar-sync --no-verify-jwt
// (oppure via Management API con `verify_jwt: false`)
//
// Env vars richieste (Settings → Edge Functions → Secrets):
//   RESEND_API_KEY      — la tua API key di Resend (re_...)
//   RESEND_FROM_EMAIL   — es. "FAMMY <noreply@fammy.app>" o
//                          "FAMMY <onboarding@resend.dev>" (test sandbox)
//   SUPABASE_URL        — auto-iniettata da Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-iniettata da Supabase
// ============================================================================

// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "FAMMY <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// ICS generation (minimal RFC5545, no external deps)
// ---------------------------------------------------------------------------
function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

function fmtDate(d: Date): string {
  // YYYYMMDD
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
function fmtDateTime(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return `${fmtDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escapeIcs(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildIcs({ calName, events, tasks }: { calName: string; events: any[]; tasks: any[] }): string {
  const now = fmtDateTime(new Date());
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//FAMMY//WeeklySync//IT");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeIcs(calName)}`);
  lines.push(`X-WR-TIMEZONE:Europe/Rome`);

  // Events
  for (const ev of events) {
    const start = ev.starts_at ? new Date(ev.starts_at) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:fammy-event-${ev.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${fmtDateTime(start)}`);
    lines.push(`DTEND:${fmtDateTime(end)}`);
    lines.push(`SUMMARY:${escapeIcs(ev.title || "Evento")}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    if (ev.location)    lines.push(`LOCATION:${escapeIcs(ev.location)}`);
    lines.push("END:VEVENT");
  }

  // Tasks (come VTODO, fallback VEVENT all-day per compatibilità calendar iOS)
  for (const tk of tasks) {
    if (!tk.due_date) continue;
    const due = new Date(tk.due_date + (tk.due_time ? `T${tk.due_time}:00` : "T09:00:00"));
    if (Number.isNaN(due.getTime())) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:fammy-task-${tk.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${fmtDateTime(due)}`);
    lines.push(`DTEND:${fmtDateTime(new Date(due.getTime() + 60 * 60 * 1000))}`);
    lines.push(`SUMMARY:📋 ${escapeIcs(tk.title || "Task")}`);
    if (tk.note) lines.push(`DESCRIPTION:${escapeIcs(tk.note)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// HTML email body
// ---------------------------------------------------------------------------
function emailHtml(displayName: string, eventsCount: number, tasksCount: number): string {
  return `
<!doctype html>
<html lang="it">
<body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1611;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:white;border-radius:24px;overflow:hidden;box-shadow:0 8px 24px rgba(28,22,17,0.08);">
        <tr>
          <td style="padding:32px 32px 16px;">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1C1611;">🏡 La tua settimana FAMMY</h1>
            <p style="margin:0;font-size:15px;color:#6D5F50;">Ciao ${displayName}, ecco il tuo calendario delle prossime 2 settimane.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 8px;">
              <tr>
                <td style="padding:14px 16px;background:#F1ECE3;border-radius:14px;">
                  <div style="font-size:13px;color:#6D5F50;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">📅 Eventi</div>
                  <div style="font-size:22px;font-weight:800;color:#1C1611;margin-top:4px;">${eventsCount}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 16px;background:#F1ECE3;border-radius:14px;">
                  <div style="font-size:13px;color:#6D5F50;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">📋 Incarichi</div>
                  <div style="font-size:22px;font-weight:800;color:#1C1611;margin-top:4px;">${tasksCount}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;">
            <div style="padding:18px;background:#FFF8F0;border:1.5px solid #C1624B;border-radius:14px;">
              <div style="font-size:14px;color:#C1624B;font-weight:700;margin-bottom:6px;">📎 In allegato</div>
              <div style="font-size:13px;color:#1C1611;line-height:1.5;">
                Apri il file <code style="background:#F1ECE3;padding:1px 6px;border-radius:4px;font-size:12px;">fammy-week.ics</code> sul tuo telefono
                per aggiungere automaticamente tutti gli eventi al tuo calendario (iPhone, Google Calendar, Outlook).
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#1C1611;color:#FAF7F2;font-size:12px;text-align:center;">
            Hai ricevuto questa email perché hai attivato il <strong>Sync settimanale</strong> in FAMMY.<br/>
            Puoi disattivarlo dal Profilo in qualsiasi momento.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Resend send via REST API (no SDK needed)
// ---------------------------------------------------------------------------
async function sendEmailWithIcs({ to, subject, html, icsBody, icsFilename }: {
  to: string; subject: string; html: string; icsBody: string; icsFilename: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  // Base64-encode the .ics (Deno: btoa accetta solo Latin-1, l'.ics è ASCII)
  const icsBase64 = btoa(unescape(encodeURIComponent(icsBody)));
  const body = {
    from: RESEND_FROM_EMAIL,
    to: [to],
    subject,
    html,
    attachments: [{
      filename: icsFilename,
      content: icsBase64,
    }],
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `${res.status}: ${errText}` };
  }
  const data = await res.json();
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1) Fetch utenti con sync attivo
  const { data: prefs, error: prefsErr } = await supabase
    .from("user_preferences")
    .select("user_id, weekly_email_sync, email_override, weekly_email_last_sent_at")
    .eq("weekly_email_sync", true);

  if (prefsErr) {
    return new Response(JSON.stringify({ error: prefsErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!prefs || prefs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: "No users with weekly_email_sync enabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Range temporale: oggi → +14 giorni
  const startIso = new Date().toISOString();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  const endIso = endDate.toISOString();
  const endIsoDate = endDate.toISOString().slice(0, 10);

  let sent = 0;
  const errors: any[] = [];

  for (const p of prefs) {
    try {
      // Skip se inviata < 6 giorni fa (anti-duplicate)
      if (p.weekly_email_last_sent_at) {
        const lastMs = new Date(p.weekly_email_last_sent_at).getTime();
        if (Date.now() - lastMs < 6 * 24 * 3600 * 1000) continue;
      }

      // 2) Email destinazione
      let toEmail = p.email_override;
      if (!toEmail) {
        const { data: u } = await supabase.auth.admin.getUserById(p.user_id);
        toEmail = u?.user?.email || null;
      }
      if (!toEmail) {
        errors.push({ user_id: p.user_id, error: "no email" });
        continue;
      }

      // 3) Famiglie dell'utente
      const { data: myMembers } = await supabase
        .from("members")
        .select("id, family_id, name")
        .eq("user_id", p.user_id);
      const familyIds = (myMembers || []).map((m) => m.family_id);
      const displayName = (myMembers || [])[0]?.name || "famiglia";

      if (familyIds.length === 0) continue;

      // 4) Eventi + task delle famiglie nel range
      const { data: events } = await supabase
        .from("events")
        .select("id, title, description, location, starts_at, ends_at, family_id")
        .in("family_id", familyIds)
        .gte("starts_at", startIso)
        .lte("starts_at", endIso)
        .order("starts_at");
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, note, due_date, due_time, family_id")
        .in("family_id", familyIds)
        .gte("due_date", startIso.slice(0, 10))
        .lte("due_date", endIsoDate)
        .order("due_date");

      // 5) Build .ics
      const ics = buildIcs({
        calName: `FAMMY · ${displayName}`,
        events: events || [],
        tasks: tasks || [],
      });

      // 6) Send email
      const subject = `🏡 FAMMY · La tua settimana (${(events?.length || 0) + (tasks?.length || 0)} appuntamenti)`;
      const html = emailHtml(displayName, events?.length || 0, tasks?.length || 0);
      const resp = await sendEmailWithIcs({
        to: toEmail,
        subject,
        html,
        icsBody: ics,
        icsFilename: "fammy-week.ics",
      });

      if (!resp.ok) {
        errors.push({ user_id: p.user_id, error: resp.error });
        continue;
      }

      // 7) Aggiorna last_sent_at
      await supabase
        .from("user_preferences")
        .update({ weekly_email_last_sent_at: new Date().toISOString() })
        .eq("user_id", p.user_id);

      sent++;
    } catch (e: any) {
      errors.push({ user_id: p.user_id, error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
