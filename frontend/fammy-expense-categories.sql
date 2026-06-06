-- =====================================================================
--  FAMMY — Categoria per le spese (con icone)
-- ---------------------------------------------------------------------
--  Aggiunge colonna `category` opzionale a `expenses`.
--  Valori canonici (frontend mappa a icone/colori):
--   - groceries  🛒  supermercato, alimentari
--   - bills      💡  bollette, utenze
--   - school     🎒  scuola, asilo
--   - home       🏠  casa, manutenzione
--   - health     🩺  salute, medico, farmaci
--   - transport  🚗  trasporti, carburante
--   - leisure    🎉  svago, ristoranti
--   - other      💶  altro (default)
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

alter table public.expenses
  add column if not exists category text;

comment on column public.expenses.category is
  'Categoria opzionale: groceries|bills|school|home|health|transport|leisure|other';

create index if not exists idx_expenses_category on public.expenses(category);
