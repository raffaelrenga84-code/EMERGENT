// =============================================================================
// FAMMY — send-push (Web Push singolo invio)
// =============================================================================
// POST con body { user_id, title, body, tag?, data? } → invia una notifica push
// a TUTTE le subscription dell'utente. Rimuove le subscription scadute (410).
//
// Chiamata via service_role da altre edge functions (cron-digest), oppure
// dal frontend logged-in per test.
//
// Secrets richiesti (Supabase Dashboard → Project Settings → Edge Functions
// → Secrets):
//   VAPID_PUBLIC_KEY  = (copia dal file frontend/.env)
//   VAPID_PRIVATE_KEY = (la chiave privata, mai esposta al frontend)
//   VAPID_SUBJECT     = mailto:tuo-email@example.com
//   SUPABASE_URL      = https://<ref>.supabase.co  (gia' iniettato)
//   SUPABASE_SERVICE_ROLE_KEY  (gia' iniettato)
// =============================================================================
//
// Deploy:
//   curl -X POST https://api.supabase.com/v1/projects/<REF>/functions/deploy?slug=send-push \
//     -H "Authorization: Bearer $PAT" \
//     -F 'metadata={"name":"send-push","entrypoint_path":"index.ts","verify_jwt":false}' \
//     -F "file=@send-push.ts"
//
// Test:
//   curl -X POST https://<REF>.supabase.co/functions/v1/send-push \
//     -H "Authorization: Bearer $SERVICE_ROLE" \
//     -H "Content-Type: application/json" \
//     -d '{"user_id":"<uuid>","title":"Test","body":"Ciao!"}'
//
// =============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?bundle';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@fammy.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, init: number | ResponseInit = 200) {
  const opts: ResponseInit = typeof init === 'number' ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...opts,
    headers: { ...CORS, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: 'VAPID keys not configured on server' }, 500);
  }

  let payload: { user_id?: string; user_ids?: string[]; title: string; body: string; tag?: string; data?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const userIds = payload.user_ids ?? (payload.user_id ? [payload.user_id] : []);
  if (userIds.length === 0 || !payload.title || !payload.body) {
    return json({ error: 'missing_fields', required: ['user_id|user_ids', 'title', 'body'] }, 400);
  }

  // Recupera tutte le subscription
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (error) return json({ error: error.message }, 500);
  if (!subs || subs.length === 0) return json({ sent: 0, reason: 'no_subscriptions' });

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    data: payload.data || {},
  });

  let sent = 0;
  let expired: string[] = [];

  await Promise.all(subs.map(async (s) => {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(subscription, notificationPayload);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        // Subscription scaduta / revocata → la rimuoviamo
        expired.push(s.id);
      } else {
        console.warn('push send failed', e);
      }
    }
  }));

  if (expired.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', expired);
  }

  // Aggiorna last_used_at per le subscription attive
  if (sent > 0) {
    const aliveIds = subs.filter((s) => !expired.includes(s.id)).map((s) => s.id);
    if (aliveIds.length > 0) {
      await supabaseAdmin.from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .in('id', aliveIds);
    }
  }

  return json({ sent, expired_removed: expired.length });
});
