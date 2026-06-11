-- =====================================================================
--  FAMMY — Aggiunge coordinate Google Maps al campo indirizzo
-- ---------------------------------------------------------------------
--  Per integrazione Google Places Autocomplete: oltre al testo formattato
--  dell'indirizzo, salviamo anche le coordinate (lat/lng) così possiamo
--  aprire indicazioni stradali precise verso casa di un altro membro
--  della famiglia.
--
--  Esegui solo questo file. Idempotente.
-- =====================================================================

-- profiles
alter table public.profiles
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision;

-- members (sincronizzato dal trigger DB esistente sull'update di profiles)
alter table public.members
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision;

-- Aggiorna il trigger che propaga address da profiles → members per
-- includere anche le coordinate. Se non esiste, lo creiamo da zero.
create or replace function public.sync_member_address_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and (
       new.address is distinct from old.address
       or new.address_lat is distinct from old.address_lat
       or new.address_lng is distinct from old.address_lng
     )) then
    update public.members
       set address     = new.address,
           address_lat = new.address_lat,
           address_lng = new.address_lng
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_member_address on public.profiles;
create trigger trg_sync_member_address
  after update on public.profiles
  for each row execute function public.sync_member_address_from_profile();

-- FINE
