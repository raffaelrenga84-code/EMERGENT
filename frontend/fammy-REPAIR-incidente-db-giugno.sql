-- =====================================================================
--  FAMMY — RIPARAZIONE dopo incidente DB (giugno 2026)
-- ---------------------------------------------------------------------
--  SINTOMI risolti da questo script:
--   1. "new row violates row-level security policy for table families"
--      quando si crea una nuova famiglia
--   2. "record \"mem\" is not assigned yet" quando si apre un invito
--
--  DIAGNOSI (fatta via API il 13/06): lo schema dati è completo, ma il
--  DB ha perso le policy RLS di INSERT (families/members/profiles) e ha
--  la versione VECCHIA e buggata di get_invitation.
--
--  Esegui TUTTO questo file UNA volta su Supabase Dashboard → SQL Editor.
--  IDEMPOTENTE: rilanciabile senza danni. NON tocca i dati.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1) POLICY RLS mancanti (families / members / profiles)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "families_insert" on public.families;
create policy "families_insert" on public.families
  for insert with check (created_by = auth.uid());

drop policy if exists "families_update" on public.families;
create policy "families_update" on public.families
  for update using (created_by = auth.uid());

drop policy if exists "families_delete" on public.families;
create policy "families_delete" on public.families
  for delete using (created_by = auth.uid());

-- members: il creatore può aggiungere sé stesso come primo membro,
-- i membri esistenti possono aggiungere altri membri.
drop policy if exists "members_insert" on public.members;
create policy "members_insert" on public.members
  for insert with check (
    (user_id = auth.uid() and exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    ))
    OR
    exists (
      select 1 from public.members m2
      where m2.family_id = members.family_id and m2.user_id = auth.uid()
    )
    OR
    exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 2) get_invitation — versione CORRETTA
--    (la vecchia usava `mem record` e crashava con
--     "record mem is not assigned yet" sugli inviti generici)
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- 3) accept_invitation v2 (con claim placeholder) + lista placeholder
--    Ribaditi per sicurezza: se il DB ha la v1, l'accettazione con
--    "Io sono X" non funzionerebbe.
-- ─────────────────────────────────────────────────────────────────────
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

-- =====================================================================
-- FINE — Dopo l'esecuzione:
--  • "Crea famiglia" funziona di nuovo (sia da app sia da browser)
--  • Gli inviti via link si aprono senza "record mem is not assigned yet"
-- =====================================================================
