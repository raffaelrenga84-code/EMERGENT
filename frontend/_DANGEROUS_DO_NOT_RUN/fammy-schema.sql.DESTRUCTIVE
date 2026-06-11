-- =====================================================================
--  FAMMY — Schema database (PostgreSQL / Supabase)
--  Versione: 1.0
--  Data: 2026-04-27
-- ---------------------------------------------------------------------
--  Questo schema rispecchia il prototipo fammy-v4.jsx:
--    - più "famiglie" (cerchi) per utente
--    - membri in ogni famiglia (alcuni hanno un account, altri no)
--    - incarichi (task) con categoria, stato, autore, visibilità
--    - commenti/risposte agli incarichi
--    - spese (importi collegati a un incarico "da pagare")
--    - eventi di calendario
--    - inviti pendenti
--
--  Pensato per Supabase (PostgreSQL 15+). Se usi un altro DB:
--    - sostituisci gen_random_uuid() con la funzione equivalente
--    - rimuovi le policy RLS in fondo (sono specifiche Supabase + auth.uid())
-- =====================================================================


-- ------------------------------------------------------------------
-- 0. PULIZIA (rende lo script sicuro da rieseguire)
--    Rimuove le tabelle FAMMY se già esistono. CASCADE rimuove anche
--    indici, trigger, policy associate. ATTENZIONE: cancella i dati.
-- ------------------------------------------------------------------
drop table if exists invitations          cascade;
drop table if exists event_participants   cascade;
drop table if exists events               cascade;
drop table if exists expenses             cascade;
drop table if exists task_responses       cascade;
drop table if exists task_couple_members  cascade;
drop table if exists tasks                cascade;
drop table if exists members              cascade;
drop table if exists families             cascade;
drop table if exists profiles             cascade;

drop function if exists is_family_member(uuid) cascade;
drop function if exists set_updated_at()       cascade;


-- ------------------------------------------------------------------
-- 1. ESTENSIONI
-- ------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- per gen_random_uuid()


