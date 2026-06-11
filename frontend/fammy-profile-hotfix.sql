-- =====================================================================
--  FAMMY — Hotfix profile creation (FIX P0)
-- ---------------------------------------------------------------------
--  Risolve l'errore "insert or update on table 'families' violates
--  foreign key constraint families_created_by_fkey".
--
--  Root causes (3 problemi):
--
--   1) MISSING RLS INSERT POLICY su `profiles`
--      Lo schema ha `profiles_read_all` (SELECT) e `profiles_update_own`
--      (UPDATE), ma NON una policy INSERT. Quindi qualsiasi upsert
--      client-side su profiles veniva silenziosamente bloccato da RLS.
--
--   2) TRIGGER `handle_new_user` RIGIDO sui phone signup
--      Il trigger usava `split_part(new.email, '@', 1)` ma per i signup
--      via phone OTP `email` è NULL → split_part(null,...) ritorna ''
--      → `display_name` finiva stringa vuota o, peggio, il trigger andava
--      in errore e il profile non veniva creato → tutti i flow successivi
--      (creazione famiglia con FK created_by → profiles.id) fallivano.
--
--   3) PROFILI ORFANI esistenti
--      Gli utenti creati PRIMA del fix del trigger non hanno una riga in
--      profiles. Vanno backfillati con dati minimi (display_name + letter).
--
--  Esegui SOLO questo file su Supabase Dashboard → SQL Editor → Run.
--  Idempotente: rilanciabile senza danni.
-- =====================================================================

-- =====================================================================
-- (1) Policy INSERT su profiles (manca dallo schema iniziale)
-- =====================================================================
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

-- =====================================================================
-- (2) Trigger `handle_new_user` robusto a phone-only signup
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_letter text;
begin
  -- Display name fallback chain:
  -- 1) raw_user_meta_data.full_name (Google OAuth)
  -- 2) raw_user_meta_data.name (alt label)
  -- 3) raw_user_meta_data.display_name (custom)
  -- 4) split_part(email, '@', 1) (email signup)
  -- 5) phone (phone OTP signup)
  -- 6) 'Membro' (last resort)
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Membro'
  );

  v_letter := upper(substring(v_name from 1 for 1));
  if v_letter is null or v_letter = '' then v_letter := 'M'; end if;

  -- INSERT idempotente: se la riga esiste già (es. backfill manuale),
  -- non solleviamo errore. ON CONFLICT NOTHING evita rollback.
  insert into public.profiles (id, display_name, avatar_letter)
  values (new.id, v_name, v_letter)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Non bloccare MAI il signup auth a causa di un errore in profiles:
    -- al peggio il profilo viene creato lato client al primo login.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- (3) Backfill: ricrea profili mancanti per utenti già esistenti
-- =====================================================================
insert into public.profiles (id, display_name, avatar_letter)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    u.phone,
    'Membro'
  ) as display_name,
  upper(substring(
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      nullif(u.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      u.phone,
      'Membro'
    )
    from 1 for 1
  )) as avatar_letter
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- =====================================================================
-- FINE — dopo aver eseguito questo file:
--   ✅ Tutti gli utenti hanno una riga in profiles
--   ✅ Il trigger gestisce email NULL (phone signup) senza fallire
--   ✅ Il safety net client-side in App.jsx ora può fare upsert
--   ✅ La creazione famiglia con created_by → profiles(id) non viola più FK
-- =====================================================================
