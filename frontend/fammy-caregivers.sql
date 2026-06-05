-- ============================================================
-- FAMMY · Caregiver system (Fase 3 Care Hub)
-- ============================================================
-- Un membro "assistito" (es. nonna senza smartphone, bambino,
-- persona con demenza) può avere uno o più "caregiver" — altri
-- membri della stessa famiglia che si occupano di lui/lei.
--
-- Comportamenti sbloccati:
--  • Push di reminder medicine vanno SOLO ai caregiver (non a tutta
--    la famiglia, e ovviamente non all'assistito che non userebbe
--    il telefono)
--  • Care Hub mostra badge "🤝 Caregiver: Maria, Luca"
--  • Profilo personale mostra sezione "👥 Persone che assisto"
--    con shortcut diretto al loro Care Hub
--  • FamilyTab mostra mini-chip "🤝 Maria" sotto il nome dell'assistito
--  • Bacheca saluta "Ciao Maria — sei caregiver di Pina" se applicabile
-- ============================================================

-- 1) Colonna cared_by — array di members.id che sono caregivers
--    di questo assistito. Default vuoto.
alter table public.members
  add column if not exists cared_by uuid[] not null default '{}'::uuid[];

-- 2) Index GIN per query rapide "trova tutti i miei assistiti"
create index if not exists idx_members_cared_by
  on public.members using gin (cared_by);

-- 3) Helper SQL: dato un member_id, ritorna gli user_id auth dei
--    caregiver da notificare (escludendo placeholder senza account).
--    Usata da edge function medication-reminder-push.
create or replace function public.get_member_caregiver_user_ids(p_member_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m_c.user_id
  from public.members m_target
  cross join lateral unnest(m_target.cared_by) as cg_id
  join public.members m_c on m_c.id = cg_id
  where m_target.id = p_member_id
    and m_c.user_id is not null;
$$;

comment on function public.get_member_caregiver_user_ids is
  'Restituisce gli user_id (auth.uid) dei caregiver attivi assegnati a un membro. Esclude caregiver senza account.';

-- 4) Helper SQL: per un dato auth.uid, ritorna la lista di assistiti
--    di cui è caregiver. Usata dal Profilo per la sezione "Assisto".
create or replace function public.get_my_assisted_members()
returns table(
  member_id uuid,
  member_name text,
  family_id uuid,
  member_avatar_letter text,
  member_avatar_color text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.members where user_id = auth.uid()
  )
  select distinct
    m.id, m.name, m.family_id, m.avatar_letter, m.avatar_color
  from public.members m
  where m.is_assisted = true
    and exists (
      select 1 from me where me.id = any(m.cared_by)
    );
$$;

comment on function public.get_my_assisted_members is
  'Lista degli assistiti di cui l''utente corrente è caregiver.';
