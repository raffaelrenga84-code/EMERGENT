/**
 * icsExport — genera un file .ics (iCalendar standard RFC 5545) da scaricare.
 *
 * Funziona su:
 *  - Android: tap → si apre con Google Calendar / Samsung Calendar
 *  - iOS: tap → Calendar (importa tutti gli eventi)
 *  - Desktop: doppio click → Outlook / Apple Calendar
 *
 * Usato dal pulsante "📥 Esporta agenda" in AgendaTab.
 */

const WD_TO_RRULE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']; // 0=Lun..6=Dom

function pad(n) { return String(n).padStart(2, '0'); }

function toIcsDateUtc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function toIcsDate(yyyymmdd) {
  // YYYY-MM-DD → YYYYMMDD
  return yyyymmdd.replace(/-/g, '');
}

// Escape per RFC 5545: virgola, punto-e-virgola, backslash, newline
function escIcs(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Fold lines a 75 char (RFC 5545)
function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      chunks.push(line.slice(0, 75));
      i = 75;
    } else {
      chunks.push(' ' + line.slice(i, i + 74));
      i += 74;
    }
  }
  return chunks.join('\r\n');
}

/**
 * Costruisce stringa ICS da arrays di eventi e tasks.
 * events: array originali da Supabase (non gli espansi — l'RRULE espande tutto)
 * tasks: array originali con due_date
 */
export function buildIcs({ events = [], tasks = [], calName = 'FAMMY' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAMMY//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escIcs(calName)}`,
    `X-WR-TIMEZONE:Europe/Rome`,
  ];

  const nowStamp = toIcsDateUtc(new Date());

  // === EVENTS ===
  for (const ev of events) {
    if (!ev?.starts_at) continue;
    const start = new Date(ev.starts_at);
    if (Number.isNaN(start.getTime())) continue;
    // Durata default 1h se non specificata
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const uid = `event-${ev.id}@fammy`;

    const evLines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${toIcsDateUtc(start)}`,
      `DTEND:${toIcsDateUtc(end)}`,
      `SUMMARY:${escIcs(ev.title || 'Evento')}`,
    ];
    if (ev.location) evLines.push(`LOCATION:${escIcs(ev.location)}`);
    if (ev.description) evLines.push(`DESCRIPTION:${escIcs(ev.description)}`);

    // Ricorrenza settimanale (giorni 0-6 = Lun-Dom)
    if (Array.isArray(ev.recurring_days) && ev.recurring_days.length > 0) {
      const byDay = ev.recurring_days
        .filter((d) => d >= 0 && d <= 6)
        .map((d) => WD_TO_RRULE[d])
        .join(',');
      if (byDay) {
        let rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
        if (ev.recurring_until) {
          const until = new Date(ev.recurring_until + 'T23:59:59Z');
          rrule += `;UNTIL=${toIcsDateUtc(until)}`;
        }
        evLines.push(rrule);
      }
    }

    // Eccezioni occorrenze (EXDATE per ogni data esclusa)
    if (Array.isArray(ev.recurring_exceptions)) {
      for (const exDate of ev.recurring_exceptions) {
        const ex = new Date(exDate + 'T' + start.toISOString().slice(11, 19) + 'Z');
        if (!Number.isNaN(ex.getTime())) {
          evLines.push(`EXDATE:${toIcsDateUtc(ex)}`);
        }
      }
    }

    evLines.push('END:VEVENT');
    lines.push(...evLines);
  }

  // === TASKS con due_date come ALL-DAY events ===
  for (const tk of tasks) {
    if (!tk?.due_date) continue;
    const dateKey = String(tk.due_date).slice(0, 10);
    const tomorrowKey = (() => {
      const d = new Date(dateKey + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();
    const uid = `task-${tk.id}@fammy`;
    const tLines = [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
    ];
    // Se c'è due_time, evento puntuale; altrimenti all-day
    if (tk.due_time && /^\d{2}:\d{2}$/.test(tk.due_time)) {
      const dtStart = new Date(`${dateKey}T${tk.due_time}:00`);
      const dtEnd = new Date(dtStart.getTime() + 30 * 60 * 1000);
      tLines.push(`DTSTART:${toIcsDateUtc(dtStart)}`);
      tLines.push(`DTEND:${toIcsDateUtc(dtEnd)}`);
    } else {
      tLines.push(`DTSTART;VALUE=DATE:${toIcsDate(dateKey)}`);
      tLines.push(`DTEND;VALUE=DATE:${toIcsDate(tomorrowKey)}`);
    }
    tLines.push(`SUMMARY:${escIcs('📋 ' + (tk.title || 'Incarico'))}`);
    if (tk.location) tLines.push(`LOCATION:${escIcs(tk.location)}`);
    if (tk.note) tLines.push(`DESCRIPTION:${escIcs(tk.note)}`);

    if (Array.isArray(tk.recurring_days) && tk.recurring_days.length > 0) {
      const weekdays = tk.recurring_days.filter((v) => v <= 6 && v >= 0);
      // I monthDays non sono trasferibili in RRULE FREQ=WEEKLY puro,
      // li omettiamo (il calendario nativo non ha un equivalente diretto).
      if (weekdays.length > 0) {
        const byDay = weekdays.map((d) => WD_TO_RRULE[d]).join(',');
        let rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
        if (tk.recurring_until) {
          rrule += `;UNTIL=${toIcsDate(tk.recurring_until)}`;
        }
        tLines.push(rrule);
      }
    }

    if (Array.isArray(tk.recurring_exceptions)) {
      for (const exDate of tk.recurring_exceptions) {
        tLines.push(`EXDATE;VALUE=DATE:${toIcsDate(exDate)}`);
      }
    }

    tLines.push('END:VEVENT');
    lines.push(...tLines);
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

/**
 * Scarica un file .ics. Funziona ovunque (Android, iOS, desktop).
 * Su Android tap → "Apri con Google Calendar / Samsung Calendar / Outlook".
 */
export function downloadIcs({ events = [], tasks = [], filename = 'fammy-agenda.ics', calName = 'FAMMY' } = {}) {
  const ics = buildIcs({ events, tasks, calName });
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
