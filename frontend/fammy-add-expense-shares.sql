-- =====================================================================
--  FAMMY - Spese con split / rimborso
-- ---------------------------------------------------------------------
--  Una spesa può essere divisa in N "quote" tra i membri della famiglia
--  (o cross-famiglia). Ogni quota dice quanto un membro deve a chi ha
--  pagato. Quando rimborsa, la quota viene marcata "settled".
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

create table if not exists expense_shares (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id)  on delete cascade,
  amount      numeric(10,2) not null check (amount >= 0),
  settled     boolean not null default false,
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  primary key (expense_id, member_id)
);

create index if not exists idx_expense_shares_expense on expense_shares(expense_id);
create index if not exists idx_expense_shares_member  on expense_shares(member_id);

alter table expense_shares enable row level security;

drop policy if exists "expense_shares_rw" on expense_shares;
create policy "expense_shares_rw" on expense_shares for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_family_member(e.family_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_family_member(e.family_id)));
