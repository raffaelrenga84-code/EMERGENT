-- =====================================================================
--  FAMMY — Subtask / Checklist sui task
-- ---------------------------------------------------------------------
--  Tabella `task_subtasks` per supportare checklist all'interno di un
--  task (es. "lista spesa", "preparare bagaglio").
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

create table if not exists public.task_subtasks (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  text          text not null,
  done          boolean not null default false,
  order_index   int not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.members(id) on delete set null,
  -- snapshot del nome di chi completa (sopravvive a rimozione del membro)
  completed_by_name text
);

create index if not exists idx_task_subtasks_task on public.task_subtasks(task_id, order_index);

-- RLS: stessa logica dei task_responses
alter table public.task_subtasks enable row level security;

drop policy if exists "task_subtasks_rw" on public.task_subtasks;
create policy "task_subtasks_rw" on public.task_subtasks for all
  using (exists (
    select 1 from public.tasks t
    where t.id = task_subtasks.task_id and (
      is_family_member(t.family_id)
      or exists (
        select 1 from public.task_assignees ta
        join public.members m on m.id = ta.member_id
        where ta.task_id = t.id and m.user_id = auth.uid()
      )
    )
  ))
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_subtasks.task_id and (
      is_family_member(t.family_id)
      or exists (
        select 1 from public.task_assignees ta
        join public.members m on m.id = ta.member_id
        where ta.task_id = t.id and m.user_id = auth.uid()
      )
    )
  ));

-- Realtime: utile per vedere i tick degli altri membri in tempo reale
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_subtasks;
  exception when others then null;
  end;
end$$;

-- Trigger snapshot completed_by_name (come per task_responses author_name)
create or replace function public.fammy_snapshot_subtask_completer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare m record;
begin
  -- Solo quando done diventa true e c'è completed_by
  if new.done is true and new.completed_by is not null and new.completed_by_name is null then
    select name into m from public.members where id = new.completed_by;
    if found then
      new.completed_by_name := m.name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fammy_snapshot_subtask on public.task_subtasks;
create trigger trg_fammy_snapshot_subtask
  before insert or update on public.task_subtasks
  for each row execute function public.fammy_snapshot_subtask_completer();
