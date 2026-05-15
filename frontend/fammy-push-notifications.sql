-- =====================================================================
-- FAMMY — Push Notifications ad app chiusa (Web Push + pg_cron)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente. NON inserire qui le VAPID keys: vanno nei Supabase Secrets.

-- 1) Tabella subscriptions: una per (user, browser/device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Gli utenti possono leggere/scrivere SOLO le proprie subscription
drop policy if exists "push_subs_self_rw" on public.push_subscriptions;
create policy "push_subs_self_rw" on public.push_subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Estensioni richieste
create extension if not exists pg_cron;
create extension if not exists pg_net;  -- per net.http_post

-- 3) Helper SECURITY DEFINER per richiamare le edge function
-- Le funzioni edge richiedono un Authorization header con il service_role
-- key. Lo leggiamo dal secret `app_service_role_key` (vault o Vault-like).
-- Per semplicita' usiamo un secret salvato in app.settings (modificabile via SQL).

-- Crea uno schema per i secret se non esiste
create schema if not exists fammy_private;

-- Tabella key-value per i config (solo accesso service_role lato Supabase API)
create table if not exists fammy_private.config (
  key text primary key,
  value text not null
);

revoke all on fammy_private.config from public, authenticated, anon;

-- 4) Funzioni helper per scatenare le edge function via pg_net
create or replace function fammy_private.trigger_daily_digest()
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
    body := jsonb_build_object('kind', 'daily')
  );
end$$;

create or replace function fammy_private.trigger_weekly_summary()
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
    body := jsonb_build_object('kind', 'weekly')
  );
end$$;

-- 5) Schedulazione pg_cron (timezone Europe/Rome = UTC+1/+2)
-- 21:00 ora di Roma = 19:00 UTC (estate) / 20:00 UTC (inverno).
-- Per semplicita' usiamo 19:00 UTC tutto l'anno (l'utente puo' aggiustare).
-- Domenica 20:00 UTC = 21:00 / 22:00 ora locale → weekly summary.
--
-- Cancella i job se già esistono (idempotente)
do $$
begin
  perform cron.unschedule('fammy-daily-digest');
  exception when others then null;
end$$;
do $$
begin
  perform cron.unschedule('fammy-weekly-summary');
  exception when others then null;
end$$;

select cron.schedule(
  'fammy-daily-digest',
  '0 19 * * *',     -- tutti i giorni alle 19:00 UTC (≈ 21:00 IT)
  $$ select fammy_private.trigger_daily_digest() $$
);

select cron.schedule(
  'fammy-weekly-summary',
  '0 20 * * 0',     -- domenica alle 20:00 UTC (≈ 22:00 IT)
  $$ select fammy_private.trigger_weekly_summary() $$
);

-- =====================================================================
-- ⚠️ DOPO AVER ESEGUITO QUESTO FILE, devi inserire 2 valori in
--    fammy_private.config (UNA volta sola). Trovi le istruzioni
--    nel commento finale.
-- =====================================================================
--
-- INSERIRE QUESTI VALORI MANUALMENTE (NON committarli in git):
--
--   insert into fammy_private.config (key, value) values
--     ('edge_base_url',     'https://<TUO-PROJECT-REF>.supabase.co'),
--     ('service_role_key',  '<la tua SERVICE_ROLE_KEY da Settings → API>')
--   on conflict (key) do update set value = excluded.value;
--
-- 🔒 La service_role_key dà accesso completo al DB; resta solo in
-- fammy_private.config che è inaccessibile da auth client. La rimozione
-- delle politiche di default (revoke all) garantisce che solo postgres
-- (service_role) e SECURITY DEFINER possano leggerla.
