-- =====================================================================
--  FAMMY - Aggiunge categoria 'spese' ai task
-- ---------------------------------------------------------------------
--  Da eseguire UNA VOLTA su Supabase. Sostituisce solo il check constraint,
--  niente di distruttivo.
-- =====================================================================

alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('care','home','health','admin','other','spese'));
