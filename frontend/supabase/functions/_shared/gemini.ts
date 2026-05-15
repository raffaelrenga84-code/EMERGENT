// Shared helper for FAMMY AI Edge Functions.
// All four functions (chat, weekly-summary, suggest-task, gift-ideas)
// call the same Gemini endpoint with slightly different prompts.

// @ts-ignore - Deno global at runtime
declare const Deno: { env: { get(k: string): string | undefined } };

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function langName(code: string): string {
  return ({ it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German' } as Record<string, string>)[code] ?? 'Italian';
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiOpts {
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
}

/** Single round-trip to Gemini. Returns the plain text the model produced. */
export async function callGemini(contents: GeminiContent[], opts: GeminiOpts = {}): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured on Supabase secrets');
  const body: Record<string, unknown> = { contents };
  if (opts.systemInstruction) body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  const generationConfig: Record<string, unknown> = { temperature: opts.temperature ?? 0.7 };
  if (opts.responseMimeType) generationConfig.responseMimeType = opts.responseMimeType;
  body.generationConfig = generationConfig;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim();
}

/** Best-effort JSON extraction (handles fenced ```json blocks). */
export function extractJSON(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_e) { /* keep going */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (_e) { /* keep going */ } }
  const m = text.match(/[\{\[][\s\S]+[\}\]]/);
  if (m) { try { return JSON.parse(m[0]); } catch (_e) { /* drop */ } }
  return null;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
