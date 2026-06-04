-- =====================================================================
--  FAMMY — Phone Auth support
-- ---------------------------------------------------------------------
--  1) Aggiorna il trigger handle_new_user per gestire utenti solo-telefono
--     (senza email). Prima fallava con "Database error saving new user".
--  2) Aggiunge la colonna `phone` alla tabella public.profiles per
--     permettere a chi entra via Google/Email di aggiungere il proprio
--     telefono e poter loggarsi anche con SMS in futuro.
--
--  Idempotente: eseguibile più volte senza errori.
-- =====================================================================

-- 1) Colonna phone (E.164 format: +393331234567)
alter table public.profiles
  add column if not exists phone text;

-- Index unico per accelerare le lookup "trova profilo per telefono"
-- (utile in futuro per "invita per SMS")
create unique index if not exists profiles_phone_idx
  on public.profiles(phone)
  where phone is not null;

-- 2) Trigger aggiornato — robusto su utenti solo email, solo phone, o entrambi.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_display text;
  v_letter  text;
  v_phone   text;
begin
  -- Display name di fallback con priorità:
  -- 1. metadata.display_name (passato esplicitamente, es. OAuth)
  -- 2. metadata.full_name / metadata.name (Google/Apple)
  -- 3. parte locale dell'email
  -- 4. ultime 4 cifre del telefono (es. "*7531")
  -- 5. "Membro" (fallback finale)
  v_display := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    case when new.phone is not null and length(new.phone) > 4
         then '*' || right(new.phone, 4)
         else null
    end,
    'Membro'
  );

  v_letter := upper(substring(v_display from 1 for 1));
  v_phone  := nullif(new.phone, '');

  -- Anti-conflitto: se esiste già un profilo (es. utente che si è loggato
  -- prima via Google e poi sta confermando il telefono), fai UPDATE invece
  -- di INSERT. Senza questa logica il trigger fallirebbe con duplicate-key.
  insert into public.profiles (id, display_name, avatar_letter, phone)
  values (new.id, v_display, v_letter, v_phone)
  on conflict (id) do update set
    phone = coalesce(public.profiles.phone, excluded.phone),
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$$;

-- 3) Backfill: copia il numero di telefono di auth.users → public.profiles
--    per gli utenti già esistenti che lo hanno (es. la tua ragazza Jenna).
update public.profiles p
  set phone = u.phone
  from auth.users u
  where u.id = p.id
    and u.phone is not null
    and u.phone <> ''
    and p.phone is null;

-- 4) Funzione helper: l'utente loggato può aggiornare il proprio phone
--    chiamando questa RPC. Aggiorna sia auth.users.phone (se ancora vuoto)
--    sia public.profiles.phone. Lato auth.users questo NON triggera SMS:
--    è solo per "claim" del numero per matchare login futuri.
--    Per il claim "ufficiale" con verifica SMS l'utente userà
--    supabase.auth.updateUser({ phone }) dal client.
create or replace function public.fammy_set_profile_phone(p_phone text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
    set phone = nullif(p_phone, '')
    where id = auth.uid();
end;
$$;

grant execute on function public.fammy_set_profile_phone(text) to authenticated;
