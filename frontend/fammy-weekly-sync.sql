-- ============================================================================
-- FAMMY — Preferenze utente + Weekly Calendar Sync (Iter 17)
--
-- Tabella generica `user_preferences` per memorizzare le preferenze utente
-- (qui usata per il sync settimanale del calendario via email).
--
-- Idempotente: puoi rilanciarla.
-- ============================================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Sync settimanale del calendario via email (.ics)
  weekly_email_sync boolean not null default false,
  -- Ultimo invio (per evitare doppi invii nella stessa settimana)
  weekly_email_last_sent_at timestamptz,
  -- Email destinazione (di default user.email, ma possiamo override)
  email_override text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_preferences_sync_idx
  on public.user_preferences(weekly_email_sync)
  where weekly_email_sync = true;

-- RLS: solo io vedo / modifico le mie preferenze
alter table public.user_preferences enable row level security;

drop policy if exists "Read own prefs" on public.user_preferences;
create policy "Read own prefs"
  on public.user_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert own prefs" on public.user_preferences;
create policy "Insert own prefs"
  on public.user_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Update own prefs" on public.user_preferences;
create policy "Update own prefs"
  on public.user_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger updated_at
create or replace function public.touch_user_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists user_preferences_touch_updated on public.user_preferences;
create trigger user_preferences_touch_updated
  before update on public.user_preferences
  for each row execute function public.touch_user_preferences_updated_at();


-- ============================================================================
-- pg_cron schedule: invocazione settimanale (domenica 18:00 UTC) dell'edge
-- function `weekly-calendar-sync`.
--
-- Richiede:
--   • pg_cron + pg_net abilitati nel progetto Supabase
--   • Tabella fammy_private.config con keys 'project_url' e 'service_role_key'
--     (le hai già configurate per il digest delle push notifications)
-- ============================================================================

do $$
declare
  project_url text;
  service_role_key text;
begin
  select value into project_url from fammy_private.config where key = 'project_url';
  select value into service_role_key from fammy_private.config where key = 'service_role_key';

  if project_url is null or service_role_key is null then
    raise notice 'fammy_private.config non configurato. Skip cron schedule.';
    return;
  end if;

  -- Rimuovi job esistente con lo stesso nome (idempotente)
  perform cron.unschedule('fammy-weekly-calendar-sync')
    where exists (select 1 from cron.job where jobname = 'fammy-weekly-calendar-sync');

  -- Domenica alle 18:00 UTC (= 19:00 ora italiana CET / 20:00 CEST)
  perform cron.schedule(
    'fammy-weekly-calendar-sync',
    '0 18 * * 0',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      project_url || '/functions/v1/weekly-calendar-sync',
      'Bearer ' || service_role_key
    )
  );
  raise notice '✓ Cron fammy-weekly-calendar-sync schedulato (domenica 18:00 UTC)';
end$$;

-- ============================================================================
-- DONE.
-- ============================================================================