-- ------------------------------------------------------------------
-- 1. PROFILI UTENTE
--    Su Supabase l'autenticazione (email/Google) è gestita in auth.users.
--    Qui salviamo i dati pubblici del profilo, collegati 1-a-1.
-- ------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text        not null,
  avatar_letter text,                          -- es. "R" per Raffael
  avatar_color  text default '#1C1611',        -- colore avatar
  language      text default 'it' check (language in ('it','en','fr','de')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ------------------------------------------------------------------
-- 2. FAMIGLIE (cerchi)
--    Un utente può creare più famiglie ed essere membro di altre.
-- ------------------------------------------------------------------
create table families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                   -- "Famiglia Renga"
  emoji       text default '🏠',
  color       text default '#C96A3A',
  created_by  uuid not null references profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_families_created_by on families(created_by);


-- ------------------------------------------------------------------
-- 3. MEMBRI
--    Un membro è una persona dentro una famiglia.
--    Può essere:
--      - collegato a un utente (user_id valorizzato): può fare login
--      - "fittizio" (user_id = null): es. nonno che non usa l'app
-- ------------------------------------------------------------------
create table members (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,  -- null se non ha account
  name          text not null,                                     -- "Nonno Francesco"
  role          text,                                              -- "nonno","mamma","figlio"...
  avatar_letter text,                                              -- "F"
  avatar_color  text default '#1C1611',
  status        text not null default 'active' check (status in ('active','pending','inactive')),
  partner_id    uuid references members(id) on delete set null,    -- coppia (es. Alessandro <-> Valeria)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Un utente può apparire una sola volta per famiglia
  unique (family_id, user_id)
);

create index idx_members_family on members(family_id);
create index idx_members_user   on members(user_id);


-- ------------------------------------------------------------------
-- 4. INCARICHI (tasks)
--    Categorie: care, home, health, admin, other
--    Stati: todo, taken, done, to_pay
--    Visibilità: 'all' (tutta la famiglia) o 'couple' (solo la coppia)
-- ------------------------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  title       text not null,
  note        text,
  category    text not null default 'other'
              check (category in ('care','home','health','admin','other')),
  status      text not null default 'todo'
              check (status in ('todo','taken','done','to_pay')),
  visibility  text not null default 'all'
              check (visibility in ('all','couple')),
  urgent      boolean not null default false,
  due_date    date,                                          -- scadenza/data
  author_id   uuid references members(id) on delete set null, -- chi l'ha creato
  taken_by    uuid references members(id) on delete set null, -- chi l'ha preso in carico
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_tasks_family   on tasks(family_id);
create index idx_tasks_status   on tasks(family_id, status);
create index idx_tasks_due_date on tasks(family_id, due_date);


-- ------------------------------------------------------------------
-- 5. COPPIA SU UN INCARICO
--    Quando un task ha visibility='couple', qui salviamo i 2 membri
--    che lo possono vedere (oltre all'autore).
-- ------------------------------------------------------------------
create table task_couple_members (
  task_id   uuid not null references tasks(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (task_id, member_id)
);


-- ------------------------------------------------------------------
-- 6. COMMENTI / RISPOSTE A UN INCARICO
-- ------------------------------------------------------------------
create table task_responses (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_id   uuid references members(id) on delete set null,
  text        text not null,
  type        text not null default 'comment'
              check (type in ('comment','status_change','assignment','date_change')),
  created_at  timestamptz not null default now()
);

create index idx_responses_task on task_responses(task_id, created_at);


-- ------------------------------------------------------------------
-- 7. SPESE
--    Importo legato a un incarico (tipicamente status='to_pay').
--    Una spesa può anche essere indipendente (task_id = null) per
--    tracciare uscite generiche della famiglia.
-- ------------------------------------------------------------------
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,
  amount      numeric(10,2) not null check (amount >= 0),
  currency    text not null default 'EUR',
  description text,
  paid_by     uuid references members(id) on delete set null,
  paid_at     date,                       -- null = ancora da pagare
  created_at  timestamptz not null default now()
);

create index idx_expenses_family on expenses(family_id, paid_at);


-- ------------------------------------------------------------------
-- 8. EVENTI (Agenda)
--    Eventi di calendario: medico, cena, compleanno...
-- ------------------------------------------------------------------
create table events (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  title        text not null,
  description  text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text,
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_events_family on events(family_id, starts_at);


-- ------------------------------------------------------------------
-- 9. PARTECIPANTI A UN EVENTO
-- ------------------------------------------------------------------
create table event_participants (
  event_id  uuid not null references events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  status    text not null default 'invited'
            check (status in ('invited','accepted','declined','maybe')),
  primary key (event_id, member_id)
);


-- ------------------------------------------------------------------
-- 10. INVITI
--     Quando si "invita" un membro non ancora registrato.
-- ------------------------------------------------------------------
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  member_id   uuid references members(id) on delete cascade,
  email       text,
  phone       text,
  token       text unique not null default encode(gen_random_bytes(16),'hex'),
  invited_by  uuid not null references profiles(id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending','accepted','expired','revoked')),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now()
);

create index idx_invitations_token on invitations(token);


-- ------------------------------------------------------------------
-- 11. TRIGGER: aggiornamento automatico di updated_at
-- ------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated  before update on profiles  for each row execute function set_updated_at();
create trigger trg_families_updated  before update on families  for each row execute function set_updated_at();
create trigger trg_members_updated   before update on members   for each row execute function set_updated_at();
create trigger trg_tasks_updated     before update on tasks     for each row execute function set_updated_at();
create trigger trg_events_updated    before update on events    for each row execute function set_updated_at();


-- =====================================================================
--  ROW LEVEL SECURITY (Supabase)
--  ---------------------------------------------------------------------
--  Regola d'oro: un utente vede/modifica solo le famiglie di cui fa parte.
--  Se NON usi Supabase, salta questa sezione.
-- =====================================================================

alter table profiles            enable row level security;
alter table families            enable row level security;
alter table members             enable row level security;
alter table tasks               enable row level security;
alter table task_couple_members enable row level security;
alter table task_responses      enable row level security;
alter table expenses            enable row level security;
alter table events              enable row level security;
alter table event_participants  enable row level security;
alter table invitations         enable row level security;

-- Helper: l'utente corrente è membro di questa famiglia?
create or replace function is_family_member(fam uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members m
    where m.family_id = fam and m.user_id = auth.uid()
  );
$$;

-- profiles: ognuno legge tutti, modifica solo il proprio
create policy "profiles_read_all"   on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (id = auth.uid());

-- families: vedi solo le tue
create policy "families_read"   on families for select using (is_family_member(id) or created_by = auth.uid());
create policy "families_insert" on families for insert with check (created_by = auth.uid());
create policy "families_update" on families for update using (created_by = auth.uid());
create policy "families_delete" on families for delete using (created_by = auth.uid());

-- members: vedi quelli delle tue famiglie. Regole separate per insert/update/delete
-- perché l'INSERT del primo membro deve essere permesso anche al creatore della famiglia
-- (altrimenti chi crea una famiglia non riesce ad aggiungersi come primo membro: chicken & egg).
create policy "members_read"    on members for select using (is_family_member(family_id));
create policy "members_insert"  on members for insert with check (
  is_family_member(family_id)
  or exists (select 1 from families f where f.id = family_id and f.created_by = auth.uid())
);
create policy "members_update"  on members for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));
create policy "members_delete"  on members for delete using (is_family_member(family_id));

-- tasks: idem
create policy "tasks_read"  on tasks for select using (is_family_member(family_id));
create policy "tasks_write" on tasks for all    using (is_family_member(family_id))
                                       with check (is_family_member(family_id));

-- responses, expenses, events: stessa logica
create policy "responses_rw" on task_responses for all using (
  exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id))
) with check (
  exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id))
);

