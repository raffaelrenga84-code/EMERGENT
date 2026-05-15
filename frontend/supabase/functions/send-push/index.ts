// Supabase Edge Function: send-push
// Riceve un payload da database webhook (su tasks/events) e invia push notifications
// a tutti gli endpoint Web Push pertinenti.
//
// Setup (vedi guida deploy):
//   1. supabase functions deploy send-push
//   2. supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email.it
//   3. Configurare un Database Webhook su tabelle tasks/events che chiama questa funzione

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore - Deno
import * as webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@fammy.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'tasks' | 'events';
  record: any;
  old_record: any | null;
  schema: string;
}

serve(async (req) => {
  try {
    const body: WebhookPayload = await req.json();
    const { type, table, record, old_record } = body;

    // Solo tasks/events ci interessano
    if (table !== 'tasks' && table !== 'events') {
      return new Response('ignored', { status: 200 });
    }

    // Determina chi notificare e con quale messaggio
    const notifications = await buildNotifications(table, type, record, old_record);
    if (notifications.length === 0) {
      return new Response('no recipients', { status: 200 });
    }

    // Per ogni utente da notificare: cerca i suoi endpoint e invia
    const results = await Promise.all(notifications.map(async (n) => {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', n.userId);

      if (!subs || subs.length === 0) return { userId: n.userId, sent: 0 };

      const payload = JSON.stringify({
        title: n.title,
        body: n.body,
        tag: n.tag,
        data: n.data || {},
      });

      let sent = 0;
      const expired: string[] = [];

      await Promise.all(subs.map(async (s) => {
        try {
          await webpush.sendNotification({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          }, payload);
          sent++;
        } catch (e: any) {
          // 410 = endpoint expired, da rimuovere
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            expired.push(s.endpoint);
          } else {
            console.warn('push error:', e?.message || e);
          }
        }
      }));

      // Pulisci endpoint scaduti
      if (expired.length > 0) {
        await admin.from('push_subscriptions').delete().in('endpoint', expired);
      }

      return { userId: n.userId, sent };
    }));

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Costruisce la lista di notifiche {userId, title, body, tag, data}
// in base al tipo di evento (INSERT/UPDATE) e al record.
async function buildNotifications(
  table: string,
  type: string,
  record: any,
  old_record: any,
): Promise<Array<{ userId: string; title: string; body: string; tag: string; data?: any }>> {
  const notifications: Array<{ userId: string; title: string; body: string; tag: string; data?: any }> = [];

  // Famiglia del record
  const familyId = record?.family_id;
  if (!familyId) return notifications;

  // Carica la famiglia per il nome
  const { data: family } = await admin
    .from('families').select('name, emoji').eq('id', familyId).maybeSingle();
  const famName = family?.name || 'Famiglia';

  // Tutti i membri (con user_id) della famiglia → potenziali destinatari
  const { data: famMembers } = await admin
    .from('members').select('id, user_id, name').eq('family_id', familyId);
  const realMembers = (famMembers || []).filter((m) => !!m.user_id);

  if (table === 'tasks') {
    if (type === 'INSERT') {
      // Nuovo task: notifica a tutti i membri tranne l'autore
      const authorMemberId = record.author_id;
      realMembers
        .filter((m) => m.id !== authorMemberId)
        .forEach((m) => {
          notifications.push({
            userId: m.user_id,
            title: `📋 Nuovo incarico in ${famName}`,
            body: record.title || 'Apri FAMMY per vederlo',
            tag: `new-task-${record.id}`,
            data: { taskId: record.id },
          });
        });
    } else if (type === 'UPDATE') {
      // Notifica se diventa urgente (priority a 'high', es. "Ho un imprevisto")
      if (old_record?.priority !== 'high' && record?.priority === 'high') {
        realMembers.forEach((m) => {
          notifications.push({
            userId: m.user_id,
            title: `🚨 Incarico urgente in ${famName}`,
            body: `${record.title} ha bisogno di attenzione`,
            tag: `urgent-task-${record.id}`,
            data: { taskId: record.id },
          });
        });
      }
      // Notifica se delegated_to cambia (qualcuno chiede "Lo fai tu?" a un altro)
      if (old_record?.delegated_to !== record?.delegated_to && record?.delegated_to) {
        const target = realMembers.find((m) => m.id === record.delegated_to);
        if (target) {
          notifications.push({
            userId: target.user_id,
            title: `🧡 Lo fai tu?`,
            body: `Ti hanno chiesto di occuparti di: ${record.title}`,
            tag: `delegated-task-${record.id}`,
            data: { taskId: record.id },
          });
        }
      }
    }
  } else if (table === 'events') {
    if (type === 'INSERT') {
      const authorMemberId = record.created_by;
      realMembers
        .filter((m) => m.id !== authorMemberId)
        .forEach((m) => {
          notifications.push({
            userId: m.user_id,
            title: `✨ Nuovo evento in ${famName}`,
            body: record.title || 'Apri FAMMY per vederlo',
            tag: `new-event-${record.id}`,
            data: { eventId: record.id },
          });
        });
    }
  }

  return notifications;
}
