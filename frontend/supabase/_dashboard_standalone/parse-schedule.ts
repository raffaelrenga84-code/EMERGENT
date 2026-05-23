// =====================================================================
// FAMMY — Supabase Edge Function: parse-schedule
// =====================================================================
// Riceve un'immagine (screenshot di un turno aereo / lavoro) in base64
// e usa Gemini 2.5 Flash (vision + JSON structured output) per estrarre
// la lista di assenze del mese.
//
// Body (POST application/json):
//   {
//     "image_base64": "<base64 senza data:image/...;base64, prefix>",
//     "mime_type": "image/png" | "image/jpeg",
//     "user_lang": "it" | "en" | "fr" | "de"   (opzionale, default "it")
//   }
//
// Response 200:
//   {
//     "absences": [
//       {
//         "start_date": "2026-06-03",
//         "end_date":   "2026-06-05",
//         "reason":     "trip" | "standby" | "training" | "vacation" | "other",
//         "location":   "Chicago (ORD)" | null,
//         "note":       "Volo ORD"
//       },
//       ...
//     ],
//     "detected_month": "2026-06",
//     "raw_response": "..."   (solo per debug)
//   }
//
// SECRETS REQUIRED:
//   • GEMINI_API_KEY
//   • GEMINI_MODEL (opt, default gemini-2.5-flash)
// =====================================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// @ts-ignore - Deno global at runtime
declare const Deno: { env: { get(k: string): string | undefined } };

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};

function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  return null;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Prompt: chiediamo a Gemini di analizzare l'immagine come uno screenshot
// di un turno (calendar grid) ed estrarre solo le assenze "fuori casa".
function buildPrompt(userLang: string): string {
  return `Sei un assistente specializzato nel leggere screenshot di turni di lavoro
del personale di cabina / piloti / equipaggi aerei (apps tipo AIMS, eCrew,
CrewMobile, ecc.).

OBIETTIVO: estrarre dall'immagine SOLO le date in cui la persona è
**fuori casa** o **impegnata al lavoro**, e restituirle in JSON strutturato.

REGOLE DI CLASSIFICAZIONE (importanti):
1. ✈️ **Voli con pernotto** (codici IATA tipo ORD, SEA, JFK, LAX, FRA, …):
   - sono **assenze TRIP**
   - start_date = data partenza; end_date = data ultimo giorno fuori
     (di solito il volo dura più giorni — usa lo span visibile in foto)
   - location = "<Nome città> (<IATA>)" — es. "Chicago (ORD)", "Seattle (SEA)"
   - note = "Volo <IATA>"

2. **Standby / Reserve / Reperibilità** (codici: RES, RES_SB, RE, RB, REP):
   - sono **assenze STANDBY** (reserve/standby)
   - location = null
   - note = "Reserve / standby"

3. **Training / Corsi** (codici: SECCRM, EMCRM, EH, CRM, GROUND, SIM, REC):
   - sono **assenze TRAINING**
   - location = "Base" (se non specificata)
   - note = "<sigla letta>" (es. "SECCRM")

4. **NON includere** giorni con codici:
   - Rest, FREE, OFF, == (vuoti/disponibili a casa)
   - Sono giorni a casa e NON vanno aggiunti come assenza.

5. **Stesso codice su più giorni consecutivi** = una sola assenza che li
   abbraccia tutti (es. ORD da 3 a 5 → 1 record con start=3, end=5).

FORMATO OUTPUT (rigoroso, SOLO JSON, senza markdown):
{
  "detected_month": "YYYY-MM",
  "absences": [
    {
      "start_date": "YYYY-MM-DD",
      "end_date":   "YYYY-MM-DD",
      "reason":     "trip" | "standby" | "training",
      "location":   "<string>" | null,
      "note":       "<string>"
    }
  ]
}

ATTENZIONE:
- start_date <= end_date sempre (giorni inclusivi).
- Se il mese non è chiaramente leggibile, usa il mese visibile in alto a
  sinistra della UI.
- L'anno corrente è ${new Date().getUTCFullYear()} se non leggibile.
- Lingua di output IT (per i campi note/location).
- Restituisci SOLO il JSON, nient'altro. Niente \`\`\`json, niente commenti.
${userLang !== 'it' ? `- Traduci eventuali label nei \`note\` in lingua: ${userLang}` : ''}
`.trim();
}

interface AbsenceResult {
  start_date: string;
  end_date: string;
  reason: string;
  location: string | null;
  note: string;
}

interface ParseResult {
  detected_month: string | null;
  absences: AbsenceResult[];
}

function safeJsonParse(text: string): ParseResult | null {
  // Strip possibili wrap di code-block markdown
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  t = t.trim();
  try {
    const obj = JSON.parse(t);
    if (typeof obj !== 'object' || obj === null) return null;
    if (!Array.isArray(obj.absences)) return null;
    return {
      detected_month: typeof obj.detected_month === 'string' ? obj.detected_month : null,
      absences: obj.absences.filter((a: unknown): a is AbsenceResult => {
        return !!a && typeof a === 'object'
          && typeof (a as AbsenceResult).start_date === 'string'
          && typeof (a as AbsenceResult).end_date === 'string';
      }),
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  const pf = handlePreflight(req); if (pf) return pf;
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  let body: { image_base64?: string; mime_type?: string; user_lang?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const { image_base64, mime_type = 'image/jpeg', user_lang = 'it' } = body;

  if (!image_base64 || typeof image_base64 !== 'string') {
    return jsonResponse({ error: 'image_base64 is required (base64 without data: prefix)' }, 400);
  }

  // Limite indicativo: 8 MB di base64 (~6 MB di file binario)
  if (image_base64.length > 8 * 1024 * 1024) {
    return jsonResponse({ error: 'image too large (max ~6 MB)' }, 413);
  }

  const prompt = buildPrompt(user_lang);

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type, data: image_base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1, // deterministic per parsing
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return jsonResponse({
        error: 'gemini_error',
        status: geminiRes.status,
        detail: errText.slice(0, 500),
      }, 502);
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    const parsed = safeJsonParse(raw);
    if (!parsed) {
      return jsonResponse({
        error: 'parse_failed',
        raw_response: raw.slice(0, 2000),
      }, 502);
    }

    return jsonResponse({
      detected_month: parsed.detected_month,
      absences: parsed.absences,
    });

  } catch (e) {
    return jsonResponse({
      error: 'internal',
      detail: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});
