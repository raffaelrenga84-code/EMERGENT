-- =====================================================================
--  FAMMY - Pagamenti parziali sulle quote spese
-- ---------------------------------------------------------------------
--  Estende `expense_shares` con `paid_amount` per supportare il caso
--  "ti devo 50€, oggi te ne do 10, fra una settimana altri 15…".
--  La share è considerata SALDATA quando paid_amount >= amount.
--
--  Per non perdere lo storico dei pagamenti parziali, la tabella
--  `expense_payments` registra ogni versamento (chi, quando, quanto)
--  e un trigger aggiorna automaticamente paid_amount + settled sulla
--  share corrispondente.
--
--  IDEMPOTENTE: può essere ri-eseguita senza errori.
-- =====================================================================

-- 1) Colonna paid_amount sulla share (default 0)
alter table expense_shares
  add column if not exists paid_amount numeric(10,2) not null default 0
    check (paid_amount >= 0);

-- 2) Tabella dei pagamenti parziali (storico)
create table if not exists expense_payments (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null,
  member_id    uuid not null,
  amount       numeric(10,2) not null check (amount > 0),
  note         text,
  paid_at      timestamptz not null default now(),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  -- FK composita sulla share (cascade se la share viene eliminata)
  constraint fk_expense_payments_share
    foreign key (expense_id, member_id)
    references expense_shares(expense_id, member_id)
    on delete cascade
);

create index if not exists idx_expense_payments_share
  on expense_payments(expense_id, member_id);
create index if not exists idx_expense_payments_paid_at
  on expense_payments(paid_at desc);

alter table expense_payments enable row level security;

drop policy if exists "expense_payments_rw" on expense_payments;
create policy "expense_payments_rw" on expense_payments for all
  using (exists (select 1 from expenses e
                  where e.id = expense_id
                    and is_family_member(e.family_id)))
  with check (exists (select 1 from expenses e
                       where e.id = expense_id
                         and is_family_member(e.family_id)));

-- 3) Trigger: dopo INSERT/DELETE su expense_payments aggiorna paid_amount
--    + settled sulla share corrispondente. La share è settled quando
--    paid_amount >= amount (tolleranza 1 centesimo per arrotondamenti).
create or replace function fammy_recalc_share_paid()
returns trigger language plpgsql as $$
declare
  v_expense_id uuid;
  v_member_id  uuid;
  v_total      numeric(10,2);
  v_amount     numeric(10,2);
begin
  v_expense_id := coalesce(new.expense_id, old.expense_id);
  v_member_id  := coalesce(new.member_id,  old.member_id);

  select coalesce(sum(amount), 0) into v_total
    from expense_payments
    where expense_id = v_expense_id and member_id = v_member_id;

  select amount into v_amount
    from expense_shares
    where expense_id = v_expense_id and member_id = v_member_id;

  if v_amount is null then
    return coalesce(new, old);
  end if;

  update expense_shares set
    paid_amount = v_total,
    settled     = (v_total + 0.01 >= v_amount),
    settled_at  = case when (v_total + 0.01 >= v_amount) then now() else null end
    where expense_id = v_expense_id and member_id = v_member_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalc_share_paid on expense_payments;
create trigger trg_recalc_share_paid
  after insert or delete or update on expense_payments
  for each row execute function fammy_recalc_share_paid();

-- 4) Backfill: imposta paid_amount = amount sulle share già settled,
--    così le card "saldate" pre-esistenti mostrano 100% nel progress.
update expense_shares
  set paid_amount = amount
  where settled = true and paid_amount = 0;
