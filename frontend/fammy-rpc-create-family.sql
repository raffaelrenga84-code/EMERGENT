-- =====================================================================
--  FAMMY — RPC create_family_with_owner (SECURITY DEFINER) — v2
-- ---------------------------------------------------------------------
--  v2: ritorna SOLO l'UUID della famiglia creata invece di una tabella
--  (la v1 dava "column reference 'id' is ambiguous" perché il nome
--  della colonna di output collideva con families.id nelle assegnazioni).
--
--  Esegui SOLO questo file. Idempotente. Rimpiazza la v1.
-- =====================================================================

-- Drop entrambe le firme possibili (v1 con returns table, v2 con returns uuid)
-- per garantire pulizia totale
drop function if exists public.create_family_with_owner(text, text, text) cascade;

create or replace function public.create_family_with_owner(
  p_name         text,
  p_emoji        text default '🏡',
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_family_id    uuid;
  v_display_name text;
  v_letter       text;
  v_email        text;
  v_phone        text;
  v_meta         jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;

  -- 1) Risolvi un display_name sensato (anti record vuoti)
  select au.email, au.phone, coalesce(au.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_phone, v_meta
  from auth.users au
  where au.id = v_uid;

  v_display_name := coalesce(
    nullif(btrim(p_display_name), ''),
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    v_phone,
    'Membro'
  );
  v_letter := upper(substring(v_display_name from 1 for 1));
  if v_letter is null or v_letter = '' then v_letter := 'M'; end if;

  -- 2) Safety net: garantisce che il profilo esista (anti FK violation)
  insert into public.profiles (id, display_name, avatar_letter)
  values (v_uid, v_display_name, v_letter)
  on conflict (id) do nothing;

  -- 3) Crea la famiglia
  insert into public.families (name, emoji, created_by)
  values (btrim(p_name), coalesce(p_emoji, '🏡'), v_uid)
  returning families.id into v_family_id;

  -- 4) Aggiungi il creatore come primo membro (role='tu', status='active')
  insert into public.members (family_id, user_id, name, role, avatar_letter, status)
  values (v_family_id, v_uid, v_display_name, 'tu', v_letter, 'active');

  return v_family_id;
end;
$$;

revoke all on function public.create_family_with_owner(text, text, text) from public;
grant execute on function public.create_family_with_owner(text, text, text) to authenticated;

comment on function public.create_family_with_owner is
'v2: crea atomicamente una famiglia + il primo membro. Ritorna l''UUID. SECURITY DEFINER, bypassa RLS in modo controllato. Garantisce l''esistenza del profile (anti FK violation).';
