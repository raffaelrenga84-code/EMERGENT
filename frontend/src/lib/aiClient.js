// FAMMY — AI client.
// Routes 4 endpoints to Supabase Edge Functions (Gemini-backed, free tier).
//
// Edge Function names: ai-chat, ai-weekly-summary, ai-suggest-task, ai-gift-ideas
// All deployed under {SUPABASE_URL}/functions/v1/<name>.
//
// We use the supabase-js client directly so the user's JWT (auth) is sent
// automatically — the ai-chat function uses it to identify the caller.
import { supabase } from './supabase.js';

/**
 * Pull the real error message out of a FunctionsHttpError.
 * supabase-js wraps non-2xx responses in `error.context` which is a Response
 * object. The actual JSON `{error:'...'}` from our Edge Function lives there.
 */
async function extractFunctionError(error, data) {
  // 1) the Edge Function returned { error: 'real message' } in the body
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    } catch (_e) {
      // not JSON — try plain text
      try {
        const txt = await error.context.clone().text();
        if (txt) return txt.slice(0, 400);
      } catch (_e2) { /* fall through */ }
    }
  }
  // 2) some errors come back as JSON already parsed in `data`
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return String(data.error);
  }
  // 3) supabase-js plain message
  if (error?.message) return error.message;
  return 'Request failed';
}

async function invoke(fnName, body) {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    const detail = await extractFunctionError(error, data);
    throw new Error(detail);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error));
  }
  return data;
}

export const aiClient = {
  chat: ({ message, user_id, family_context, lang = 'it', session_id = null }) =>
    invoke('ai-chat', { message, user_id, family_context, lang, session_id }),
  weeklySummary: (payload) => invoke('ai-weekly-summary', { ...payload, lang: payload.lang || 'it' }),
  suggestTask: ({ title, lang = 'it', today = null }) =>
    invoke('ai-suggest-task', { title, lang, today }),
  giftIdeas: (payload) => invoke('ai-gift-ideas', { ...payload, lang: payload.lang || 'it' }),
};
