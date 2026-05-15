// =====================================================================
//  Vercel Serverless Function — iCal export per famiglia
// ---------------------------------------------------------------------
//  Endpoint: GET /api/ical/<token>.ics
//  Restituisce un file iCal con tutti gli eventi della famiglia,
//  ognuno con un VALARM 30 min prima per notifica nativa sul telefono.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Estrai il token, ripulisci eventuale ".ics" finale
  const raw = req.query.token || '';
  const token = String(raw).replace(/\.ics$/i, '');

  if (!token || !/^[a-f0-9]+$/i.test(token)) {
    res.status(400).send('Invalid token');
    return;
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    res.status(500).send('Server not configured: missing SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Trova la famiglia
  const { data: family, error: famErr } = await supabase
    .from('families')
    .select('id, name, emoji')
    .eq('ical_token', token)
    .maybeSingle();

  if (famErr || !family) {
    res.status(404).send('Calendar not found');
    return;
  }

  // Carica gli eventi
  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, updated_at')
    .eq('family_id', family.id)
    .order('starts_at');

  const ics = buildICS(family, events || []);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('Content-Disposition', `inline; filename="fammy-${family.id}.ics"`);
  res.status(200).send(ics);
}

// ---------------------------------------------------------------------
//  Helpers ICS
// ---------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function fmt(d) {
  const date = new Date(d);
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// Folding linee a 75 caratteri (RFC 5545)
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let i = 0;
  parts.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

function buildICS(family, events) {
  const calName = `${family.emoji || ''} ${family.name}`.trim();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAMMY//Family Calendar//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`NAME:${esc(calName)}`),
    fold(`X-WR-CALNAME:${esc(calName)}`),
    fold(`X-WR-CALDESC:Eventi famigliari su FAMMY`),
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-WR-TIMEZONE:Europe/Rome',
  ];

  const now = fmt(new Date());

  for (const ev of events) {
    if (!ev.starts_at) continue;
    const start = ev.starts_at;
    const end = ev.ends_at || new Date(new Date(start).getTime() + 60 * 60 * 1000);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${fmt(start)}`);
    lines.push(`DTEND:${fmt(end)}`);
    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));

    // Promemoria 30 minuti prima
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT30M');
    lines.push('ACTION:DISPLAY');
    lines.push(fold(`DESCRIPTION:${esc(ev.title)}`));
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // RFC 5545 richiede CRLF
  return lines.join('\r\n') + '\r\n';
}
