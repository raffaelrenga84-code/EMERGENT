-- =====================================================================
--  FAMMY — Feedback log (v3): supporto invio anonimo
-- ---------------------------------------------------------------------
--  Aggiunge la colonna is_anonymous: quando true, l'inbox lato admin
--  mostra "Anonimo" e nasconde nome/contatti dell'autore.
--  Il user_id RIMANE su DB (per RLS insert_self e abuse prevention),
--  ma nessun admin lo vede né può risalire al profilo da UI.
--
--  Idempotente.
-- =====================================================================

alter table public.feedback_log
  add column if not exists is_anonymous boolean not null default false;
