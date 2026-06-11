-- =====================================================================
--  FAMMY — Hotfix attachments (task + care)
-- ---------------------------------------------------------------------
--  Risolve 2 errori:
--   1) `Could not find the 'uploaded_by' column of 'task_attachments'`
--      → la tabella `task_attachments` esiste da uno schema vecchio
--        ma non ha la colonna `uploaded_by`. La aggiungiamo qui (idempotente).
--   2) `Could not find the table 'public.care_attachments' in the schema cache`
--      → la tabella non era mai stata creata. La creiamo qui (copia di
--        `fammy-care-attachments.sql`, ma idempotente).
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- =====================================================================
-- (1) task_attachments.uploaded_by — fix colonna mancante
-- =====================================================================
alter table public.task_attachments
  add column if not exists uploaded_by uuid references public.members(id) on delete set null;

create index if not exists idx_task_attachments_uploaded_by
  on public.task_attachments(uploaded_by);

-- =====================================================================
-- (2) care_attachments — tabella + RLS + storage bucket policies
-- =====================================================================
-- Bucket di storage (se manca)
insert into storage.buckets (id, name, public)
select 'care-attachments', 'care-attachments', false
where not exists (select 1 from storage.buckets where id = 'care-attachments');

-- Tabella
create table if not exists public.care_attachments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  -- "kind" identifica cosa l'allegato sta documentando:
  --   'medical_profile' → al profilo medico generale del membro
  --   'medication'      → a una medicina specifica (parent_id = medications.id)
  --   'log'             → a un log/entry di diario (parent_id = care_log.id)
  --   'diary'           → al diario in generale
  kind         text not null check (kind in ('medical_profile','medication','log','diary')),
  parent_id    uuid,  -- nullable: usato solo per kind in (medication, log)
  file_path    text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_care_attachments_member on public.care_attachments(member_id);
create index if not exists idx_care_attachments_parent on public.care_attachments(kind, parent_id);

-- RLS
alter table public.care_attachments enable row level security;

-- SELECT: chiunque sia nella stessa famiglia del member_id
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

-- INSERT: idem
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

-- UPDATE / DELETE: solo chi ha caricato OPPURE owner della famiglia
drop policy if exists "care_attachments uploader or owner manage" on public.care_attachments;
create policy "care_attachments uploader or owner manage"
  on public.care_attachments for delete
  using (
    -- uploader stesso
    exists (
      select 1 from public.members m_me
      where m_me.id = care_attachments.uploaded_by
        and m_me.user_id = auth.uid()
    )
    OR
    -- creatore della famiglia (owner)
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

-- Storage RLS per il bucket care-attachments
drop policy if exists "care-attachments read same family" on storage.objects;
create policy "care-attachments read same family"
  on storage.objects for select
  using (
    bucket_id = 'care-attachments' AND (
      -- Il path è: care/<member_id>/<filename>. Estraiamo il member_id
      -- dal secondo segmento e verifichiamo che chi legge sia in famiglia.
      exists (
        select 1 from public.members m_target
        join public.members m_me on m_me.family_id = m_target.family_id
        where m_target.id::text = (storage.foldername(name))[2]
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
        where m_target.id::text = (storage.foldername(name))[2]
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
        where ca.file_path = name and m_me.user_id = auth.uid()
      )
      OR
      -- Owner famiglia
      exists (
        select 1 from public.care_attachments ca
        join public.members m_target on m_target.id = ca.member_id
        join public.families f on f.id = m_target.family_id
        where ca.file_path = name and f.owner_user_id = auth.uid()
      )
    )
  );
