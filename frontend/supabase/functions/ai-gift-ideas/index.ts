// Supabase Edge Function: ai-gift-ideas
// Returns { ideas: [{ title, description, price_range }, ...] } for a member.
//
// Deploy:  supabase functions deploy ai-gift-ideas
// Secrets: GEMINI_API_KEY
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { callGemini, extractJSON, handlePreflight, jsonResponse, langName } from '../_shared/gemini.ts';

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
