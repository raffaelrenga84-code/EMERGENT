// =====================================================================
//  Vercel Serverless Function — iCal feed per famiglia
// ---------------------------------------------------------------------
//  Endpoint: GET /api/ical/<token>.ics
//
//  v2 (16/07/2026): allineato a src/lib/icsExport.js.
//   - Espande gli EVENTI RICORRENTI con RRULE settimanale + EXDATE
//     (prima esportava solo la riga base → il mese successivo era vuoto).
//   - Include gli INCARICHI con due_date (all-day, o puntuali se due_time),
//     incluse le ricorrenze.
//   - PRIVACY: esporta solo task con visibility 'all'/null. Il feed usa la
//     service key (bypassa RLS): task 'private'/'assignees'/'couple' NON
//     devono finire nel calendario condiviso della famiglia.
//   - VTIMEZONE Europe/Rome: il server gira in UTC, i due_time sono ora
//     italiana → senza TZID gli orari slitterebbero di 1-2 ore.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const WD_TO_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']; // 0=Lun..6=Dom

export default async function handler(req, res) {
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

  const { data: family, error: famErr } = await supabase
    .from('families')
    .select('id, name, emoji')
    .eq('ical_token', token)
    .maybeSingle();

  if (famErr || !family) {
    res.status(404).send('Calendar not found');
    return;
  }

  // --- EVENTI (con campi ricorrenza; fallback se colonne mancanti) ---
  let events = [];
  {
    const full = await supabase
      .from('events')
      .select('id, title, description, location, starts_at, ends_at, recurring_days, recurring_until, recurring_exceptions, updated_at')
      .eq('family_id', family.id)
      .order('starts_at');
    if (!full.error) {
      events = full.data || [];
    } else {
      const basic = await supabase
        .from('events')
        .select('id, title, description, location, starts_at, ends_at, updated_at')
        .eq('family_id', family.id)
        .order('starts_at');
      events = basic.data || [];
    }
  }

  // --- INCARICHI con scadenza (SOLO visibilità famiglia) ---
  let tasks = [];
  {
    const full = await supabase
      .from('tasks')
      .select('id, title, note, location, due_date, due_time, status, visibility, recurring_days, recurring_until, recurring_exceptions')
      .eq('family_id', family.id)
      .not('due_date', 'is', null);
    if (!full.error) {
      tasks = full.data || [];
    } else {
      const basic = await supabase
        .from('tasks')
        .select('id, title, note, location, due_date, due_time, status, visibility, recurring_days, recurring_until')
        .eq('family_id', family.id)
        .not('due_date', 'is', null);
      tasks = basic.data || [];
    }
  }
  tasks = tasks.filter((tk) => {
    // Privacy: nel feed condiviso solo i task visibili a tutta la famiglia.
    const vis = tk.visibility || 'all';
    if (vis !== 'all') return false;
    // I one-off completati spariscono dal feed; i ricorrenti restano.
    const recurring = Array.isArray(tk.recurring_days) && tk.recurring_days.length > 0;
    if (!recurring && tk.status === 'done') return false;
    return true;
  });

  // --- COMPLEANNI (da members.birth_date, inclusi i "solo contatto") ---
  let bdays = [];
  {
    const q = await supabase
      .from('members')
      .select('id, name, birth_date, user_id')
      .eq('family_id', family.id)
      .not('birth_date', 'is', null);
    if (!q.error) {
      const seen = new Set();
      bdays = (q.data || []).filter((m) => {
        const k = `${m.user_id || m.name}|${String(m.birth_date).slice(0, 10)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  }

  // --- ASSENZE visibili a questa famiglia (🌍 Chi è dove) ---
  let absences = [];
  {
    const q = await supabase
      .from('absences')
      .select('id, member_name, start_date, end_date, reason, location, note, visible_to_families')
      .contains('visible_to_families', [family.id]);
    if (!q.error) absences = q.data || [];
  }

  const ics = buildICS(family, events, tasks, bdays, absences);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('Content-Disposition', `inline; filename="fammy-${family.id}.ics"`);
  res.status(200).send(ics);
}

// ---------------------------------------------------------------------
//  Helpers ICS
// ---------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

// Data-ora UTC: 20260716T101500Z (per eventi con starts_at timestamptz)
function fmtUtc(d) {
  const date = new Date(d);
  return (
    date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z'
  );
}

// 'YYYY-MM-DD' → 'YYYYMMDD'
function fmtDate(yyyymmdd) { return String(yyyymmdd).slice(0, 10).replace(/-/g, ''); }

// 'YYYY-MM-DD' + 'HH:MM' → 'YYYYMMDDTHHMM00' (ora locale, da usare con TZID)
function fmtLocal(dateKey, hhmm) { return `${fmtDate(dateKey)}T${hhmm.replace(':', '')}00`; }

function addDays(dateKey, n) {
  const [y, m, d] = String(dateKey).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
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
  const parts = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

function rruleWeekly(recurringDays, untilLine) {
  const byDay = (recurringDays || [])
    .filter((d) => d >= 0 && d <= 6)
    .map((d) => WD_TO_RRULE[d])
    .join(',');
  if (!byDay) return null;
  let rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
  if (untilLine) rrule += `;UNTIL=${untilLine}`;
  return rrule;
}

const ABSENCE_ICONS = { vacation: '🏖️', work: '💼', health: '🏥', other: '✈️' };

function buildICS(family, events, tasks, bdays = [], absences = []) {
  const calName = `${family.emoji || ''} ${family.name}`.trim();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAMMY//Family Calendar//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`NAME:${esc(calName)}`),
    fold(`X-WR-CALNAME:${esc(calName)}`),
    fold('X-WR-CALDESC:Eventi e incarichi famigliari su FAMMY'),
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-WR-TIMEZONE:Europe/Rome',
    // VTIMEZONE Europe/Rome (per i DTSTART;TZID dei task con orario)
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'X-LIC-LOCATION:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  const now = fmtUtc(new Date());

  // === EVENTI ===
  for (const ev of events) {
    if (!ev.starts_at) continue;
    const start = new Date(ev.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${fmtUtc(start)}`);
    lines.push(`DTEND:${fmtUtc(end)}`);
    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));

    // Ricorrenza settimanale → RRULE (il calendario espande da solo,
    // per sempre o fino a recurring_until)
    if (Array.isArray(ev.recurring_days) && ev.recurring_days.length > 0) {
      // UNTIL in UTC (DTSTART è in UTC): fine giornata italiana ≈ 21:59:59Z
      const until = ev.recurring_until
        ? fmtUtc(new Date(String(ev.recurring_until).slice(0, 10) + 'T23:59:59+02:00'))
        : null;
      const rr = rruleWeekly(ev.recurring_days, until);
      if (rr) lines.push(rr);
      // Occorrenze eliminate singolarmente → EXDATE (stessa ora del DTSTART)
      if (Array.isArray(ev.recurring_exceptions)) {
        const hms = 'T' + pad(start.getUTCHours()) + pad(start.getUTCMinutes()) + pad(start.getUTCSeconds()) + 'Z';
        for (const exDate of ev.recurring_exceptions) {
          if (/^\d{4}-\d{2}-\d{2}/.test(String(exDate))) {
            lines.push(`EXDATE:${fmtDate(exDate)}${hms}`);
          }
        }
      }
    }

    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT30M');
    lines.push('ACTION:DISPLAY');
    lines.push(fold(`DESCRIPTION:${esc(ev.title)}`));
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  // === INCARICHI con due_date ===
  for (const tk of tasks) {
    if (!tk.due_date) continue;
    const dateKey = String(tk.due_date).slice(0, 10);
    const timed = tk.due_time && /^\d{2}:\d{2}/.test(String(tk.due_time));
    const hhmm = timed ? String(tk.due_time).slice(0, 5) : null;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:task-${tk.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    if (timed) {
      // Orario locale italiano con TZID (il server è in UTC: mai new Date qui)
      const endHH = pad((Number(hhmm.slice(0, 2)) + (hhmm.slice(3) >= '30' ? 1 : 0)) % 24);
      const endMM = pad((Number(hhmm.slice(3)) + 30) % 60);
      lines.push(`DTSTART;TZID=Europe/Rome:${fmtLocal(dateKey, hhmm)}`);
      lines.push(`DTEND;TZID=Europe/Rome:${fmtLocal(dateKey, `${endHH}:${endMM}`)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(dateKey)}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(addDays(dateKey, 1))}`);
    }
    lines.push(fold(`SUMMARY:${esc('📋 ' + (tk.title || 'Incarico'))}`));
    if (tk.location) lines.push(fold(`LOCATION:${esc(tk.location)}`));
    if (tk.note) lines.push(fold(`DESCRIPTION:${esc(tk.note)}`));

    if (Array.isArray(tk.recurring_days) && tk.recurring_days.length > 0) {
      // UNTIL: per all-day è una data; per timed dev'essere UTC
      const until = tk.recurring_until
        ? (timed
            ? fmtUtc(new Date(String(tk.recurring_until).slice(0, 10) + 'T23:59:59+02:00'))
            : fmtDate(tk.recurring_until))
        : null;
      const rr = rruleWeekly(tk.recurring_days, until);
      if (rr) lines.push(rr);
      if (Array.isArray(tk.recurring_exceptions)) {
        for (const exDate of tk.recurring_exceptions) {
          if (!/^\d{4}-\d{2}-\d{2}/.test(String(exDate))) continue;
          if (timed) {
            lines.push(`EXDATE;TZID=Europe/Rome:${fmtLocal(String(exDate).slice(0, 10), hhmm)}`);
          } else {
            lines.push(`EXDATE;VALUE=DATE:${fmtDate(exDate)}`);
          }
        }
      }
    }

    if (timed) {
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT30M');
      lines.push('ACTION:DISPLAY');
      lines.push(fold(`DESCRIPTION:${esc(tk.title || 'Incarico')}`));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  // === ASSENZE (all-day, multi-giorno; DTEND esclusivo = end_date+1) ===
  for (const ab of absences) {
    const start = String(ab.start_date || '').slice(0, 10);
    const end = String(ab.end_date || start).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    const icon = ABSENCE_ICONS[ab.reason] || '✈️';
    const who = ab.member_name || 'Assenza';
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:absence-${ab.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(addDays(end, 1))}`);
    lines.push(fold(`SUMMARY:${esc(`${icon} ${who}${ab.location ? ' · ' + ab.location : ''}`)}`));
    if (ab.note) lines.push(fold(`DESCRIPTION:${esc(ab.note)}`));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  // === COMPLEANNI (ricorrenza annuale, all-day) ===
  for (const m of bdays) {
    const dk = String(m.birth_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:bday-${m.id}@fammy.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(dk)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(addDays(dk, 1))}`);
    lines.push('RRULE:FREQ=YEARLY');
    lines.push(fold(`SUMMARY:${esc('🎂 Compleanno di ' + m.name)}`));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
