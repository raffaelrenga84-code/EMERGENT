-- =====================================================================
--  FAMMY — Upgrade Assistenza (Care Hub)
--  1) Diario: pressione sanguigna (sistolica/diastolica, mmHg)
--  2) Medicine: fasi di frequenza variabile nel tempo
--     (es. settimana 1: 2 volte/giorno → settimana 2: 1 volta/giorno)
--     Formato schedule_phases (jsonb):
--       [{ "from": "2026-06-19", "times": ["08:00"] }, ...]
--     Le colonne start_date/end_date (periodo di assunzione) esistono già.
--  Idempotente. Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

alter table public.daily_diary
  add column if not exists bp_systolic smallint;
alter table public.daily_diary
  add column if not exists bp_diastolic smallint;

alter table public.medications
  add column if not exists schedule_phases jsonb;

notify pgrst, 'reload schema';

-- VERIFICA — entrambe le query devono restituire 1 riga
select column_name from information_schema.columns
  where table_name = 'daily_diary' and column_name in ('bp_systolic', 'bp_diastolic');
select column_name from information_schema.columns
  where table_name = 'medications' and column_name = 'schedule_phases';
