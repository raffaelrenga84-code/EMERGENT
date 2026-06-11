-- =====================================================================
--  FAMMY — Digest del mattino (push alle 8:00 con la giornata di oggi)
--  Data: 2026-06
-- ---------------------------------------------------------------------
--  Aggiunge:
--   1) fammy_private.trigger_morning_digest() → chiama la edge function
--      cron-digest con kind="morning"
--   2) cron job 'fammy-morning-digest' alle 6:00 UTC
--      (= 8:00 ora italiana in estate, 7:00 in inverno — stessa
--       convenzione UTC fissa del digest serale)
--  Idempotente: puoi eseguirlo più volte.
--  ⚠️ PREREQUISITO: ri-deploya prima la edge function `cron-digest`
--     aggiornata (supporta kind="morning").
--  Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

-- 1) Funzione trigger (stesso pattern di trigger_daily_digest)
create or replace function fammy_private.trigger_morning_digest()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_service_key text;
begin
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    raise notice 'fammy: edge_base_url or service_role_key not set, skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/cron-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('kind', 'morning')
  );
end$$;

-- 2) Schedulazione pg_cron (idempotente)
do $$
begin
  perform cron.unschedule('fammy-morning-digest');
  exception when others then null;
end$$;

select cron.schedule(
  'fammy-morning-digest',
  '0 6 * * *',     -- tutti i giorni alle 6:00 UTC (≈ 8:00 IT estate / 7:00 inverno)
  $$ select fammy_private.trigger_morning_digest() $$
);

-- 3) VERIFICA — deve mostrare il job 'fammy-morning-digest' attivo
select jobname, schedule, active from cron.job where jobname like 'fammy-%' order by jobname;

-- ---------------------------------------------------------------------
-- TEST MANUALE (opzionale, invia subito il digest del mattino):
--   select fammy_private.trigger_morning_digest();
-- Poi controlla la risposta della edge function nei log:
--   Dashboard → Edge Functions → cron-digest → Logs
-- ---------------------------------------------------------------------
