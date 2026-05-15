-- =====================================================================
--  FAMMY - Multi-assegnatari + eventi ricorrenti
-- ---------------------------------------------------------------------
--  1. Aggiunge tabella task_assignees (un task può avere più persone)
--  2. Aggiunge recurring_days a events (giorni della settimana 0..6)
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

-- 1. Multi-assegnatari ----------------------------------------------------

create table if not exists task_assignees (
  task_id    uuid not null references tasks(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index if not exists idx_task_assignees_task   on task_assignees(task_id);
create index if not exists idx_task_assignees_member on task_assignees(member_id);

-- Migra le assegnazioni esistenti (single -> join table)
insert into task_assignees (task_id, member_id)
  select id, assigned_to from tasks where assigned_to is not null
  on conflict do nothing;

-- RLS
alter table task_assignees enable row level security;

drop policy if exists "task_assignees_rw" on task_assignees;
create policy "task_assignees_rw" on task_assignees for all
  using (exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id)));


-- 2. Eventi ricorrenti ---------------------------------------------------
-- recurring_days: array int[] con i giorni della settimana
--   0=Lunedì, 1=Martedì, ..., 6=Domenica
--   NULL o array vuoto = evento non ricorrente

alter table events
  add column if not exists recurring_days int[];

alter table events
  add column if not exists recurring_until date;
-- recurring_until: data fino a cui ripetere (NULL = nessun limite, default 1 anno)
