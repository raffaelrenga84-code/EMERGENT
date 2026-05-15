-- =====================================================================
--  FAMMY - Fix funzione get_invitation
-- ---------------------------------------------------------------------
--  Risolve l'errore: record "mem" is not assigned yet
--  che si verificava quando l'invito non era legato a un membro
--  pre-creato (member_id NULL).
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase. Sostituisce solo
--  la funzione, non distrugge dati.
-- =====================================================================

create or replace function get_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  mem_name text := null;
  mem_role text := null;
begin
  select i.*, f.name as family_name, f.emoji as family_emoji
    into inv
    from invitations i
    join families f on f.id = i.family_id
    where i.token = invite_token;

  if not found then
    return json_build_object('valid', false, 'error', 'Invito non trovato.');
  end if;

  if inv.status <> 'pending' then
    return json_build_object('valid', false, 'error', 'Invito già usato o annullato.');
  end if;

  if inv.expires_at < now() then
    return json_build_object('valid', false, 'error', 'Invito scaduto.');
  end if;

  -- Solo se l'invito puntava a un membro pre-creato, recupera il suo nome
  if inv.member_id is not null then
    select name, role into mem_name, mem_role from members where id = inv.member_id;
  end if;

  return json_build_object(
    'valid', true,
    'family_name', inv.family_name,
    'family_emoji', inv.family_emoji,
    'member_name', mem_name,
    'member_role', mem_role
  );
end;
$$;

grant execute on function get_invitation(text) to anon, authenticated;
