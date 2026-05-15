// =====================================================================
// FAMMY — Supabase Edge Function: ai-suggest-task (ALL-IN-ONE)
// =====================================================================
// Given a task title, returns { category, suggested_due_date, reasoning }.
//
// SECRETS REQUIRED on Supabase → Project Settings → Edge Functions:
//   • GEMINI_API_KEY  (mandatory)
//   • GEMINI_MODEL    (optional, defaults to gemini-2.5-flash)
//
// HOW TO DEPLOY (Dashboard):
//   1. Supabase Dashboard → Edge Functions → + Create a new function
//   2. Name: ai-suggest-task
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

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

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

interface SuggestRequest {
  title: string;
  today?: string;
  lang?: string;
}

const ALLOWED = new Set(['care', 'home', 'health', 'admin', 'spese', 'other']);

serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: SuggestRequest;
  try { body = await req.json(); } catch (_e) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  if (!body?.title?.trim()) return jsonResponse({ error: 'title is required' }, 400);

  const lang = body.lang ?? 'it';
  const today = body.today || todayISO();

  const systemInstruction = [
    `You are FAMMY's smart task classifier.`,
    `Given a family task title, classify it into one category and suggest a due date.`,
    `Categories:`,
    ` - care  : caring for people/pets (children, elderly, animals)`,
    ` - home  : household errands, groceries, cleaning, repairs`,
    ` - health: medical, doctor visits, medications, fitness`,
    ` - admin : paperwork, school forms, banking, taxes, appointments`,
    ` - spese : payments and bills (pagare, bolletta, rata, abbonamento)`,
    ` - other : anything that doesn't fit`,
    ``,
    `Today is ${today}. Suggested due date must be ISO YYYY-MM-DD format (or null if not time-sensitive).`,
    `Respond ONLY with valid JSON:`,
    `{"category":"<one of care|home|health|admin|spese|other>", "suggested_due_date":"YYYY-MM-DD or null", "reasoning":"<one short sentence in ${langName(lang)}>"}`,
  ].join('\n');

  let reply: string;
  try {
    reply = await callGemini(
      [{ role: 'user', parts: [{ text: `Task: ${body.title}` }] }],
      { systemInstruction, responseMimeType: 'application/json', temperature: 0.2 },
    );
  } catch (e) {
    return jsonResponse({ error: `AI error: ${(e as Error).message}` }, 500);
  }

  const parsed = (extractJSON(reply) ?? {}) as { category?: string; suggested_due_date?: string | null; reasoning?: string };
  let category = String(parsed.category ?? 'other').toLowerCase();
  if (!ALLOWED.has(category)) category = 'other';
  let due = parsed.suggested_due_date ?? null;
  if (due === 'null' || due === '') due = null;
  return jsonResponse({
    category,
    suggested_due_date: due,
    reasoning: String(parsed.reasoning ?? ''),
  });
});
