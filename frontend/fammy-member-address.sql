-- =====================================================================
--  FAMMY — Indirizzo membro (opzionale)
-- ---------------------------------------------------------------------
--  Aggiunge colonna `address` a `members` (e a `profiles` per
--  persistenza cross-family: se l'utente cambia famiglia, l'indirizzo
--  resta).
--  L'utente lo edita dal proprio Profilo → poi viene mostrato nelle
--  MemberCard di FamilyTab.
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- Per il membro corrente nella famiglia
alter table public.members
  add column if not exists address text;
comment on column public.members.address is
  'Indirizzo opzionale di residenza del membro. Visibile agli altri membri della famiglia.';

-- Per il profilo cross-family: quando un utente è in più famiglie,
-- l'indirizzo viene "propagato" a tutte le sue righe members. Per ora
-- lo salviamo SOLO in members; in futuro potremmo sincronizzarlo.
alter table public.profiles
  add column if not exists address text;
comment on column public.profiles.address is
  'Indirizzo opzionale (fonte canonica). Sincronizzato in tutti i members dell utente.';

-- Trigger: quando l'utente aggiorna `profiles.address`, propaga
-- l'aggiornamento a tutti i `members` con quel user_id (così l'utente
-- non deve editarlo in ogni famiglia separatamente).
create or replace function public.fammy_sync_profile_address_to_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.address is distinct from old.address then
    update public.members set address = new.address where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_address_profile_to_members on public.profiles;
create trigger trg_sync_address_profile_to_members
  after update of address on public.profiles
  for each row execute function public.fammy_sync_profile_address_to_members();
