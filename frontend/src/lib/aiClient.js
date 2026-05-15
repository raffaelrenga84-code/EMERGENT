// Thin fetch wrapper for the FAMMY AI backend.
// Uses VITE_BACKEND_URL (or REACT_APP_BACKEND_URL fallback) so the same code
// works in dev and on the Emergent preview URL.

const BASE =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.REACT_APP_BACKEND_URL ||
  '';

async function post(path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).detail || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

export const aiClient = {
  /** Multi-turn assistant chat. Returns { reply, session_id }. */
  chat: ({ message, user_id, family_context, lang = 'it', session_id = null }) =>
    post('/ai/chat', { message, user_id, family_context, lang, session_id }),

  /** Generate the weekly summary card. Returns { summary, highlights[] }. */
  weeklySummary: (payload) => post('/ai/weekly-summary', { ...payload, lang: payload.lang || 'it' }),

  /** Smart-classify a task title. Returns { category, suggested_due_date, reasoning }. */
  suggestTask: ({ title, lang = 'it', today = null }) =>
    post('/ai/suggest-task', { title, lang, today }),

  /** Generate gift ideas for a family member. Returns { ideas: [...] }. */
  giftIdeas: (payload) => post('/ai/gift-ideas', { ...payload, lang: payload.lang || 'it' }),
};
