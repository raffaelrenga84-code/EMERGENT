-- =====================================================================
-- FAMMY — Foto famiglia (al posto/oltre emoji)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente.

-- 1) Colonna photo_url su families (path del file nel bucket)
alter table public.families add column if not exists photo_url text;

-- 2) Bucket pubblico per le copertine famiglia
-- Pubblico = niente signed URL, le copertine sono ok-da-vedere (nessun
-- dato sensibile). I path includono comunque il family_id.
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

-- Policies: solo i membri possono caricare/eliminare, lettura aperta (bucket public)
drop policy if exists "Family members can upload family photo" on storage.objects;
drop policy if exists "Family members can delete family photo" on storage.objects;

create policy "Family members can upload family photo"
  on storage.objects for insert
  with check (
    bucket_id = 'family-photos' and auth.role() = 'authenticated'
  );

create policy "Family members can delete family photo"
  on storage.objects for delete
  using (
    bucket_id = 'family-photos' and auth.role() = 'authenticated'
  );
