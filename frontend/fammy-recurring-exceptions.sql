-- =====================================================================
-- FAMMY — Eccezioni per occorrenze singole di eventi/task ricorrenti
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente: sicuro rieseguire.
--
-- Cosa fa:
-- Aggiunge una colonna `recurring_exceptions text[]` (array di date YYYY-MM-DD)
-- su events e tasks. Quando l'utente elimina o modifica UNA SOLA occorrenza
-- di una serie ricorrente, la data viene aggiunta a questo array e il
-- frontend la salta nell'espansione.

alter table public.events add column if not exists recurring_exceptions text[];
alter table public.tasks  add column if not exists recurring_exceptions text[];

-- Indici GIN per query veloci (se mai filtriamo per "questa data è esclusa")
create index if not exists idx_events_recurring_exceptions
  on public.events using gin (recurring_exceptions);
create index if not exists idx_tasks_recurring_exceptions
  on public.tasks using gin (recurring_exceptions);
