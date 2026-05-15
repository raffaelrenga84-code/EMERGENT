-- =====================================================================
--  FAMMY - RPC per gestire l'accettazione degli inviti
-- ---------------------------------------------------------------------
--  Aggiunge due funzioni:
--    - get_invitation(token): legge i dati pubblici di un invito
--      (per la pagina "stai per entrare in Famiglia X")
--    - accept_invitation(token): collega l'utente loggato al membro
--      della famiglia indicato dall'invito
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
-- =====================================================================

-- 1. Lettura pubblica di un invito (anche senza autenticazione)
--    Restituisce solo info safe per la landing page.
create or replace function get_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  fam record;
  mem record;
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

  -- Eventuale info sul membro pre-creato
  if inv.member_id is not null then
    select name, role into mem from members where id = inv.member_id;
  end if;

  return json_build_object(
    'valid', true,
    'family_name', inv.family_name,
    'family_emoji', inv.family_emoji,
    'member_name', coalesce(mem.name, null),
    'member_role', coalesce(mem.role, null)
  );
end;
$$;

-- Permetti chiamata anche senza login (per la landing /invite/:token)
grant execute on function get_invitation(text) to anon, authenticated;


-- 2. Accettazione invito (richiede utente loggato)
--    Collega l'utente al membro target o crea un nuovo membro.
create or replace function accept_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  result_member_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Devi essere loggato.');
  end if;

  select * into inv
    from invitations
    where token = invite_token and status = 'pending' and expires_at > now()
    for update;

  if not found then
    return json_build_object('success', false, 'error', 'Invito non valido o scaduto.');
  end if;

  -- L'utente è già membro di questa famiglia? Allora basta marcare come accettato.
  if exists (select 1 from members where family_id = inv.family_id and user_id = auth.uid()) then
    update invitations set status = 'accepted' where id = inv.id;
    return json_build_object('success', true, 'family_id', inv.family_id, 'already_member', true);
  end if;

  -- Caso 1: l'invito puntava a un membro pre-creato senza account → linkalo
  if inv.member_id is not null then
    update members set user_id = auth.uid(), status = 'active'
      where id = inv.member_id and user_id is null
      returning id into result_member_id;

    if result_member_id is null then
      -- il membro era già linkato: creiamo nuovo membro per quest'utente
      insert into members (family_id, user_id, name, role, status, avatar_letter)
      select inv.family_id, auth.uid(),
             coalesce(p.display_name, 'Nuovo membro'),
             'altro', 'active',
             upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
      from profiles p where p.id = auth.uid()
      returning id into result_member_id;
    end if;
  else
    -- Caso 2: invito generico → crea un nuovo membro per l'utente loggato
    insert into members (family_id, user_id, name, role, status, avatar_letter)
    select inv.family_id, auth.uid(),
           coalesce(p.display_name, 'Nuovo membro'),
           'altro', 'active',
           upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
    from profiles p where p.id = auth.uid()
    returning id into result_member_id;
  end if;

  update invitations set status = 'accepted' where id = inv.id;

  return json_build_object('success', true, 'family_id', inv.family_id, 'member_id', result_member_id);
end;
$$;

grant execute on function accept_invitation(text) to authenticated;
