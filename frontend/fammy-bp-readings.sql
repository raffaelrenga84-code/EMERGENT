-- =====================================================================
--  FAMMY — Pressione: misurazioni multiple al giorno
--  daily_diary.bp_readings (jsonb):
--    [{ "t": "08:15", "sys": 120, "dia": 80 }, { "t": "20:30", ... }]
--  Migra i vecchi valori singoli (bp_systolic/bp_diastolic) nel nuovo
--  array. Le vecchie colonne restano (sola lettura, fallback frontend).
--  Idempotente. Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

alter table public.daily_diary
  add column if not exists bp_readings jsonb;

-- Migrazione legacy: valore singolo → array con orario sconosciuto
update public.daily_diary
   set bp_readings = jsonb_build_array(
         jsonb_build_object('t', null, 'sys', bp_systolic, 'dia', bp_diastolic))
 where bp_readings is null
   and bp_systolic is not null
   and bp_diastolic is not null;

notify pgrst, 'reload schema';

-- VERIFICA — deve restituire 1 riga
select column_name from information_schema.columns
 where table_name = 'daily_diary' and column_name = 'bp_readings';
