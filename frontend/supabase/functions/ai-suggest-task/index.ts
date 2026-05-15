// Supabase Edge Function: ai-suggest-task
// Given a task title, returns { category, suggested_due_date, reasoning }.
//
// Deploy:  supabase functions deploy ai-suggest-task
// Secrets: GEMINI_API_KEY
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { callGemini, extractJSON, handlePreflight, jsonResponse, langName, todayISO } from '../_shared/gemini.ts';

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
