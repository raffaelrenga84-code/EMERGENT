-- =====================================================================
--  FAMMY - RPC inviti v2: supporto claim di un placeholder esistente
-- ---------------------------------------------------------------------
--  Cambiamenti rispetto a v1 (fammy-rpc-invitations.sql):
--   * accept_invitation accetta un secondo parametro opzionale
--     `claim_member_id`: se l'invitato sceglie di "essere" un membro
--     placeholder già presente nella famiglia (senza account), il suo
--     user_id viene collegato a quel placeholder invece di creare un
--     nuovo membro duplicato.
--   * Nuova RPC `list_claimable_placeholders(token)` per la pagina di
--     accettazione: ritorna i membri della famiglia senza account
--     così l'utente può scegliere "Io sono Rex".
--
--  Da eseguire UNA VOLTA su Supabase (sostituisce le funzioni v1).
-- =====================================================================

-- 1. Lista placeholder claimabili (senza account) per un dato invito --
create or replace function list_claimable_placeholders(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
begin
  select i.family_id into inv
    from invitations i
    where i.token = invite_token
      and i.status = 'pending'
      and i.expires_at > now();

  if not found then
    return json_build_object('valid', false, 'placeholders', '[]'::json);
  end if;

  return json_build_object(
    'valid', true,
    'placeholders', coalesce(
      (
        select json_agg(
                 json_build_object(
                   'id', m.id,
                   'name', m.name,
                   'role', m.role,
                   'avatar_letter', m.avatar_letter,
                   'avatar_color', m.avatar_color
                 )
                 order by m.created_at
               )
          from members m
         where m.family_id = inv.family_id
           and m.user_id is null
           and m.status <> 'inactive'
      ),
      '[]'::json
    )
  );
end;
$$;

grant execute on function list_claimable_placeholders(text) to anon, authenticated;


-- 2. accept_invitation con parametro opzionale claim_member_id ---------
-- Drop firma vecchia (1 arg) e firma nuova (2 args) per evitare ambiguità
drop function if exists accept_invitation(text);
drop function if exists accept_invitation(text, uuid);

create or replace function accept_invitation(
  invite_token text,
  claim_member_id uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  target_member record;
  result_member_id uuid;
  already_linked_id uuid;
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

  -- L'utente è già membro di questa famiglia? Marca l'invito come accettato
  -- e ritorna il membro esistente.
  select id into already_linked_id
    from members
    where family_id = inv.family_id and user_id = auth.uid()
    limit 1;
  if already_linked_id is not null then
    update invitations set status = 'accepted' where id = inv.id;
    return json_build_object(
      'success', true,
      'family_id', inv.family_id,
      'member_id', already_linked_id,
      'already_member', true
    );
  end if;

  ---------------------------------------------------------------------
  -- Decide a quale placeholder collegare l'utente (priorità):
  --   1. claim_member_id passato esplicitamente dall'UI
  --   2. invitations.member_id (link generato per uno specifico
  --      placeholder dal FamilyInviteModal)
  --   3. altrimenti: crea un nuovo membro
  ---------------------------------------------------------------------
  if claim_member_id is not null then
    select * into target_member
      from members
      where id = claim_member_id
        and family_id = inv.family_id
        and user_id is null
      for update;
    if not found then
      return json_build_object(
        'success', false,
        'error', 'Il profilo selezionato non è più disponibile.'
      );
    end if;

    update members
       set user_id = auth.uid(), status = 'active'
     where id = target_member.id
     returning id into result_member_id;

  elsif inv.member_id is not null then
    update members
       set user_id = auth.uid(), status = 'active'
     where id = inv.member_id and user_id is null
     returning id into result_member_id;

    -- Il placeholder era già stato preso da un altro? Crea nuovo membro
    if result_member_id is null then
      insert into members (family_id, user_id, name, role, status, avatar_letter)
      select inv.family_id, auth.uid(),
             coalesce(p.display_name, 'Nuovo membro'),
             'altro', 'active',
             upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
        from profiles p where p.id = auth.uid()
      returning id into result_member_id;
    end if;

  else
    insert into members (family_id, user_id, name, role, status, avatar_letter)
    select inv.family_id, auth.uid(),
           coalesce(p.display_name, 'Nuovo membro'),
           'altro', 'active',
           upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
      from profiles p where p.id = auth.uid()
    returning id into result_member_id;
  end if;

  update invitations set status = 'accepted' where id = inv.id;

  return json_build_object(
    'success', true,
    'family_id', inv.family_id,
    'member_id', result_member_id
  );
end;
$$;

grant execute on function accept_invitation(text, uuid) to authenticated;
