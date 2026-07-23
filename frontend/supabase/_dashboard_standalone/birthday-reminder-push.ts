// =============================================================================
// FAMMY — birthday-reminder-push
// =============================================================================
// Cron Edge Function eseguita UNA volta al giorno via pg_cron
// (vedi frontend/sql/fammy-birthday-reminder-cron.sql, ore 07:05 UTC ≈ 9 IT).
//
// Logica (date calcolate in Europe/Rome):
//   A) 🎁 PROMEMORIA REGALO: membri il cui compleanno è tra 7 giorni →
//      push a tutti i membri della famiglia CON account, ESCLUSO il
//      festeggiato (niente spoiler).
//   B) 🎂 AUGURI OGGI: membri che compiono gli anni oggi → push alla
//      famiglia, sempre escluso il festeggiato.
//
// ANTI-DOPPIONE: ogni invio è registrato in public.birthday_push_sent
// (PK member_id+year+kind). Se la tabella manca → fail-open (invia comunque,
// il `tag` identico collassa eventuali doppioni sul dispositivo).
//
// Compleanni 29 febbraio: notificati solo negli anni in cui il 29/02 esiste.
//
// Body: nessuno (cron) | { dry_run: true } per vedere i match senza inviare.
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

// 'YYYY-MM-DD' di (oggi + offsetGiorni) nel fuso Europe/Rome
function romeDatePlus(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 3600 * 1000));
}

async function sendPush(userIds: string[], title: string, body: string, tag: string, data: Record<string, unknown>) {
  if (userIds.length === 0) return;
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ user_ids: userIds, title, body, tag, data }),
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  let dryRun = false;
  try {
    const body = await req.json().catch(() => ({}));
    dryRun = !!body?.dry_run;
  } catch (_) { /* nessun body (cron) */ }

  try {
    // kind → { data target (Rome), emoji, testo }
    const targets: Array<{ kind: 'gift' | 'today'; date: string }> = [
      { kind: 'gift', date: romeDatePlus(7) },   // compleanno tra 7 giorni
      { kind: 'today', date: romeDatePlus(0) },  // compleanno oggi
    ];

    const results: Array<Record<string, unknown>> = [];
    let sent = 0;

    for (const tgt of targets) {
      const mmdd = tgt.date.slice(5); // 'MM-DD'
      const targetYear = Number(tgt.date.slice(0, 4));

      // Membri con birth_date che cade nella data target (match su MM-DD).
      const { data: bdayMembers, error } = await supabaseAdmin
        .from('members')
        .select('id, name, user_id, family_id, birth_date')
        .not('birth_date', 'is', null);
      if (error) { results.push({ kind: tgt.kind, error: error.message }); continue; }

      const matches = (bdayMembers || []).filter(
        (m) => String(m.birth_date).slice(5, 10) === mmdd
      );

      for (const m of matches) {
        const birthYear = Number(String(m.birth_date).slice(0, 4));
        const age = targetYear - birthYear;
        if (!Number.isFinite(age) || age < 0 || age > 130) continue;

        // Anti-doppione (fail-open se la tabella non esiste)
        if (!dryRun) {
          const { error: dupErr } = await supabaseAdmin
            .from('birthday_push_sent')
            .insert({ member_id: m.id, year: targetYear, kind: tgt.kind });
          if (dupErr) {
            if (dupErr.code === '23505') continue;      // già inviato quest'anno
            if (dupErr.code !== '42P01') continue;      // errore vero → salta
            // 42P01 = tabella mancante → fail-open, invia comunque
          }
        }

        // Destinatari: famiglia CON account, ESCLUSO il festeggiato
        const { data: fam } = await supabaseAdmin
          .from('members')
          .select('user_id')
          .eq('family_id', m.family_id)
          .not('user_id', 'is', null);
        const recipients = [...new Set(
          (fam || []).map((x) => x.user_id as string)
        )].filter((u) => u !== m.user_id);

        const firstName = (m.name || '').split(' ')[0] || m.name;
        const title = tgt.kind === 'gift'
          ? `🎁 Tra una settimana: compleanno di ${firstName}`
          : `🎂 Oggi ${firstName} compie ${age} anni!`;
        const body = tgt.kind === 'gift'
          ? `${m.name} compie ${age} anni il ${tgt.date.slice(8)}/${tgt.date.slice(5, 7)}. Pensiamo al regalo? 💡 In FAMMY trovi le Idee regalo AI.`
          : `Fagli gli auguri da parte di tutta la famiglia! 🎉`;

        results.push({ kind: tgt.kind, member: m.name, age, recipients: recipients.length, dryRun });
        if (!dryRun && recipients.length > 0) {
          await sendPush(
            recipients, title, body,
            `bday-${tgt.kind}-${m.id}-${targetYear}`,
            { kind: `bday_${tgt.kind}`, member_id: m.id, family_id: m.family_id, url: '/?tab=famiglia' },
          );
          sent += recipients.length;
        }
      }
    }

    return json({ ok: true, sent, results });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});