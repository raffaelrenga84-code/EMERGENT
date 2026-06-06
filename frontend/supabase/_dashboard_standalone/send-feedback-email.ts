// ============================================================================
// FAMMY — Send Feedback Email (Resend)
//
// Edge Function che riceve il feedback di un utente loggato e lo inoltra
// via email all'indirizzo del fondatore (raffael.renga84@gmail.com).
//
// Body JSON atteso:
//   { rating: number (1-5), message: string }
//
// Auth: questa funzione richiede JWT valido (non --no-verify-jwt).
// L'utente viene identificato lato server tramite supabaseClient.auth.getUser().
//
// Deploy:
//   supabase functions deploy send-feedback-email
//
// Env vars richieste (Settings → Edge Functions → Secrets):
//   RESEND_API_KEY
//   RESEND_FROM_EMAIL (opzionale, default onboarding@resend.dev)
//   FEEDBACK_TO_EMAIL (opzionale, default raffael.renga84@gmail.com)
// ============================================================================

// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "FAMMY <onboarding@resend.dev>";
const FEEDBACK_TO_EMAIL = Deno.env.get("FEEDBACK_TO_EMAIL") || "raffael.renga84@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ratingEmoji(r: number): string {
  if (r >= 5) return "🥰 Adoro";
  if (r >= 4) return "🙂 Bello";
  if (r >= 3) return "😐 Neutro";
  if (r >= 2) return "😕 Migliorabile";
  if (r >= 1) return "😞 Non mi piace";
  return "—";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Identifica l'utente loggato dal JWT
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Body
    const body = await req.json().catch(() => ({}));
    const rating = Math.max(0, Math.min(5, Number(body?.rating) || 0));
    const message = String(body?.message || "").slice(0, 4000);

    if (!message.trim() && rating === 0) {
      return new Response(JSON.stringify({ error: "empty_feedback" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profilo (per display_name, language)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, language, phone")
      .eq("id", user.id)
      .maybeSingle();

    // Conteggio famiglie (per capire l'engagement)
    const { count: familyCount } = await supabaseAdmin
      .from("members")
      .select("family_id", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Compose email
    const subject = `[FAMMY Feedback] ${ratingEmoji(rating)} — ${profile?.display_name || user.email || user.phone || "utente"}`;
    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#FAF3E7;padding:24px;color:#1C1611;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <h1 style="margin:0 0 4px;font-size:22px;color:#C1624B;">💬 Nuovo feedback FAMMY</h1>
    <p style="margin:0 0 18px;color:#7A6F62;font-size:13px;">${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</p>

    <div style="background:#FAF3E7;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#7A6F62;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Rating</div>
      <div style="font-size:18px;font-weight:700;">${ratingEmoji(rating)} ${"⭐".repeat(rating)}</div>
    </div>

    <div style="background:#FAF3E7;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:#7A6F62;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Messaggio</div>
      <div style="font-size:15px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(message) || "(nessun messaggio)"}</div>
    </div>

    <hr style="border:none;border-top:1px solid #E8DFD0;margin:20px 0;" />

    <div style="font-size:12px;color:#7A6F62;line-height:1.6;">
      <strong>Da:</strong> ${escapeHtml(profile?.display_name || "—")}<br/>
      <strong>Email:</strong> ${escapeHtml(user.email || "—")}<br/>
      <strong>Phone:</strong> ${escapeHtml(user.phone || profile?.phone || "—")}<br/>
      <strong>Lingua app:</strong> ${escapeHtml(profile?.language || "—")}<br/>
      <strong>Famiglie:</strong> ${familyCount ?? 0}<br/>
      <strong>UID:</strong> <code>${escapeHtml(user.id)}</code>
    </div>
  </div>
</body></html>`;

    const text = `Nuovo feedback FAMMY
${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })}

Rating: ${ratingEmoji(rating)} ${"⭐".repeat(rating)}

Messaggio:
${message || "(nessun messaggio)"}

---
Da: ${profile?.display_name || "—"}
Email: ${user.email || "—"}
Phone: ${user.phone || profile?.phone || "—"}
Lingua app: ${profile?.language || "—"}
Famiglie: ${familyCount ?? 0}
UID: ${user.id}
`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [FEEDBACK_TO_EMAIL],
        reply_to: user.email || undefined,
        subject,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const txt = await resendRes.text();
      console.error("Resend error", resendRes.status, txt);
      return new Response(JSON.stringify({ error: "resend_failed", detail: txt }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log opzionale (best-effort, niente blocco)
    await supabaseAdmin.from("feedback_log").insert({
      user_id: user.id,
      rating,
      message,
      app_lang: profile?.language || null,
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-feedback-email error", e);
    return new Response(JSON.stringify({ error: "internal", detail: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
