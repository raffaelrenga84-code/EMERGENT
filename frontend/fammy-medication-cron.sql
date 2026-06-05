-- =====================================================================
-- FAMMY — Schedule cron per medication-reminder-push
-- =====================================================================
-- Esegue la edge function `medication-reminder-push` ogni MINUTO.
-- Richiede:
--   1. fammy_private.config con `edge_base_url` e `service_role_key`
--      (lo stesso usato dagli altri cron, vedi fammy-push-notifications.sql)
--   2. estensione pg_cron già abilitata su Supabase (Dashboard → Database
--      → Extensions → enable pg_cron)
--
-- Idempotente: drop & re-create il job.

select cron.unschedule('fammy-medication-reminder')
  where exists (select 1 from cron.job where jobname = 'fammy-medication-reminder');

select cron.schedule(
  'fammy-medication-reminder',
  '* * * * *',  -- ogni minuto
  $$
  select net.http_post(
    url := (select edge_base_url || '/functions/v1/medication-reminder-push'
            from fammy_private.config limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select service_role_key from fammy_private.config limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);
