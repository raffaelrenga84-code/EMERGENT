-- =====================================================================
--  FAMMY — Alias famiglia per membro (nome/emoji/foto personalizzati)
--  Ogni membro può vedere la famiglia con un nome/foto proprio
--  (es. il creatore la chiama "Famiglia Renga", un membro "Casa").
--  I valori vivono sulla riga `members` dell'utente (1 riga per
--  famiglia+utente) e NON toccano la famiglia reale.
--  Idempotente. Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

alter table public.members
  add column if not exists custom_family_name text;

alter table public.members
  add column if not exists custom_family_emoji text;

alter table public.members
  add column if not exists custom_family_photo_url text;

notify pgrst, 'reload schema';

-- VERIFICA — deve restituire 3 righe
select column_name from information_schema.columns
 where table_name = 'members'
   and column_name in ('custom_family_name', 'custom_family_emoji', 'custom_family_photo_url');
