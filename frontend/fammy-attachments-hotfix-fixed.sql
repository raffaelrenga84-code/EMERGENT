-- =====================================================================
--  FAMMY — Hotfix attachments unificato (FIXED)
-- ---------------------------------------------------------------------
--  Sostituisce `fammy-attachments-hotfix.sql` (versione precedente con
--  3 bug: `owner_user_id` non esiste, riferimenti a `name` ambigui, e
--  in alcuni vecchi DB la colonna `tasks.priority` non era ancora creata).
--
--  Esegui SOLO questo file su Supabase Dashboard → SQL Editor → Run.
--  È completamente idempotente: puoi rilanciarlo senza danni.
-- =====================================================================

-- =====================================================================
-- (1) task_attachments.uploaded_by — fix colonna mancante
-- =====================================================================
alter table public.task_attachments
  add column if not exists uploaded_by uuid references public.members(id) on delete set null;

create index if not exists idx_task_attachments_uploaded_by
  on public.task_attachments(uploaded_by);

-- =====================================================================
-- (2) tasks.priority — assicura la colonna (per DB più vecchi)
-- =====================================================================
alter table public.tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal','medium','high'));

-- Allinea i task urgent=true che non hanno ancora la priorità "high"
update public.tasks set priority = 'high' where urgent = true and priority = 'normal';

-- =====================================================================
-- (3) care_attachments — tabella + RLS
-- =====================================================================
-- Bucket di storage
insert into storage.buckets (id, name, public)
select 'care-attachments', 'care-attachments', false
where not exists (select 1 from storage.buckets where id = 'care-attachments');

-- Tabella
create table if not exists public.care_attachments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  kind         text not null check (kind in ('medical_profile','medication','log','diary')),
  parent_id    uuid,
  file_path    text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_care_attachments_member on public.care_attachments(member_id);
create index if not exists idx_care_attachments_parent on public.care_attachments(kind, parent_id);

alter table public.care_attachments enable row level security;

-- SELECT
drop policy if exists "care_attachments same family read" on public.care_attachments;
create policy "care_attachments same family read"
  on public.care_attachments for select
  using (
    exists (
      select 1 from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- INSERT
drop policy if exists "care_attachments same family insert" on public.care_attachments;
create policy "care_attachments same family insert"
  on public.care_attachments for insert
  with check (
    exists (
      select 1 from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- DELETE: uploader o owner della famiglia (NB: la colonna è `created_by`)
drop policy if exists "care_attachments uploader or owner manage" on public.care_attachments;
create policy "care_attachments uploader or owner manage"
  on public.care_attachments for delete
  using (
    exists (
      select 1 from public.members m_me
      where m_me.id = care_attachments.uploaded_by
        and m_me.user_id = auth.uid()
    )
    OR
    exists (
      select 1 from public.members m_target
      join public.families f on f.id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and f.created_by = auth.uid()
    )
  );

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.care_attachments;
  exception when others then null;
  end;
end$$;

-- =====================================================================
-- (4) storage.objects RLS per il bucket care-attachments
--     NB: `name` (la colonna file path di storage.objects) deve essere
--     SEMPRE qualificata come `storage.objects.name`, altrimenti la
--     PostgreSQL la confonde con `members.name` o `care_attachments.file_name`
--     nei JOIN delle subquery → errore "column reference name is ambiguous".
-- =====================================================================
drop policy if exists "care-attachments read same family" on storage.objects;
create policy "care-attachments read same family"
  on storage.objects for select
  using (
    bucket_id = 'care-attachments' AND (
      exists (
        select 1 from public.members m_target
        join public.members m_me on m_me.family_id = m_target.family_id
        where m_target.id::text = (storage.foldername(storage.objects.name))[2]
          and m_me.user_id = auth.uid()
      )
    )
  );

drop policy if exists "care-attachments write same family" on storage.objects;
create policy "care-attachments write same family"
  on storage.objects for insert
  with check (
    bucket_id = 'care-attachments' AND (
      exists (
        select 1 from public.members m_target
        join public.members m_me on m_me.family_id = m_target.family_id
        where m_target.id::text = (storage.foldername(storage.objects.name))[2]
          and m_me.user_id = auth.uid()
      )
    )
  );

drop policy if exists "care-attachments delete uploader or owner" on storage.objects;
create policy "care-attachments delete uploader or owner"
  on storage.objects for delete
  using (
    bucket_id = 'care-attachments' AND (
      -- Uploader: chi ha registrato l'attachment può cancellare anche il file
      exists (
        select 1 from public.care_attachments ca
        join public.members m_me on m_me.id = ca.uploaded_by
        where ca.file_path = storage.objects.name
          and m_me.user_id = auth.uid()
      )
      OR
      -- Owner famiglia (colonna: `created_by`, NON `owner_user_id`)
      exists (
        select 1 from public.care_attachments ca
        join public.members m_target on m_target.id = ca.member_id
        join public.families f on f.id = m_target.family_id
        where ca.file_path = storage.objects.name
          and f.created_by = auth.uid()
      )
    )
  );

-- =====================================================================
-- FINE — dopo aver eseguito questo file:
--   ✅ Niente più "uploaded_by column not found"
--   ✅ Niente più "care_attachments table not found"
--   ✅ Niente più "owner_user_id does not exist"
--   ✅ Niente più "name is ambiguous"
--   ✅ Niente più "priority column does not exist"
-- =====================================================================
