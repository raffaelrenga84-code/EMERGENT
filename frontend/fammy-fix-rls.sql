-- =====================================================================
--  FAMMY - Fix policy RLS sui membri
-- ---------------------------------------------------------------------
--  Risolve l'errore:
--  "new row violates row-level security policy for table members"
--  che si verifica quando il creatore di una famiglia tenta di
--  inserire se stesso come primo membro.
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
--  Non è distruttivo: non tocca i dati, sostituisce solo le regole.
-- =====================================================================

-- Rimuovi la policy generica "for all" che è troppo restrittiva sull'INSERT
drop policy if exists "members_write" on members;

-- Policy separate per insert/update/delete

-- INSERT: consentito se sei già membro della famiglia
-- OPPURE se sei il creatore della famiglia (caso del primo membro)
create policy "members_insert" on members for insert with check (
  is_family_member(family_id)
  or exists (
    select 1 from families f
    where f.id = family_id and f.created_by = auth.uid()
  )
);

-- UPDATE: solo membri esistenti possono modificare
create policy "members_update" on members for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- DELETE: solo membri esistenti possono cancellare
create policy "members_delete" on members for delete
  using (is_family_member(family_id));
