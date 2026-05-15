// FAMMY — AI client.
// Routes 4 endpoints to Supabase Edge Functions (Gemini-backed, free tier).
//
// Edge Function names: ai-chat, ai-weekly-summary, ai-suggest-task, ai-gift-ideas
// All deployed under {SUPABASE_URL}/functions/v1/<name>.
//
// We use the supabase-js client directly so the user's JWT (auth) is sent
// automatically — the ai-chat function uses it to identify the caller.
import { supabase } from './supabase.js';

async function invoke(fnName, body) {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    // supabase-js wraps non-2xx into `error`; try to extract the human message
    const detail = error?.context?.error
      || error?.message
      || (typeof data === 'object' && data?.error)
      || 'Request failed';
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
  return data;
}

export const aiClient = {
  /** Multi-turn assistant chat. Returns { reply, session_id }. */
  chat: ({ message, user_id, family_context, lang = 'it', session_id = null }) =>
    invoke('ai-chat', { message, user_id, family_context, lang, session_id }),

  /** Generate the weekly summary card. Returns { summary, highlights[] }. */
  weeklySummary: (payload) => invoke('ai-weekly-summary', { ...payload, lang: payload.lang || 'it' }),

  /** Smart-classify a task title. Returns { category, suggested_due_date, reasoning }. */
  suggestTask: ({ title, lang = 'it', today = null }) =>
    invoke('ai-suggest-task', { title, lang, today }),

  /** Generate gift ideas for a family member. Returns { ideas: [...] }. */
  giftIdeas: (payload) => invoke('ai-gift-ideas', { ...payload, lang: payload.lang || 'it' }),
};
