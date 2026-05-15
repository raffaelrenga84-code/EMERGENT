-- =====================================================================
--  FAMMY - Permetti assegnazione task cross-famiglia
-- ---------------------------------------------------------------------
--  Aggiorna la policy RLS di tasks per consentire la visibilità a
--  utenti che NON sono membri della famiglia del task ma che sono
--  stati assegnati al task tramite task_assignees.
--
--  Caso d'uso: Raffael (famiglia Renga) crea un task "andare a prendere
--  nipote a scuola" e lo assegna sia ai nonni di Renga sia ai nonni di
--  Munegato. Anche i nonni Munegato devono vedere quel task nella loro
--  bacheca, anche se appartiene a Renga.
-- =====================================================================

-- 1. Aggiorna policy READ su tasks: includi gli assegnatari
drop policy if exists "tasks_read" on tasks;

create policy "tasks_read" on tasks for select using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = tasks.id and m.user_id = auth.uid()
  )
);

-- 2. Anche gli assegnatari di altre famiglie devono poter scrivere
--    commenti, marcare fatto, ecc. Ma NON modificare il titolo.
--    Per semplicità: chi è assegnato può fare update di status.
--    (Modifica avanzata: ristretta ai membri della famiglia origine.)
drop policy if exists "tasks_write" on tasks;

-- Per ora: chi è membro della famiglia OR assegnato può fare update.
-- Vincolo più stretto: solo author/membri famiglia per modifiche
-- avanzate verrà aggiunto in una versione futura.
create policy "tasks_update" on tasks for update using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = tasks.id and m.user_id = auth.uid()
  )
);

create policy "tasks_insert" on tasks for insert with check (
  is_family_member(family_id)
);

create policy "tasks_delete" on tasks for delete using (
  is_family_member(family_id)
);

-- 3. Permetti agli assegnatari cross-famiglia di leggere i membri
--    della famiglia origine del task (per vedere chi sono gli altri
--    assegnatari nelle UI). Esistente "members_read" usa is_family_member,
--    quindi serve estendere.
drop policy if exists "members_read" on members;

create policy "members_read" on members for select using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m_self on m_self.id = ta.member_id
    join tasks t on t.id = ta.task_id
    where t.family_id = members.family_id and m_self.user_id = auth.uid()
  )
);

-- 4. Stessa cosa per la lettura della famiglia
drop policy if exists "families_read" on families;

create policy "families_read" on families for select using (
  is_family_member(id)
  or created_by = auth.uid()
  or exists (
    select 1 from tasks t
    join task_assignees ta on ta.task_id = t.id
    join members m on m.id = ta.member_id
    where t.family_id = families.id and m.user_id = auth.uid()
  )
);
