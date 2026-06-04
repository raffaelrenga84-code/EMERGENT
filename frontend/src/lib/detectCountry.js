// detectCountry — rileva il paese dell'utente per pre-selezionare il prefisso
// nei selettori telefonici.
//
// Strategia (zero network, zero dipendenze):
//   1. Mappa rapida `Intl.DateTimeFormat().resolvedOptions().timeZone` → ISO-2
//      (es. "Europe/Rome" → "IT", "Australia/Sydney" → "AU")
//   2. Fallback: `navigator.language` (es. "it-IT", "en-AU" → estrae "AU"
//      con `.split('-')[1]`)
//   3. Default: "IT" (target principale di FAMMY)
//
// Restituisce il country `code` E.164 (es. "+39") cercando l'ISO-2 nella
// lista `COUNTRY_CODES` (lib/countryCodes.js).

import { COUNTRY_CODES } from './countryCodes.js';

// Mappa parziale timezone → ISO-2. Copre i timezone più comuni in UE +
// destinazioni principali extra-UE. Se non trovato, si passa al fallback.
const TZ_TO_ISO = {
  // Europa
  'Europe/Rome': 'IT', 'Europe/Vatican': 'IT', 'Europe/San_Marino': 'IT',
  'Europe/Paris': 'FR', 'Europe/Monaco': 'MC',
  'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/London': 'UK', 'Europe/Belfast': 'UK', 'Europe/Isle_of_Man': 'UK',
  'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES',
  'Europe/Lisbon': 'PT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Luxembourg': 'LU',
  'Europe/Zurich': 'CH',
  'Europe/Vienna': 'AT',
  'Europe/Vaduz': 'LI',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Reykjavik': 'IS',
  'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ',
  'Europe/Bratislava': 'SK',
  'Europe/Budapest': 'HU',
  'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG',
  'Europe/Athens': 'GR',
  'Europe/Nicosia': 'CY',
  'Europe/Riga': 'LV',
  'Europe/Tallinn': 'EE',
  'Europe/Vilnius': 'LT',
  'Europe/Zagreb': 'HR',
  'Europe/Ljubljana': 'SI',
  'Europe/Belgrade': 'RS',
  'Europe/Malta': 'MT',
  'Europe/Istanbul': 'TR',
  'Europe/Kiev': 'UA', 'Europe/Kyiv': 'UA',
  'Europe/Moscow': 'RU',
  // Americhe
  'America/New_York': 'US/CA', 'America/Chicago': 'US/CA',
  'America/Denver': 'US/CA', 'America/Phoenix': 'US/CA',
  'America/Los_Angeles': 'US/CA', 'America/Anchorage': 'US/CA',
  'America/Honolulu': 'US/CA',
  'America/Toronto': 'US/CA', 'America/Vancouver': 'US/CA',
  'America/Mexico_City': 'MX',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR',
  'America/Sao_Paulo': 'BR',
  'America/Santiago': 'CL',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  // Asia / Pacifico / Africa / Oceania
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH',
  'Asia/Jakarta': 'ID',
  'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL',
  'Asia/Tehran': 'IR',
  'Africa/Cairo': 'EG',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Casablanca': 'MA',
  'Africa/Tunis': 'TN',
  'Africa/Johannesburg': 'ZA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ',
};

/**
 * Restituisce il country `code` E.164 più probabile per l'utente corrente.
 * Esempi: "+39" (IT), "+44" (UK), "+61" (AU), "+1" (US/CA).
 */
export function detectCountryCode() {
  let iso = null;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_TO_ISO[tz]) iso = TZ_TO_ISO[tz];
  } catch (_) { /* Intl non disponibile? unlikely */ }

  if (!iso && typeof navigator !== 'undefined') {
    // navigator.language es. "it-IT", "en-AU" → estrai "IT" / "AU"
    const lang = navigator.language || (navigator.languages && navigator.languages[0]) || '';
    const parts = lang.split('-');
    if (parts.length >= 2) {
      iso = parts[1].toUpperCase();
      // Normalizza ISO-2 verso il label usato in COUNTRY_CODES (es. GB → UK)
      if (iso === 'GB') iso = 'UK';
      if (iso === 'CA') iso = 'US/CA';
    }
  }

  if (!iso) iso = 'IT';

  // Cerca prima un match esatto sul label, poi prova varianti
  const match = COUNTRY_CODES.find((c) => c.label === iso)
             || COUNTRY_CODES.find((c) => c.label.startsWith(iso))
             || COUNTRY_CODES[0]; // fallback safety
  return match.code;
}
