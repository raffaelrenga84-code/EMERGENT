-- =====================================================================
--  FAMMY — Hotfix RLS policy families + members (post-RESTORE)
-- ---------------------------------------------------------------------
--  Risolve l'errore "new row violates row-level security policy for
--  table families" quando crei una nuova famiglia.
--
--  Causa: la policy `families_insert` (e simili) esistevano SOLO nello
--  schema base `fammy-schema.sql` che ora è in _DANGEROUS_DO_NOT_RUN/.
--  I file RESTORE riscrivevano `families_read` ma non `families_insert`.
--
--  Esegui SOLO questo file. Idempotente.
-- =====================================================================

-- families ─────────────────────────────────────────────────────────────
drop policy if exists "families_insert" on public.families;
create policy "families_insert" on public.families
  for insert with check (created_by = auth.uid());

drop policy if exists "families_update" on public.families;
create policy "families_update" on public.families
  for update using (created_by = auth.uid());

drop policy if exists "families_delete" on public.families;
create policy "families_delete" on public.families
  for delete using (created_by = auth.uid());

-- members ──────────────────────────────────────────────────────────────
-- INSERT: il creatore della famiglia può aggiungere SE STESSO come primo
-- membro, oppure altri membri se è già membro della famiglia.
drop policy if exists "members_insert" on public.members;
create policy "members_insert" on public.members
  for insert with check (
    -- (a) Mi sto aggiungendo come primo membro a una famiglia che ho appena creato
    (user_id = auth.uid() and exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    ))
    OR
    -- (b) Sono già membro della famiglia → posso aggiungere altri membri
    exists (
      select 1 from public.members m2
      where m2.family_id = members.family_id and m2.user_id = auth.uid()
    )
    OR
    -- (c) Sono il proprietario della famiglia → posso aggiungere chiunque
    exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  );

-- profiles ─────────────────────────────────────────────────────────────
-- Già patched in fammy-profile-hotfix.sql, ma ribadiamo per sicurezza
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- FINE — adesso "Crea nuova famiglia" funziona di nuovo
