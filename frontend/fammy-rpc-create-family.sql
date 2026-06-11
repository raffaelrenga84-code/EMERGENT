-- =====================================================================
--  FAMMY — RPC create_family_with_owner (SECURITY DEFINER)
-- ---------------------------------------------------------------------
--  Risolve in via DEFINITIVA il problema "new row violates row-level
--  security policy for table families" e tutti i suoi cugini.
--
--  Anziché lasciare il client fare 2 INSERT separati (families +
--  members) attraverso RLS, esponiamo una RPC SECURITY DEFINER che:
--   1. verifica auth.uid() (autenticazione)
--   2. assicura che il profilo dell'utente esista (upsert)
--   3. crea la famiglia + il primo membro in transazione
--   4. ritorna l'id della nuova famiglia
--
--  Vantaggi:
--   ✅ Bypassa RLS in modo controllato e tracciabile
--   ✅ Atomico: o tutto va o niente
--   ✅ Garantisce il profile (anti foreign-key)
--   ✅ Niente bug "auth.uid()=null sul client"
--
--  Esegui SOLO questo file. Idempotente.
-- =====================================================================

create or replace function public.create_family_with_owner(
  p_name        text,
  p_emoji       text default '🏡',
  p_display_name text default null
)
returns table (
  id           uuid,
  name         text,
  emoji        text,
  created_by   uuid,
  invite_code  text,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_family_id    uuid;
  v_display_name text;
  v_letter       text;
  v_meta         jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = '22023';
  end if;

  -- 1) Safety net: garantisce che il profilo esista (anti FK violation)
  v_meta := coalesce(
    (select raw_user_meta_data from auth.users where id = v_uid),
    '{}'::jsonb
  );
  v_display_name := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    nullif(split_part(coalesce((select email from auth.users where id = v_uid), ''), '@', 1), ''),
    (select phone from auth.users where id = v_uid),
    'Membro'
  );
  v_letter := upper(substring(v_display_name from 1 for 1));

  insert into public.profiles (id, display_name, avatar_letter)
  values (v_uid, v_display_name, v_letter)
  on conflict (id) do nothing;

  -- 2) Crea la famiglia
  insert into public.families (name, emoji, created_by)
  values (trim(p_name), coalesce(p_emoji, '🏡'), v_uid)
  returning families.id into v_family_id;

  -- 3) Aggiungi il creatore come primo membro (role='tu', status='active')
  insert into public.members (family_id, user_id, name, role, avatar_letter, status)
  values (v_family_id, v_uid, v_display_name, 'tu', v_letter, 'active')
  on conflict do nothing;

  -- 4) Ritorna la riga famiglia appena creata
  return query
    select f.id, f.name, f.emoji, f.created_by, f.invite_code, f.created_at
    from public.families f
    where f.id = v_family_id;
end;
$$;

revoke all on function public.create_family_with_owner(text, text, text) from public;
grant execute on function public.create_family_with_owner(text, text, text) to authenticated;

comment on function public.create_family_with_owner is
'Crea atomicamente una nuova famiglia + il primo membro (creator). SECURITY DEFINER per bypassare RLS in modo controllato. Garantisce anche l''esistenza del profile (anti FK violation).';
