-- =====================================================================
--  FAMMY — Schedule cron per task-reminder-push
--  (promemoria push all'ora di scadenza dell'incarico)
-- ---------------------------------------------------------------------
--  Esegue la edge function `task-reminder-push` ogni MINUTO, come il
--  promemoria farmaci. La funzione notifica gli ASSEGNATARI dei task
--  con due_date = oggi e due_time = ora corrente (fuso Europe/Rome).
--  ⚠️ PREREQUISITO: crea prima la edge function `task-reminder-push`
--     (Dashboard → Edge Functions → Deploy new function) col contenuto
--     di /app/frontend/supabase/_dashboard_standalone/task-reminder-push.ts
--  Idempotente: drop & re-create del job.
-- =====================================================================

select cron.unschedule('fammy-task-reminder')
  where exists (select 1 from cron.job where jobname = 'fammy-task-reminder');

select cron.schedule(
  'fammy-task-reminder',
  '* * * * *',  -- ogni minuto
  $$
  select net.http_post(
    url := (select edge_base_url || '/functions/v1/task-reminder-push'
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

-- VERIFICA — deve mostrare 'fammy-task-reminder' attivo
select jobname, schedule, active from cron.job where jobname like 'fammy-%' order by jobname;
