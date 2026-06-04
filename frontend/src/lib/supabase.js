import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Mancano le variabili VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. Controlla il file .env.local'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Crea un client Supabase ISOLATO con persistenza disabilitata.
 * Usato per "merge account": logghiamo temporaneamente un altro utente
 * (account B da assorbire) per ottenere il suo access token, senza
 * sovrascrivere la session principale dell'utente già loggato (A).
 *
 * Storage IN-MEMORY (Map) — non tocca localStorage di A, ma permette al
 * client di rileggere il proprio stato durante il flow (rpc/verifyOtp).
 * `persistSession: false` da solo non basta perché la libreria continua
 * a "toccare" localStorage con la storageKey di default condivisa.
 *
 * Ogni chiamata ritorna un NUOVO client + storage isolato → garbage-collectato
 * a fine flow.
 */
export function createIsolatedClient() {
  const mem = new Map();
  const memoryStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,           // serve per tenere lo stato in `memoryStorage`
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryStorage,
      storageKey: `fammy-iso-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
}
