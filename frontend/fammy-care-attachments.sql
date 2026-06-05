-- ============================================================
-- FAMMY · Care Hub Attachments (foto + file)
-- ============================================================
-- Estensione del Care Hub per permettere di allegare:
--   • Documenti al profilo medico (referti, esami, ricette)
--   • Foto alle medicine (confezione, bugiardino)
--   • Foto/file alle entry del diario giornaliero
--
-- Privacy: stessa RLS dei meds → tutti i membri della famiglia
-- dell'assistito possono vedere/aggiungere; nessun outsider.
-- ============================================================

-- 1) Bucket storage pubblico per i file (link diretti)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'care-attachments',
  'care-attachments',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Tabella metadati
create table if not exists public.care_attachments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  -- Tipo del parent: 'profile' (profilo medico), 'medication' (medicina), 'diary' (entry diario)
  kind text not null check (kind in ('profile', 'medication', 'diary')),
  -- ID del parent (medication_id o diary_id). NULL per 'profile' (1:N con member).
  parent_id uuid,
  -- Nome originale del file
  file_name text not null,
  -- Path nello storage bucket
  file_path text not null,
  -- MIME type
  mime_type text,
  -- Dimensione in bytes
  file_size bigint,
  -- Note descrittive opzionali (es. "Esami del sangue 5 giu 2026")
  note text,
  uploaded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_care_attachments_member on public.care_attachments(member_id);
create index if not exists idx_care_attachments_parent on public.care_attachments(kind, parent_id);

-- 3) RLS
alter table public.care_attachments enable row level security;

-- Tutti i membri della stessa famiglia possono leggere / scrivere / cancellare
drop policy if exists "care_attachments same family read" on public.care_attachments;
create policy "care_attachments same family read"
  on public.care_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

drop policy if exists "care_attachments same family insert" on public.care_attachments;
create policy "care_attachments same family insert"
  on public.care_attachments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

drop policy if exists "care_attachments same family delete" on public.care_attachments;
create policy "care_attachments same family delete"
  on public.care_attachments for delete
  to authenticated
  using (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- 4) RLS sullo storage bucket
-- Lettura pubblica (il bucket è pubblico, link diretti funzionano)
drop policy if exists "care-attachments public read" on storage.objects;
create policy "care-attachments public read"
  on storage.objects for select
  to public
  using (bucket_id = 'care-attachments');

-- Upload solo da utenti autenticati
drop policy if exists "care-attachments authenticated upload" on storage.objects;
create policy "care-attachments authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'care-attachments');

-- Delete solo da utenti autenticati (il DB-level RLS protegge il record)
drop policy if exists "care-attachments authenticated delete" on storage.objects;
create policy "care-attachments authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'care-attachments');

-- 5) Aggiungi al realtime publication (opzionale, per refresh live)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'care_attachments'
  ) then
    alter publication supabase_realtime add table public.care_attachments;
  end if;
end$$;
