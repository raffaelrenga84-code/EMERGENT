-- ============================================================================
-- FAMMY — Family + Members Photo Upload (allargamento policy)
--
-- Idempotente. Concede a TUTTI i membri (non solo al creator) di:
--   • Modificare nome, emoji, photo_url della famiglia
--   • Modificare campi cosmetici del proprio member record
--   • Caricare/cancellare foto nel bucket 'family-photos'
--   • Caricare/cancellare foto nel bucket 'member-avatars'
--
-- Non tocca le restrizioni di sicurezza:
--   • L'eliminazione della famiglia resta solo del creator
--   • La rimozione di altri member resta solo del creator
-- ============================================================================

-- 1) FAMILY UPDATE — tutti i membri (non solo il creator)
drop policy if exists "Update family if member" on public.families;
create policy "Update family if member"
  on public.families for update
  to authenticated
  using (
    -- Sono il creator OPPURE sono membro di questa famiglia
    created_by = auth.uid()
    or exists (
      select 1 from public.members m
      where m.family_id = families.id and m.user_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.members m
      where m.family_id = families.id and m.user_id = auth.uid()
    )
  );

-- 2) BUCKET family-photos — tutti i membri possono uploadare/cancellare
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

drop policy if exists "Family members can upload family photo" on storage.objects;
drop policy if exists "Family members can delete family photo" on storage.objects;
drop policy if exists "Anyone can read family photo" on storage.objects;

create policy "Anyone can read family photo"
  on storage.objects for select
  using (bucket_id = 'family-photos');

create policy "Family members can upload family photo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'family-photos');

create policy "Family members can update family photo"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'family-photos')
  with check (bucket_id = 'family-photos');

create policy "Family members can delete family photo"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'family-photos');


-- 3) MEMBER AVATARS — bucket per le foto profilo individuali
alter table public.members add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('member-avatars', 'member-avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can read member avatar" on storage.objects;
drop policy if exists "Members can upload member avatar" on storage.objects;
drop policy if exists "Members can update member avatar" on storage.objects;
drop policy if exists "Members can delete member avatar" on storage.objects;

create policy "Anyone can read member avatar"
  on storage.objects for select
  using (bucket_id = 'member-avatars');

create policy "Members can upload member avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'member-avatars');

create policy "Members can update member avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'member-avatars')
  with check (bucket_id = 'member-avatars');

create policy "Members can delete member avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'member-avatars');


-- 4) MEMBERS — tutti possono modificare i propri dati cosmetici;
--    il creator della famiglia può modificare quelli degli altri.
drop policy if exists "Update own member or as family creator" on public.members;
create policy "Update own member or as family creator"
  on public.members for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  );

-- ============================================================================
-- DONE.
-- ============================================================================
