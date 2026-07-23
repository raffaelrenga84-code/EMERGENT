// =====================================================================
// FAMMY — Supabase Edge Function: ai-chat (ALL-IN-ONE)
// =====================================================================
// Multi-turn family assistant. Supports tool-calling: the model can emit
//   [[ACTION:create_task|{...}]]
//   [[ACTION:create_event|{...}]]
// at the end of its reply when the user asks to add/create something.
//
// Chat history is persisted in the `chat_messages` table (run
// fammy-ai-chat-table.sql once on Supabase to create it).
//
// SECRETS REQUIRED on Supabase → Project Settings → Edge Functions:
//   • GEMINI_API_KEY  (mandatory)
//   • GEMINI_MODEL    (optional, defaults to gemini-2.5-flash)
//
// HOW TO DEPLOY (Dashboard):
//   1. Supabase Dashboard → Edge Functions → + Create a new function
//   2. Name: ai-chat
//   3. Paste THIS ENTIRE FILE into the editor (overwrite the sample)
//   4. Click "Deploy function"
// =====================================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// @ts-ignore - Deno global at runtime
declare const Deno: { env: { get(k: string): string | undefined } };

// ----- Inlined shared helper (was _shared/gemini.ts) -----
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
// ----- end of inlined helper -----

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface FamilyContext {
  family_name?: string;
  members?: string[];
  today_tasks?: string[];
  upcoming_events?: string[];
}

interface ChatRequest {
  message: string;
  user_id?: string;
  family_context?: FamilyContext;
  lang?: string;
  session_id?: string | null;
}

function buildSystemPrompt(lang: string, ctx: FamilyContext | undefined, today: string): string {
  const ctxLines: string[] = [];
  if (ctx?.family_name) ctxLines.push(`Family name: ${ctx.family_name}`);
  if (ctx?.members?.length) ctxLines.push(`Members: ${ctx.members.join(', ')}`);
  if (ctx?.today_tasks?.length) ctxLines.push(`Today's open tasks: ${ctx.today_tasks.join('; ')}`);
  if (ctx?.upcoming_events?.length) ctxLines.push(`Upcoming events: ${ctx.upcoming_events.join('; ')}`);
  const familyCtx = ctxLines.length ? ctxLines.join('\n') : 'No family context provided yet.';

  return [
    `You are FAMMY, a warm and helpful family-organization assistant.`,
    `Answer in ${langName(lang)}. Be conversational, friendly, concise, and use light emoji when natural.`,
    `You help with tasks, meal planning, birthdays, shared expenses, weekly planning, kids' activities, and general home organization.`,
    `Never invent data: if asked about specific tasks or events you don't see in the context, ask the user.`,
    ``,
    `Today's date is ${today} (UTC). Use this when interpreting relative dates like "oggi", "domani", "venerdì", "prossima settimana".`,
    ``,
    `=== Family context ===`,
    familyCtx,
    ``,
    `=== TOOL CALLING ===`,
    `When (and ONLY when) the user clearly asks you to CREATE/ADD a new task ("incarico", "to-do", "chore") or a new event ("evento", "appointment", "appuntamento"), append a single JSON action line at the very end of your reply, on its own line, in EXACTLY this format:`,
    `  [[ACTION:create_task|{"title":"...","category":"care|home|health|admin|spese|other","due_date":"YYYY-MM-DD or null"}]]`,
    `  [[ACTION:create_event|{"title":"...","starts_at":"YYYY-MM-DDTHH:MM or null","location":"... or null"}]]`,
    `Category guide:`,
    `  • care  : caring for kids/elderly/pets`,
    `  • home  : groceries, cleaning, repairs, household errands (e.g. buying bread)`,
    `  • health: doctor, medication, fitness`,
    `  • admin : paperwork, school forms, banking`,
    `  • spese : BILLS to pay (bolletta, rata) — NOT groceries`,
    `  • other : everything else`,
    `Rules:`,
    `  • Use double quotes inside the JSON. Use null (not "null") when missing.`,
    `  • Date math: today + 1 day = tomorrow, using ${today} as today.`,
    `  • Tasks have due_date (date). Events have starts_at (date + optional time, default 19:00).`,
    `  • If the user just asks a question (no creation intent), DO NOT emit any ACTION block.`,
    `  • Your conversational reply (before the ACTION line) should still be friendly and confirm what you're about to add.`,
  ].join('\n');
}

serve(async (req) => {
  const pre = handlePreflight(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabaseUser.auth.getUser();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: ChatRequest;
  try { body = await req.json(); } catch (_e) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  if (!body?.message?.trim()) return jsonResponse({ error: 'message is required' }, 400);

  const userId = userData?.user?.id ?? body.user_id ?? 'anonymous';
  const lang = body.lang ?? 'it';
  const today = new Date().toISOString().slice(0, 10);
  const sessionId = body.session_id || `chat-${userId}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: history } = await admin
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(10);
  const historicalUserTurns = (history ?? []).reverse();

  const systemInstruction = buildSystemPrompt(lang, body.family_context, today);

  const contents = [
    ...historicalUserTurns.flatMap((h) => [
      { role: 'user' as const, parts: [{ text: h.content }] },
      { role: 'model' as const, parts: [{ text: '...' }] },
    ]),
    { role: 'user' as const, parts: [{ text: body.message }] },
  ];

  let reply: string;
  try {
    reply = await callGemini(contents, { systemInstruction, temperature: 0.7 });
  } catch (e) {
    return jsonResponse({ error: `AI error: ${(e as Error).message}` }, 500);
  }

  const nowIso = new Date().toISOString();
  await admin.from('chat_messages').insert([
    { session_id: sessionId, user_id: userId, role: 'user', content: body.message, created_at: nowIso },
    { session_id: sessionId, user_id: userId, role: 'assistant', content: reply, created_at: nowIso },
  ]).then(() => null).catch(() => null);

  return jsonResponse({ reply, session_id: sessionId });
});
