-- =====================================================================
-- FAMMY — Sezione Persone Assistite (Fase 1: Medicine + Reminders)
-- =====================================================================
-- Aggiunge:
--   1. `members.is_assisted`: toggle per marcare un membro come "assistito"
--      (anziano, bambino, persona con esigenze speciali). Sblocca sezioni
--      mediche nel suo profilo.
--   2. `medications`: lista farmaci di un membro (nome, dose, orari)
--   3. `medication_logs`: registro presa medicine (per ogni reminder)
--
-- Privacy: tutti i membri della stessa famiglia possono vedere e gestire
-- le medicine (come da scelta utente, modalità "2a"). Le RLS limitano
-- l'accesso ai membri della stessa famiglia tramite il `member_id`.
--
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run. Idempotente.

-- ============ 1) is_assisted sui members ============
alter table public.members
  add column if not exists is_assisted boolean not null default false;

-- ============ 2) Tabella medications ============
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name varchar not null,
  dose varchar,                          -- es. "5 mg" o "1 pastiglia"
  notes text,
  -- Array di orari giornalieri "HH:MM" (es. ['08:00', '14:00', '20:00'])
  -- Per medicine "al bisogno", lascia [].
  times_of_day text[] not null default array[]::text[],
  -- Giorni della settimana attivi: 0=Domenica..6=Sabato. Vuoto = tutti.
  days_of_week int[] not null default array[]::int[],
  -- Start/end (per cure a tempo). Null = sempre.
  start_date date,
  end_date date,
  -- Posticipo richiesto dall'utente (in minuti) — usato dal reminder
  -- per offrire i pulsanti "Posticipa". Default 10/30/60.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.members(id) on delete set null
);

create index if not exists idx_medications_member_active
  on public.medications(member_id, active);

-- ============ 3) Tabella medication_logs ============
-- Ogni record = "questa dose è stata presa / saltata / posticipata".
create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  -- Quando la dose era programmata (timezone-aware UTC)
  scheduled_at timestamptz not null,
  -- Quando l'utente ha agito
  acted_at timestamptz not null default now(),
  action varchar not null check (action in ('taken', 'snoozed', 'skipped')),
  -- Se snoozed: nuovo orario; altrimenti null
  snoozed_until timestamptz,
  -- Chi ha registrato l'azione (può essere diverso da member_id:
  -- es. una figlia che marca la medicina per il padre anziano)
  recorded_by uuid references public.members(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_med_logs_member_date
  on public.medication_logs(member_id, scheduled_at desc);
create index if not exists idx_med_logs_med
  on public.medication_logs(medication_id);

-- ============ 4) RLS Policies ============
-- Tutti i membri della stessa famiglia possono SELECT/INSERT/UPDATE/DELETE
-- sulle medicine e sui log dei membri assistiti della loro famiglia.
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;

-- SELECT medications: chiunque della famiglia del member
drop policy if exists "med_select_same_family" on public.medications;
create policy "med_select_same_family"
  on public.medications for select
  to authenticated
  using (
    exists (
      select 1
      from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  );

-- INSERT/UPDATE/DELETE: idem
drop policy if exists "med_modify_same_family" on public.medications;
create policy "med_modify_same_family"
  on public.medications for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  );

-- Stesse policy per medication_logs
drop policy if exists "medlog_select_same_family" on public.medication_logs;
create policy "medlog_select_same_family"
  on public.medication_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  );

drop policy if exists "medlog_modify_same_family" on public.medication_logs;
create policy "medlog_modify_same_family"
  on public.medication_logs for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  );

-- Realtime: per i client riceve INSERT/UPDATE in tempo reale
do $$
begin
  begin alter publication supabase_realtime add table public.medications;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.medication_logs;
  exception when duplicate_object then null; end;
end$$;
