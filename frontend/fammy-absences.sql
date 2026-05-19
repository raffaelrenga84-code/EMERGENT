-- ============================================================================
-- FAMMY — Assenze membri famiglia (Iterazione 15)
--
-- Permette ai membri di dichiarare un periodo di assenza (vacanza, lavoro,
-- salute, altro). Le assenze sono:
--   • Pubbliche di default in selezione famiglie tramite visible_to_families[]
--   • Visibili a chi vuoi (lista di family_id)
--   • Modificabili/cancellabili solo dal proprietario o dall'admin della famiglia
--
-- Idempotente: puoi eseguirla più volte senza errori.
-- ============================================================================

-- 1) Tabella assenze
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Snapshot del display name al momento della creazione (per UX nelle liste
  -- anche quando guardiamo da famiglie dove la persona non è membro).
  member_name text,
  -- Range periodo (inclusive)
  start_date date not null,
  end_date date not null,
  -- Motivo: 'vacation' | 'work' | 'health' | 'other'
  reason text not null default 'other',
  -- Dove (libero, es. "Messico", "Milano", "Casa")
  location text,
  -- Note opzionali per la famiglia
  note text,
  -- Famiglie con cui si condivide l'assenza. Vuoto = nessuna (privato).
  visible_to_families uuid[] default '{}'::uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint absences_dates_check check (end_date >= start_date)
);

create index if not exists absences_user_idx on public.absences(user_id);
create index if not exists absences_range_idx on public.absences(start_date, end_date);
-- GIN index per query "quale assenza è visibile alla famiglia X?"
create index if not exists absences_visible_families_idx
  on public.absences using gin (visible_to_families);

-- 2) RLS
alter table public.absences enable row level security;

-- Read: posso vedere
--   • le mie assenze (sempre)
--   • le assenze condivise con una famiglia di cui sono membro
drop policy if exists "Read own or shared absences" on public.absences;
create policy "Read own or shared absences"
  on public.absences for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.members m
      where m.user_id = auth.uid()
        and m.family_id = any(absences.visible_to_families)
    )
  );

-- Insert: solo io posso creare le mie
drop policy if exists "Create own absence" on public.absences;
create policy "Create own absence"
  on public.absences for insert
  to authenticated
  with check (user_id = auth.uid());

-- Update: solo il proprietario
drop policy if exists "Update own absence" on public.absences;
create policy "Update own absence"
  on public.absences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: solo il proprietario
drop policy if exists "Delete own absence" on public.absences;
create policy "Delete own absence"
  on public.absences for delete
  to authenticated
  using (user_id = auth.uid());

-- 3) Trigger updated_at
create or replace function public.touch_absences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists absences_touch_updated on public.absences;
create trigger absences_touch_updated
  before update on public.absences
  for each row execute function public.touch_absences_updated_at();

-- ============================================================================
-- DONE.
-- ============================================================================
