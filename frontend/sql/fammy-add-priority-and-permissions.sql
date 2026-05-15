-- =====================================================================
--  FAMMY — Aggiunta priorità task + permessi creator-only delete
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Modifiche:
--   1. Aggiunge colonna `priority` ai task (low / normal / high)
--   2. Aggiunge colonna `created_by` alle expenses (chi ha creato la spesa)
--   3. Aggiorna RLS: solo il creatore può eliminare task / event / expense
-- =====================================================================

-- 1. PRIORITÀ TASK -----------------------------------------------------
-- Semaforo: normal = verde (default), medium = arancio, high = rosso
alter table tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal','medium','high'));

-- Per i task urgenti esistenti, segnali alta priorità
update tasks set priority = 'high' where urgent = true and priority = 'normal';

-- 2. CREATORE SPESA ----------------------------------------------------
alter table expenses
  add column if not exists created_by uuid references members(id) on delete set null;

-- Per spese esistenti che non hanno il creatore, usa paid_by come fallback
update expenses set created_by = paid_by where created_by is null;


-- 3. RLS — DELETE solo per il creatore --------------------------------

-- TASKS
-- La policy esistente "tasks_write" è FOR ALL → la sostituiamo con
-- 4 policy separate (select/insert/update permissive, delete ristretto)
drop policy if exists "tasks_write"  on tasks;
drop policy if exists "tasks_read"   on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_insert" on tasks;
drop policy if exists "tasks_update" on tasks;
drop policy if exists "tasks_delete" on tasks;

create policy "tasks_select" on tasks for select
  using (is_family_member(family_id));

create policy "tasks_insert" on tasks for insert
  with check (is_family_member(family_id));

create policy "tasks_update" on tasks for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- DELETE: solo il creatore (author_id = mio member.id) o se author_id è null
create policy "tasks_delete" on tasks for delete
  using (
    is_family_member(family_id)
    and (
      author_id is null
      or author_id in (select id from members where user_id = auth.uid())
    )
  );


-- EVENTS
drop policy if exists "events_rw"     on events;
drop policy if exists "events_select" on events;
drop policy if exists "events_insert" on events;
drop policy if exists "events_update" on events;
drop policy if exists "events_delete" on events;

create policy "events_select" on events for select
  using (is_family_member(family_id));

create policy "events_insert" on events for insert
  with check (is_family_member(family_id));

create policy "events_update" on events for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

create policy "events_delete" on events for delete
  using (
    is_family_member(family_id)
    and (
      created_by is null
      or created_by in (select id from members where user_id = auth.uid())
    )
  );


-- EXPENSES
drop policy if exists "expenses_rw"     on expenses;
drop policy if exists "expenses_select" on expenses;
drop policy if exists "expenses_insert" on expenses;
drop policy if exists "expenses_update" on expenses;
drop policy if exists "expenses_delete" on expenses;

create policy "expenses_select" on expenses for select
  using (is_family_member(family_id));

create policy "expenses_insert" on expenses for insert
  with check (is_family_member(family_id));

create policy "expenses_update" on expenses for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

create policy "expenses_delete" on expenses for delete
  using (
    is_family_member(family_id)
    and (
      created_by is null
      or created_by in (select id from members where user_id = auth.uid())
    )
  );

-- =====================================================================
-- FINE
-- =====================================================================
