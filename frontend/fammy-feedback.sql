-- =====================================================================
--  FAMMY — Feedback log
-- ---------------------------------------------------------------------
--  Tabella opzionale per archiviare i feedback ricevuti (oltre a inviarli
--  via email). Utile per analizzare il trend, esportare in CSV ecc.
--
--  Idempotente: eseguibile più volte.
-- =====================================================================

create table if not exists public.feedback_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  rating      smallint check (rating between 0 and 5),
  message     text,
  app_lang    text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_log_created_idx
  on public.feedback_log(created_at desc);

create index if not exists feedback_log_user_idx
  on public.feedback_log(user_id);

alter table public.feedback_log enable row level security;

-- L'utente può vedere SOLO i propri feedback (privacy).
drop policy if exists "feedback_select_self" on public.feedback_log;
create policy "feedback_select_self" on public.feedback_log for select
  to authenticated using (user_id = auth.uid());

-- Inserimento avviene tramite Edge Function (service role), quindi NESSUNA
-- policy di INSERT per authenticated → l'unico path è server-side.
