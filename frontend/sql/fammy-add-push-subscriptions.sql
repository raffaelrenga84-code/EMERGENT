-- =====================================================================
--  FAMMY — Push notifications (Web Push API)
--  Data: 2026-05-10
-- ---------------------------------------------------------------------
--  Tabella per memorizzare gli endpoint Web Push degli utenti, così le
--  Edge Functions possono inviare notifiche anche ad app chiusa.
-- =====================================================================

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

-- RLS
alter table push_subscriptions enable row level security;

-- Ognuno legge/scrive solo i propri endpoint
drop policy if exists "push_subscriptions_own" on push_subscriptions;
create policy "push_subscriptions_own" on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
