/**
 * dateUtils.js — Utilities timezone-safe per FAMMY.
 *
 * Problema fixato: `new Date().toISOString().slice(0, 10)` ritorna la data
 * in UTC, non in locale. Quando l'utente è in Europe/Rome (UTC+1 o +2),
 * dalle 23:00 in poi questa funzione restituiva il giorno SUCCESSIVO. Un
 * task creato "oggi alle 23:30" risultava domani nella bacheca.
 *
 * Le utilities sotto operano SEMPRE nel fuso del device (Intl), che è
 * quello che l'utente si aspetta:
 *   - toLocalYMD()   → "2026-06-04" (anche alle 23:50 locali)
 *   - parseLocalYMD() → Date al midnight LOCALE (no shift)
 *   - localDayDiff() → diff in giorni "calendario" (non in ms)
 *   - getDeviceTimezone() → es. "Europe/Rome"
 */

/**
 * Ritorna la data del Date in formato YYYY-MM-DD usando il fuso del device.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function toLocalYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parsa "YYYY-MM-DD" come midnight locale (NON UTC). Da usare quando
 * vuoi una Date "anchor" del giorno (es. per calcoli di delta).
 * @param {string} ymd
 * @returns {Date}
 */
export function parseLocalYMD(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Combina una data "YYYY-MM-DD" + ora "HH:mm" in una Date locale,
 * poi la converte in ISO UTC pronta da salvare in DB.
 * Esempio: ("2026-06-04", "10:30") in Europe/Rome → "2026-06-04T08:30:00.000Z"
 * @param {string} ymd
 * @param {string} hm
 * @returns {string}  ISO UTC
 */
export function combineDateTimeToISO(ymd, hm) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  let h = 9, mm = 0;
  if (hm) {
    const parts = hm.split(':').map(Number);
    h = parts[0] ?? 9; mm = parts[1] ?? 0;
  }
  return new Date(y, m - 1, d, h, mm, 0, 0).toISOString();
}

/**
 * Differenza in giorni "calendario" locali fra due Date.
 * Esempio: oggi 23:00 e domani 01:00 → diff = 1 (anche se sono 2h).
 * @param {Date} a
 * @param {Date} b
 * @returns {number}
 */
export function localDayDiff(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/**
 * Timezone IANA del device (es. "Europe/Rome", "America/New_York").
 * Fallback "UTC" se il browser non supporta Intl.
 */
export function getDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Formatta un'ora "HH:mm" SEMPRE nel fuso del device, anche se la string
 * arriva come ISO UTC dal DB. Comoda per render lato UI.
 */
export function fmtLocalTime(isoOrDate) {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formatta una data "weekday DD MMM" nel fuso del device.
 */
export function fmtLocalDate(d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const date = typeof d === 'string' ? parseLocalYMD(d) || new Date(d) : d;
  return date.toLocaleDateString(undefined, opts);
}
