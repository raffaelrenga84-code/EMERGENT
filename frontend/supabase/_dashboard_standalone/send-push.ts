// =============================================================================
// FAMMY — send-push (Web Push singolo invio) — v2 con esiti per dispositivo
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
    .select('id, user_id, endpoint, p256dh, auth, user_agent')
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
  // Esito per ogni subscription (per la diagnostica frontend):
  // ok=true → il push service ha accettato. removed=true → endpoint morto, eliminato.
  const results: Array<{ id: string; ua: string | null; ok: boolean; status: number | string; removed?: boolean; detail?: string }> = [];

  await Promise.all(subs.map(async (s) => {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      // urgency: 'high' → su Chrome/Android dice a FCM di consegnare subito e
      // svegliare il dispositivo dal Doze (altrimenti la notifica resta in coda
      // finché non si riapre Chrome). TTL: validità della notifica se il device
      // è irraggiungibile (1h: oltre, viene scartata invece di arrivare stantia).
      await webpush.sendNotification(subscription, notificationPayload, {
        urgency: 'high',
        TTL: 3600,
      });
      sent++;
      results.push({ id: s.id, ua: s.user_agent || null, ok: true, status: 201 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      const rawBody = (e as { body?: string }).body;
      const detail = typeof rawBody === 'string' && rawBody.trim()
        ? rawBody.trim().slice(0, 140)
        : undefined;
      // 404/410 = endpoint scaduto. 403 = VAPID mismatch.
      // 400 con BadJwtToken (Apple) = subscription con chiavi vecchie: rimuovi.
      const vapidIssue = typeof rawBody === 'string' &&
        /BadJwtToken|VapidPkHashMismatch/i.test(rawBody);
      if (code === 404 || code === 410 || code === 403 || (code === 400 && vapidIssue)) {
        expired.push(s.id);
        results.push({ id: s.id, ua: s.user_agent || null, ok: false, status: code, removed: true, detail });
      } else {
        console.warn('push send failed', code, detail || e);
        results.push({
          id: s.id, ua: s.user_agent || null, ok: false,
          status: code || ((e as Error)?.message ?? 'error'),
          detail,
        });
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

  return json({ sent, failed: subs.length - sent, expired_removed: expired.length, results });
});
