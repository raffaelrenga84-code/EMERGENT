-- =====================================================================
--  FAMMY - Aggiunge token per export iCal per famiglia
-- ---------------------------------------------------------------------
--  Ogni famiglia avrà un token segreto stabile, usato come URL
--  pubblico di sottoscrizione iCal. Es:
--     https://fammy-flame.vercel.app/api/ical/abc123def456.ics
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase. Idempotente.
-- =====================================================================

-- 1. Aggiungi la colonna se non esiste
alter table families
  add column if not exists ical_token text;

-- 2. Genera un token per le famiglie esistenti che non l'hanno
update families
  set ical_token = encode(gen_random_bytes(16), 'hex')
  where ical_token is null;

-- 3. Default per le famiglie create d'ora in poi
alter table families
  alter column ical_token set default encode(gen_random_bytes(16), 'hex');

-- 4. Vincolo not null + indice unico
alter table families
  alter column ical_token set not null;

create unique index if not exists idx_families_ical_token on families(ical_token);

-- 5. Permetti revoca: rigenera token (chiamabile via RPC dal frontend)
create or replace function regenerate_ical_token(family uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  new_token text;
begin
  if not exists (select 1 from members where family_id = family and user_id = auth.uid()) then
    raise exception 'Non sei membro di questa famiglia';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update families set ical_token = new_token where id = family;
  return new_token;
end;
$$;

grant execute on function regenerate_ical_token(uuid) to authenticated;
