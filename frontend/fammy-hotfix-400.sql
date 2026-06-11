-- =====================================================================
--  FAMMY — HOTFIX errori HTTP 400 dopo il restore del database
--  Data: 2026-06
-- ---------------------------------------------------------------------
--  Risolve:
--   1) 400 su push_subscriptions  → manca la colonna last_used_at
--      + garantisce il vincolo UNIQUE(user_id, endpoint) per l'upsert
--   2) 400 su task_attachments    → manca la FK verso tasks(id)
--   3) 400 su event_attachments   → manca la FK verso events(id)
--  Idempotente: puoi eseguirlo più volte senza problemi.
--  Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PUSH_SUBSCRIPTIONS — colonne mancanti
-- ---------------------------------------------------------------------
alter table public.push_subscriptions
  add column if not exists last_used_at timestamptz not null default now();
alter table public.push_subscriptions
  add column if not exists user_agent text;
alter table public.push_subscriptions
  add column if not exists created_at timestamptz not null default now();

-- Vincolo UNIQUE (user_id, endpoint) — necessario per l'upsert on_conflict
do $$
declare
  has_uniq boolean;
begin
  select exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'push_subscriptions'
      and con.contype in ('u', 'p')
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = k
      ) = array['endpoint', 'user_id']
  ) into has_uniq;

  if not has_uniq then
    -- rimuovi eventuali duplicati (tieni la riga più recente)
    delete from public.push_subscriptions a
    using public.push_subscriptions b
    where a.user_id = b.user_id
      and a.endpoint = b.endpoint
      and a.ctid < b.ctid;

    alter table public.push_subscriptions
      add constraint push_subscriptions_user_endpoint_key
      unique (user_id, endpoint);
  end if;
end $$;

-- RLS: ognuno legge/scrive solo le proprie subscription
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subs_self_rw" on public.push_subscriptions;
create policy "push_subs_self_rw" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2) TASK_ATTACHMENTS — FK verso tasks(id)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where contype = 'f'
      and conrelid  = 'public.task_attachments'::regclass
      and confrelid = 'public.tasks'::regclass
  ) then
    -- elimina eventuali righe orfane (bloccherebbero la creazione della FK)
    delete from public.task_attachments ta
    where not exists (select 1 from public.tasks t where t.id = ta.task_id);

    alter table public.task_attachments
      add constraint task_attachments_task_id_fkey
      foreign key (task_id) references public.tasks(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) EVENT_ATTACHMENTS — FK verso events(id)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where contype = 'f'
      and conrelid  = 'public.event_attachments'::regclass
      and confrelid = 'public.events'::regclass
  ) then
    delete from public.event_attachments ea
    where not exists (select 1 from public.events e where e.id = ea.event_id);

    alter table public.event_attachments
      add constraint event_attachments_event_id_fkey
      foreign key (event_id) references public.events(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Ricarica la cache dello schema di PostgREST (subito effettivo)
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 5) VERIFICA — tutti i valori devono essere >= 1
-- ---------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'push_subscriptions'
      and column_name = 'last_used_at')                                  as col_last_used_at,
  (select count(*) from pg_constraint
    where contype in ('u','p')
      and conrelid = 'public.push_subscriptions'::regclass)              as uniq_push,
  (select count(*) from pg_constraint
    where contype = 'f'
      and conrelid  = 'public.task_attachments'::regclass
      and confrelid = 'public.tasks'::regclass)                          as fk_task_attachments,
  (select count(*) from pg_constraint
    where contype = 'f'
      and conrelid  = 'public.event_attachments'::regclass
      and confrelid = 'public.events'::regclass)                         as fk_event_attachments;
