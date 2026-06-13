-- =====================================================================
-- FAMMY — HOTFIX cron promemoria medicine (push fuori app)
-- =====================================================================
-- 🐛 Bug: il vecchio `fammy-medication-cron.sql` aveva una query SBAGLIATA
--    `select edge_base_url from fammy_private.config` → colonna inesistente.
--    La config ha schema (key text, value text). Il cron fallisce ad ogni
--    minuto in silenzio → niente push medicine quando l'app è chiusa.
--    Gli altri cron (task-reminder, digest) usano la sintassi corretta e
--    funzionano. Questo HOTFIX riallinea la medicine al pattern corretto.
--
-- Requisiti (gli stessi di tutti gli altri cron, già configurati da te):
--   1. fammy_private.config con righe per `edge_base_url` e `service_role_key`
--   2. estensione pg_cron + net (Dashboard → Database → Extensions)
--   3. edge function `medication-reminder-push` deployata (già fatto)
--
-- Idempotente: drop & re-create il job.

select cron.unschedule('fammy-medication-reminder')
  where exists (select 1 from cron.job where jobname = 'fammy-medication-reminder');

select cron.schedule(
  'fammy-medication-reminder',
  '* * * * *',  -- ogni minuto
  $$
  select net.http_post(
    url := (select value from fammy_private.config where key = 'edge_base_url')
           || '/functions/v1/medication-reminder-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from fammy_private.config where key = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);

-- =====================================================================
-- VERIFICA (esegui DOPO il blocco sopra per controllare che funzioni)
-- =====================================================================
-- 1. Controlla che il job sia schedulato correttamente:
--    select jobname, schedule, active from cron.job
--    where jobname = 'fammy-medication-reminder';
--
-- 2. Aspetta 1-2 minuti, poi controlla che la run sia andata a buon fine
--    (status='succeeded'):
--    select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='fammy-medication-reminder')
--    order by start_time desc limit 5;
--
-- 3. Trigger MANUALE per test immediato (senza aspettare il prossimo minuto):
--    select net.http_post(
--      url := (select value from fammy_private.config where key = 'edge_base_url')
--             || '/functions/v1/medication-reminder-push',
--      headers := jsonb_build_object(
--        'Content-Type', 'application/json',
--        'Authorization', 'Bearer ' || (select value from fammy_private.config where key = 'service_role_key')
--      ),
--      body := '{"manual":true}'::jsonb
--    );
--
--    Poi su Supabase Dashboard → Edge Functions → medication-reminder-push
--    → Logs: dovresti vedere la risposta con `sent_total` > 0 se c'è una
--    medicina con orario in corso.
