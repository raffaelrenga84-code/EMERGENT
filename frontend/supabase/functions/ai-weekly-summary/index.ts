// Supabase Edge Function: ai-weekly-summary
// Returns { summary: string, highlights: string[] } for the week.
//
// Deploy:  supabase functions deploy ai-weekly-summary
// Secrets: GEMINI_API_KEY
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { callGemini, extractJSON, handlePreflight, jsonResponse, langName } from '../_shared/gemini.ts';

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
