// =====================================================================
// FAMMY — Supabase Edge Function: ai-gift-ideas (ALL-IN-ONE)
// =====================================================================
// Given a family member's profile, returns 5 gift ideas.
//   { ideas: [{ title, description, price_range }, ... ] }
//
// SECRETS REQUIRED on Supabase → Project Settings → Edge Functions:
//   • GEMINI_API_KEY  (mandatory)
//   • GEMINI_MODEL    (optional, defaults to gemini-2.5-flash)
//
// HOW TO DEPLOY (Dashboard):
//   1. Supabase Dashboard → Edge Functions → + Create a new function
//   2. Name: ai-gift-ideas
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

interface GiftRequest {
  member_name: string;
  member_role?: string | null;
  age?: number | null;
  interests?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  lang?: string;
}

serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: GiftRequest;
  try { body = await req.json(); } catch (_e) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  if (!body?.member_name?.trim()) return jsonResponse({ error: 'member_name is required' }, 400);

  const lang = body.lang ?? 'it';
  const lo = body.budget_min ?? 0;
  const hi = body.budget_max ?? 9999;
  const budget = (body.budget_min != null || body.budget_max != null) ? `Budget range: ${lo}-${hi} EUR. ` : '';

  const systemInstruction = [
    `You are FAMMY's gift advisor.`,
    `Suggest exactly 5 thoughtful, realistic birthday gift ideas for a family member, in ${langName(lang)}. ${budget}`,
    `Each idea should fit the person's role, age, and interests. Avoid clichés; aim for warm, personal suggestions.`,
    `Respond ONLY with valid JSON: {"ideas":[{"title":"...", "description":"...", "price_range":"e.g. 20-40€"}, ...]}`,
  ].join('\n');

  const userPayload = {
    name: body.member_name,
    role: body.member_role ?? null,
    age: body.age ?? null,
    interests: body.interests ?? null,
  };

  let reply: string;
  try {
    reply = await callGemini(
      [{ role: 'user', parts: [{ text: `Family member:\n${JSON.stringify(userPayload)}` }] }],
      { systemInstruction, responseMimeType: 'application/json', temperature: 0.8 },
    );
  } catch (e) {
    return jsonResponse({ error: `AI error: ${(e as Error).message}` }, 500);
  }

  const parsed = (extractJSON(reply) ?? {}) as { ideas?: unknown };
  const rawIdeas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  const ideas = rawIdeas
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .slice(0, 5)
    .map((it) => ({
      title: String(it.title ?? '').trim() || 'Regalo',
      description: String(it.description ?? '').trim(),
      price_range: String(it.price_range ?? '').trim() || '—',
    }));

  if (ideas.length === 0) return jsonResponse({ error: 'No ideas returned' }, 502);
  return jsonResponse({ ideas });
});
