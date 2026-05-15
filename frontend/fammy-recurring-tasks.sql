-- =====================================================================
--  FAMMY - Task ricorrenti (settimanali)
-- ---------------------------------------------------------------------
--  Aggiunge recurring_days + recurring_until a tasks (come per events).
--  Aggiunge task_completions: per ogni "istanza" di task ricorrente
--  segnata come fatta, c'è una riga.
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

alter table tasks add column if not exists recurring_days  int[];
alter table tasks add column if not exists recurring_until date;

create table if not exists task_completions (
  task_id          uuid not null references tasks(id) on delete cascade,
  occurrence_date  date not null,
  completed_at     timestamptz not null default now(),
  completed_by     uuid references members(id) on delete set null,
  primary key (task_id, occurrence_date)
);

create index if not exists idx_task_completions_task on task_completions(task_id);

alter table task_completions enable row level security;

drop policy if exists "task_completions_rw" on task_completions;
create policy "task_completions_rw" on task_completions for all
  using (exists (select 1 from tasks t where t.id = task_id and (
    is_family_member(t.family_id)
    or exists (select 1 from task_assignees ta join members m on m.id = ta.member_id
               where ta.task_id = t.id and m.user_id = auth.uid())
  )))
  with check (exists (select 1 from tasks t where t.id = task_id and (
    is_family_member(t.family_id)
    or exists (select 1 from task_assignees ta join members m on m.id = ta.member_id
               where ta.task_id = t.id and m.user_id = auth.uid())
  )));
