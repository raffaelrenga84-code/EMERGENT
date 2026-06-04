// Helper centralizzato per chiamare l'Edge Function `send-push` dal frontend.
// La function gira con verify_jwt=false ma per gentilezza passiamo comunque
// l'Authorization Bearer (Supabase Gateway lo accetta).
//
// In caso di errore: NON lanciare exceptions verso il chiamante (silent fail).
// Le notifiche push sono "best effort": se la function non risponde, l'app deve
// continuare a funzionare normalmente.

import { supabase } from './supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Invia una notifica push a uno o più utenti.
 * @param {object} opts
 * @param {string|string[]} opts.userIds - user_id (uuid) singolo o lista
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.tag]
 * @param {object} [opts.data] - payload custom (es. { task_id })
 * @returns {Promise<{sent?: number, reason?: string} | null>}
 */
export async function sendPush({ userIds, title, body, tag, data }) {
  try {
    if (!SUPABASE_URL) return null;
    const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : (userIds ? [userIds] : []);
    if (ids.length === 0 || !title || !body) return null;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ANON ? { apikey: ANON } : {}),
      },
      body: JSON.stringify({
        user_ids: ids,
        title,
        body,
        tag,
        data: data || {},
      }),
    });
    if (!res.ok) return null;
    try { return await res.json(); } catch { return null; }
  } catch (err) {
    // Silent: push best-effort
    if (typeof console !== 'undefined') console.warn('sendPush failed:', err?.message || err);
    return null;
  }
}

/**
 * Risolve i member.id -> user_id per una lista di member_id.
 * Restituisce un Set di user_id (deduplicato).
 */
export async function memberIdsToUserIds(memberIds) {
  const list = (memberIds || []).filter(Boolean);
  if (list.length === 0) return new Set();
  const { data } = await supabase
    .from('members').select('id, user_id').in('id', list);
  const set = new Set();
  for (const m of (data || [])) {
    if (m?.user_id) set.add(m.user_id);
  }
  return set;
}
