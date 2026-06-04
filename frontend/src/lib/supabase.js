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
 * Ogni chiamata ritorna un nuovo client → garbage-collectato a fine flow.
 */
export function createIsolatedClient() {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    },
  });
}