create policy "expenses_rw" on expenses for all using (is_family_member(family_id))
                                        with check (is_family_member(family_id));

create policy "events_rw"   on events   for all using (is_family_member(family_id))
                                        with check (is_family_member(family_id));

create policy "event_participants_rw" on event_participants for all using (
  exists (select 1 from events e where e.id = event_id and is_family_member(e.family_id))
);

create policy "task_couple_members_rw" on task_couple_members for all using (
  exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id))
);

create policy "invitations_rw" on invitations for all using (is_family_member(family_id))
                                              with check (is_family_member(family_id));


-- =====================================================================
--  DATI DEMO (opzionali — per provare lo schema da subito)
--  Decommenta le righe sotto se vuoi popolare il DB con dati di esempio.
-- =====================================================================

/*
-- Profilo finto (in produzione viene creato dall'autenticazione)
insert into profiles (id, display_name, avatar_letter)
values ('00000000-0000-0000-0000-000000000001', 'Raffael', 'R');

-- Famiglia
insert into families (id, name, emoji, color, created_by)
values ('11111111-1111-1111-1111-111111111111', 'Famiglia Renga', '🏡', '#C96A3A',
        '00000000-0000-0000-0000-000000000001');

-- Membri
insert into members (family_id, user_id, name, role, avatar_letter) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Raffael', 'figlio', 'R'),
  ('11111111-1111-1111-1111-111111111111', null, 'Nonno Francesco', 'nonno', 'F'),
  ('11111111-1111-1111-1111-111111111111', null, 'Nonna Bettina',   'nonna', 'B');

-- Un incarico
insert into tasks (family_id, title, category, status, due_date)
values ('11111111-1111-1111-1111-111111111111',
        'Portare nonno Francesco dal cardiologo', 'health', 'todo', '2026-05-02');
*/

-- =====================================================================
--  FINE SCHEMA
-- =====================================================================
