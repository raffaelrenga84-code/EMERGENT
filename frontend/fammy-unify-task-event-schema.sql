-- =====================================================================
-- FAMMY — Unifica i campi tra task ed eventi (per le nuove modali)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente — colonne e tabelle vengono create solo se mancanti.

-- 1) TASKS: aggiungi ORA (HH:MM) e LUOGO opzionali
alter table public.tasks add column if not exists due_time text;
alter table public.tasks add column if not exists location text;

-- 2) EVENT_ASSIGNEES — mirror di task_assignees, gli eventi ora supportano
--    "assegnato a" (chi partecipa). Composite PK previene duplicati.
create table if not exists public.event_assignees (
  event_id  uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists idx_event_assignees_event on public.event_assignees(event_id);
create index if not exists idx_event_assignees_member on public.event_assignees(member_id);

alter table public.event_assignees enable row level security;

drop policy if exists "event_assignees_rw" on public.event_assignees;
create policy "event_assignees_rw" on public.event_assignees
for all using (
  exists (
    select 1 from public.events ev
    join public.members me on me.family_id = ev.family_id
    where ev.id = event_assignees.event_id
      and me.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.events ev
    join public.members me on me.family_id = ev.family_id
    where ev.id = event_assignees.event_id
      and me.user_id = auth.uid()
  )
);

-- 3) EVENT_ATTACHMENTS — mirror di task_attachments per le foto degli eventi
create table if not exists public.event_attachments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_path varchar not null,
  file_name varchar not null,
  created_at timestamptz not null default now()
);

alter table public.event_attachments enable row level security;
create index if not exists idx_event_attachments_event on public.event_attachments(event_id);

drop policy if exists "Users can view event attachments in their families" on public.event_attachments;
drop policy if exists "Users can insert event attachments in their families" on public.event_attachments;
drop policy if exists "Users can delete event attachments in their families" on public.event_attachments;

create policy "Users can view event attachments in their families"
  on public.event_attachments for select
  using (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

create policy "Users can insert event attachments in their families"
  on public.event_attachments for insert
  with check (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

create policy "Users can delete event attachments in their families"
  on public.event_attachments for delete
  using (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

-- 4) STORAGE BUCKET per le foto degli eventi
insert into storage.buckets (id, name, public)
values ('event-attachments', 'event-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload event attachments" on storage.objects;
drop policy if exists "Users can view event attachments" on storage.objects;
drop policy if exists "Users can delete event attachments" on storage.objects;

create policy "Users can upload event attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'event-attachments' and auth.role() = 'authenticated'
  );

create policy "Users can view event attachments"
  on storage.objects for select
  using (
    bucket_id = 'event-attachments' and exists (
      select 1 from public.event_attachments ea
      join public.events e on ea.event_id = e.id
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and ea.file_path = storage.objects.name
    )
  );

create policy "Users can delete event attachments"
  on storage.objects for delete
  using (
    bucket_id = 'event-attachments' and exists (
      select 1 from public.event_attachments ea
      join public.events e on ea.event_id = e.id
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and ea.file_path = storage.objects.name
    )
  );

-- 5) Realtime: aggiungi le nuove tabelle alla publication (idempotente)
do $$
begin
  begin
    alter publication supabase_realtime add table public.event_assignees;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.event_attachments;
  exception when duplicate_object then null;
  end;
end$$;
