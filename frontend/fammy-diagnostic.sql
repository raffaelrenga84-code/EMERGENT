-- =====================================================================
--  FAMMY — DIAGNOSTICA (SOLO READ, ZERO MODIFICHE)
-- ---------------------------------------------------------------------
--  Esegui questo file su Supabase Dashboard → SQL Editor.
--  Mostra lo stato attuale del DB senza toccare nulla.
--  Risultato: 8 risultati separati (uno per ogni blocco "select").
--  Manda gli screenshot a chi sta investigando.
-- =====================================================================

-- ============================================================
-- (1) Quanti utenti hai in totale + quante famiglie/members/tasks/expenses
-- ============================================================
select
  (select count(*) from auth.users) as total_auth_users,
  (select count(*) from public.profiles) as total_profiles,
  (select count(*) from public.families) as total_families,
  (select count(*) from public.members) as total_members,
  (select count(*) from public.tasks) as total_tasks,
  (select count(*) from public.events) as total_events,
  (select count(*) from public.expenses) as total_expenses;

-- ============================================================
-- (2) Profili orfani (auth.users senza riga in profiles)
-- ============================================================
select u.id, u.email, u.phone, u.created_at, u.last_sign_in_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at;

-- ============================================================
-- (3) Tutti gli auth.users con il loro profilo + count families create
-- ============================================================
select
  u.id as user_id,
  u.email,
  u.phone,
  p.display_name as profile_name,
  (select count(*) from public.families f where f.created_by = u.id) as families_created,
  (select count(*) from public.members m where m.user_id = u.id) as memberships,
  u.last_sign_in_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.last_sign_in_at desc nulls last;

-- ============================================================
-- (4) Tutte le famiglie nel DB (ordinare dalla più vecchia)
-- ============================================================
select 
  f.id, 
  f.name, 
  f.emoji, 
  f.created_by, 
  p.display_name as owner_name,
  f.created_at,
  (select count(*) from public.members m where m.family_id = f.id) as members_count,
  (select count(*) from public.tasks t where t.family_id = f.id) as tasks_count
from public.families f
left join public.profiles p on p.id = f.created_by
order by f.created_at asc;

-- ============================================================
-- (5) Tutti i members di RAFFAEL (UID 8fd09328-0152-4f7f-aa4f-dca3cabd8d99)
-- ============================================================
select 
  m.id as member_id,
  m.user_id,
  m.family_id,
  f.name as family_name,
  m.name as member_name,
  m.role,
  m.status,
  m.created_at
from public.members m
left join public.families f on f.id = m.family_id
where m.user_id = '8fd09328-0152-4f7f-aa4f-dca3cabd8d99'
order by m.created_at;

-- ============================================================
-- (6) TUTTI i members con quel display name (cattura anche eventuali
--     duplicati con user_id null o diverso)
-- ============================================================
select 
  m.id as member_id,
  m.user_id,
  m.family_id,
  f.name as family_name,
  m.name as member_name,
  m.role,
  m.status,
  m.created_at
from public.members m
left join public.families f on f.id = m.family_id
where m.name ilike '%raffael%' or m.name ilike '%renga%'
order by m.created_at;

-- ============================================================
-- (7) Tasks/events/expenses recenti (ultimi 7 giorni) — chi li ha creati
-- ============================================================
select 'task' as kind, t.id::text, t.title as label, t.family_id, f.name as family_name, t.created_at
from public.tasks t
left join public.families f on f.id = t.family_id
where t.created_at > now() - interval '7 days'
union all
select 'event', e.id::text, e.title, e.family_id, f.name, e.created_at
from public.events e
left join public.families f on f.id = e.family_id
where e.created_at > now() - interval '7 days'
union all
select 'expense', x.id::text, x.description, x.family_id, f.name, x.created_at
from public.expenses x
left join public.families f on f.id = x.family_id
where x.created_at > now() - interval '7 days'
order by created_at desc
limit 100;

-- ============================================================
-- (8) Audit log: vedi se hai accesso ai logs delle modifiche DDL
--     (potrebbe non funzionare a seconda del piano Supabase)
-- ============================================================
-- NB: la storia DELETE/TRUNCATE NON è disponibile in Supabase Free.
--     Su Pro c'è il "Point-in-Time Recovery" che permette restore.
--     Su Free, controlla il "Database → Backups" — di solito c'è 1
--     backup automatico al giorno conservato per 7 giorni.

-- FINE — niente è stato modificato dal DB. Manda gli screenshot dei risultati.
