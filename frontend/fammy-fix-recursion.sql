-- =====================================================================
--  FAMMY - Fix infinite recursion nelle RLS policy
-- ---------------------------------------------------------------------
--  La precedente policy "tasks_read" interrogava task_assignees, e
--  task_assignees a sua volta interrogava tasks → infinite recursion.
--  Soluzione: usare funzioni SECURITY DEFINER che bypassano RLS.
--
--  Da eseguire UNA VOLTA su Supabase. Sostituisce solo le policy.
-- =====================================================================

-- 1. Helper: l'utente corrente è assegnatario di questo task?
create or replace function is_task_assignee(t_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = t_id and m.user_id = auth.uid()
  );
$$;

-- 2. Helper: l'utente corrente è membro di questa famiglia O assegnatario
--    di un task in essa?
create or replace function can_see_family_members(fam_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.family_id = fam_id and m.user_id = auth.uid())
      or exists (
        select 1 from tasks t
        join task_assignees ta on ta.task_id = t.id
        join members m on m.id = ta.member_id
        where t.family_id = fam_id and m.user_id = auth.uid()
      );
$$;

-- 3. Helper: l'utente corrente vede questa famiglia?
create or replace function can_see_family(fam_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.family_id = fam_id and m.user_id = auth.uid())
      or exists (select 1 from families f where f.id = fam_id and f.created_by = auth.uid())
      or exists (
        select 1 from tasks t
        join task_assignees ta on ta.task_id = t.id
        join members m on m.id = ta.member_id
        where t.family_id = fam_id and m.user_id = auth.uid()
      );
$$;

grant execute on function is_task_assignee(uuid) to authenticated;
grant execute on function can_see_family_members(uuid) to authenticated;
grant execute on function can_see_family(uuid) to authenticated;


-- 4. Sostituisci le policy in loop con quelle che usano gli helper

drop policy if exists "tasks_read"   on tasks;
drop policy if exists "tasks_update" on tasks;

create policy "tasks_read" on tasks for select using (
  is_family_member(family_id) or is_task_assignee(id)
);

create policy "tasks_update" on tasks for update
  using (is_family_member(family_id) or is_task_assignee(id))
  with check (is_family_member(family_id) or is_task_assignee(id));

drop policy if exists "members_read" on members;
create policy "members_read" on members for select using (
  is_family_member(family_id) or can_see_family_members(family_id)
);

drop policy if exists "families_read" on families;
create policy "families_read" on families for select using (
  can_see_family(id)
);
