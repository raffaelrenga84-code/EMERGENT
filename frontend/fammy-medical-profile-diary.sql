-- =====================================================================
-- FAMMY — Sezione Persone Assistite (Fase 2: Profilo medico + Diario)
-- =====================================================================
-- Aggiunge:
--   1. `medical_profiles` (1:1 con members) — gruppo sanguigno, allergie,
--      contatti emergenza, condizioni note, medico curante, allergie alimentari
--   2. `daily_diary` — note giornaliere (sonno, umore, appetito, eventi)
--   3. Edge function `medication-reminder-push` deployata SEPARATAMENTE
--      (vedi /app/frontend/supabase/_dashboard_standalone/medication-reminder-push.ts)
--
-- Privacy: medesime regole della Fase 1 (membri della stessa famiglia).
-- Idempotente.

-- ============ 1) Profilo medico (1:1 con members) ============
create table if not exists public.medical_profiles (
  member_id uuid primary key references public.members(id) on delete cascade,
  blood_type varchar,                    -- 'A+', 'B-', '0+', 'AB+'...
  allergies text[] not null default array[]::text[],
  food_intolerances text[] not null default array[]::text[],
  conditions text,                       -- testo libero: "Diabete tipo 2, ipertensione"
  emergency_contact_name varchar,        -- nome del contatto emergenza
  emergency_contact_phone varchar,       -- es. "+39 333..."
  emergency_contact_relation varchar,    -- "figlio", "moglie", "vicino"
  doctor_name varchar,
  doctor_phone varchar,
  health_card_number varchar,            -- tessera sanitaria
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id) on delete set null
);

-- Trigger updated_at
create or replace function public._touch_medical_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_medical_updated on public.medical_profiles;
create trigger trg_medical_updated
  before update on public.medical_profiles
  for each row execute function public._touch_medical_updated_at();

alter table public.medical_profiles enable row level security;

drop policy if exists "medical_select_same_family" on public.medical_profiles;
create policy "medical_select_same_family"
  on public.medical_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  );

drop policy if exists "medical_modify_same_family" on public.medical_profiles;
create policy "medical_modify_same_family"
  on public.medical_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  );

-- ============ 2) Diario giornaliero ============
-- Una riga per (member_id, date). Tracking opzionale di sonno, umore,
-- appetito + note libere. La famiglia può vedere e contribuire.
create table if not exists public.daily_diary (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  diary_date date not null,
  -- mood: 1-5 ★ (1 = pessimo, 5 = ottimo)
  mood smallint check (mood between 1 and 5),
  sleep_hours numeric(4, 1),             -- es. 7.5
  -- appetite: 1-3 (poco / normale / molto)
  appetite smallint check (appetite between 1 and 3),
  -- weight in kg (opzionale)
  weight_kg numeric(5, 1),
  notes text,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, diary_date)
);

create index if not exists idx_diary_member_date
  on public.daily_diary(member_id, diary_date desc);

drop trigger if exists trg_diary_updated on public.daily_diary;
create trigger trg_diary_updated
  before update on public.daily_diary
  for each row execute function public._touch_medical_updated_at();

alter table public.daily_diary enable row level security;

drop policy if exists "diary_select_same_family" on public.daily_diary;
create policy "diary_select_same_family"
  on public.daily_diary for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  );

drop policy if exists "diary_modify_same_family" on public.daily_diary;
create policy "diary_modify_same_family"
  on public.daily_diary for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  );

do $$
begin
  begin alter publication supabase_realtime add table public.medical_profiles;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.daily_diary;
  exception when duplicate_object then null; end;
end$$;
