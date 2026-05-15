// =====================================================================
// FAMMY — Supabase Edge Function: ai-weekly-summary (ALL-IN-ONE)
// =====================================================================
// Given week stats, returns { summary: string, highlights: string[] }.
//
// SECRETS REQUIRED on Supabase → Project Settings → Edge Functions:
//   • GEMINI_API_KEY  (mandatory)
//   • GEMINI_MODEL    (optional, defaults to gemini-2.5-flash)
//
// HOW TO DEPLOY (Dashboard):
//   1. Supabase Dashboard → Edge Functions → + Create a new function
//   2. Name: ai-weekly-summary
//   3. Paste THIS ENTIRE FILE into the editor (overwrite the sample)
//   4. Click "Deploy function"
// =====================================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// @ts-ignore - Deno global at runtime
declare const Deno: { env: { get(k: string): string | undefined } };

// ----- Inlined shared helper -----
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function langName(code: string): string {
  return ({ it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German' } as Record<string, string>)[code] ?? 'Italian';
}

interface GeminiContent { role: 'user' | 'model'; parts: { text: string }[]; }
interface GeminiOpts { systemInstruction?: string; responseMimeType?: 'application/json' | 'text/plain'; temperature?: number; }

async function callGemini(contents: GeminiContent[], opts: GeminiOpts = {}): Promise<string> {
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

function extractJSON(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_e) { /* keep going */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (_e) { /* keep going */ } }
  const m = text.match(/[\{\[][\s\S]+[\}\]]/);
  if (m) { try { return JSON.parse(m[0]); } catch (_e) { /* drop */ } }
  return null;
}
// ----- end of inlined helper -----

interface SummaryRequest {
  family_name: string;
  completed_tasks?: string[];
  pending_tasks?: string[];
  upcoming_events?: string[];
  total_expenses?: number | null;
  upcoming_birthdays?: string[];
  lang?: string;
}

serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: SummaryRequest;
  try { body = await req.json(); } catch (_e) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const lang = body.lang ?? 'it';

  const payload = {
    family_name: body.family_name,
    completed_tasks_count: (body.completed_tasks ?? []).length,
    completed_tasks: (body.completed_tasks ?? []).slice(0, 15),
    pending_tasks_count: (body.pending_tasks ?? []).length,
    pending_tasks: (body.pending_tasks ?? []).slice(0, 10),
    upcoming_events: (body.upcoming_events ?? []).slice(0, 10),
    total_expenses: body.total_expenses ?? null,
    upcoming_birthdays: (body.upcoming_birthdays ?? []).slice(0, 5),
  };

  const systemInstruction = [
    `You are FAMMY, a warm family-organization assistant.`,
    `Generate a friendly weekly recap for a family in ${langName(lang)}.`,
    `Respond ONLY with valid JSON in this exact shape:`,
    `{"summary": "<2-3 sentence celebratory paragraph>", "highlights": ["<bullet 1>", "<bullet 2>", "<bullet 3>"]}`,
    `Keep tone warm, encouraging, with light emoji.`,
  ].join('\n');

  let reply: string;
  try {
    reply = await callGemini(
      [{ role: 'user', parts: [{ text: `Generate the recap for: ${JSON.stringify(payload)}` }] }],
      { systemInstruction, responseMimeType: 'application/json', temperature: 0.8 },
    );
  } catch (e) {
    return jsonResponse({ error: `AI error: ${(e as Error).message}` }, 500);
  }

  const parsed = (extractJSON(reply) ?? {}) as { summary?: string; highlights?: unknown };
  const summary = String(parsed.summary ?? reply ?? '').trim();
  const rawHl = parsed.highlights;
  const highlights = Array.isArray(rawHl) ? rawHl.map((x) => String(x)).slice(0, 5) : [];
  return jsonResponse({ summary, highlights });
});
