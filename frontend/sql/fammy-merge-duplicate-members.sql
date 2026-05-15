-- =====================================================================
--  FAMMY - Fix duplicati: fonde due membri della stessa famiglia
-- ---------------------------------------------------------------------
--  Problema: quando si crea un placeholder ("Rex · no account") e poi
--  si genera un "Invite with link" senza specificare il placeholder,
--  l'utente che accetta crea un SECONDO membro. Risultato: due Rex.
--
--  Questa RPC fa il merge: trasferisce TUTTI i riferimenti dal membro
--  placeholder (di solito senza user_id) al membro reale (con user_id),
--  copia eventuali campi del profilo non ancora compilati, e cancella
--  il placeholder.
--
--  Uso (dal SQL Editor di Supabase):
--    select merge_member_into(
--      '<UUID_DEL_REX_PLACEHOLDER>'::uuid,
--      '<UUID_DEL_REX_REALE>'::uuid
--    );
--
--  Per trovare gli UUID dei due Rex:
--    select id, name, user_id, status
--      from members
--      where family_id = (select id from families where name = 'La famiglia di Raffael')
--      order by created_at;
--
--  Da eseguire UNA VOLTA come migrazione su Supabase (definisce la
--  funzione). Poi la chiami ogni volta che serve.
-- =====================================================================

create or replace function merge_member_into(
  placeholder_id uuid,
  real_id uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  ph record;
  rl record;
  caller_is_owner boolean;
begin
  if placeholder_id is null or real_id is null then
    return json_build_object('success', false, 'error', 'ID mancanti.');
  end if;
  if placeholder_id = real_id then
    return json_build_object('success', false, 'error', 'I due ID coincidono.');
  end if;

  select * into ph from members where id = placeholder_id;
  if not found then
    return json_build_object('success', false, 'error', 'Placeholder non trovato.');
  end if;

  select * into rl from members where id = real_id;
  if not found then
    return json_build_object('success', false, 'error', 'Membro reale non trovato.');
  end if;

  if ph.family_id <> rl.family_id then
    return json_build_object('success', false, 'error', 'I due membri sono in famiglie diverse.');
  end if;

  -- Solo un creatore della famiglia (o service_role) può fare il merge
  select exists (
    select 1 from families f
    where f.id = ph.family_id
      and (
        f.created_by = auth.uid()
        or auth.role() = 'service_role'
      )
  ) into caller_is_owner;

  if not caller_is_owner then
    return json_build_object('success', false, 'error', 'Solo il creatore della famiglia può fondere membri.');
  end if;

  ---------------------------------------------------------------------
  -- 1. Sposta tutti i riferimenti FK semplici (UPDATE diretto)
  ---------------------------------------------------------------------
  update members        set partner_id   = real_id where partner_id   = placeholder_id;
  update tasks          set assigned_to  = real_id where assigned_to  = placeholder_id;
  update tasks          set author_id    = real_id where author_id    = placeholder_id;
  update tasks          set taken_by     = real_id where taken_by     = placeholder_id;

  -- Colonne aggiunte da migrazioni successive (potrebbero non esistere
  -- su DB più vecchi: usiamo blocchi protetti)
  begin update tasks set created_by   = real_id where created_by   = placeholder_id; exception when undefined_column then null; end;
  begin update tasks set delegated_to = real_id where delegated_to = placeholder_id; exception when undefined_column then null; end;

  update task_responses set author_id = real_id where author_id = placeholder_id;

  begin update recurring_tasks set completed_by = real_id where completed_by = placeholder_id; exception when undefined_table then null; end;

  update expenses set paid_by = real_id where paid_by = placeholder_id;
  update events   set created_by = real_id where created_by = placeholder_id;
  update invitations set member_id = real_id where member_id = placeholder_id;

  begin update gift_messages set birthday_member_id = real_id where birthday_member_id = placeholder_id; exception when undefined_table then null; end;
  begin update gift_messages set author_member_id   = real_id where author_member_id   = placeholder_id; exception when undefined_table then null; end;

  ---------------------------------------------------------------------
  -- 2. Tabelle con PK composita: prima rimuovi righe duplicate, poi UPDATE
  ---------------------------------------------------------------------
  -- task_assignees (task_id, member_id)
  delete from task_assignees a
   where a.member_id = placeholder_id
     and exists (
       select 1 from task_assignees b
        where b.task_id = a.task_id and b.member_id = real_id
     );
  update task_assignees set member_id = real_id where member_id = placeholder_id;

  -- task_couple_members (task_id, member_id)
  delete from task_couple_members a
   where a.member_id = placeholder_id
     and exists (
       select 1 from task_couple_members b
        where b.task_id = a.task_id and b.member_id = real_id
     );
  update task_couple_members set member_id = real_id where member_id = placeholder_id;

  -- event_participants (event_id, member_id)
  delete from event_participants a
   where a.member_id = placeholder_id
     and exists (
       select 1 from event_participants b
        where b.event_id = a.event_id and b.member_id = real_id
     );
  update event_participants set member_id = real_id where member_id = placeholder_id;

  -- expense_shares (expense_id, member_id) — sommiamo gli importi se duplicato
  begin
    -- somma gli amount delle quote duplicate sul membro reale
    update expense_shares r
       set amount = r.amount + p.amount
      from expense_shares p
     where p.member_id = placeholder_id
       and r.member_id = real_id
       and r.expense_id = p.expense_id;
    delete from expense_shares
     where member_id = placeholder_id
       and exists (
         select 1 from expense_shares b
          where b.expense_id = expense_shares.expense_id and b.member_id = real_id
       );
    update expense_shares set member_id = real_id where member_id = placeholder_id;
  exception when undefined_table then null; end;

  ---------------------------------------------------------------------
  -- 3. Copia sul membro reale i campi del placeholder se non già impostati
  ---------------------------------------------------------------------
  update members
     set role          = coalesce(role,          ph.role),
         avatar_letter = coalesce(avatar_letter, ph.avatar_letter),
         avatar_color  = case when avatar_color = '#1C1611' or avatar_color is null
                              then coalesce(ph.avatar_color, avatar_color)
                              else avatar_color end,
         partner_id    = coalesce(partner_id,    ph.partner_id)
   where id = real_id;

  -- birth_date (colonna potenzialmente assente su schemi vecchi)
  begin
    update members r
       set birth_date = coalesce(r.birth_date, ph.birth_date)
     where r.id = real_id and ph.birth_date is not null;
  exception when undefined_column then null; end;

  ---------------------------------------------------------------------
  -- 4. Elimina il placeholder
  ---------------------------------------------------------------------
  delete from members where id = placeholder_id;

  return json_build_object(
    'success', true,
    'merged_into', real_id,
    'removed_placeholder', placeholder_id
  );
end;
$$;

grant execute on function merge_member_into(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ESECUZIONE IMMEDIATA per il caso di Raffael (i due Rex)
-- ---------------------------------------------------------------------
-- Decommenta e sostituisci gli UUID con quelli reali della tua famiglia.
-- Per trovarli:
--   select id, name, user_id, status, created_at
--     from members
--     where family_id in (select id from families where created_by = auth.uid())
--       and lower(name) = 'rex'
--     order by user_id nulls first, created_at;
-- Il primo (user_id NULL) è il placeholder; il secondo (user_id NOT NULL)
-- è il Rex reale con account Google.
--
-- select merge_member_into(
--   'PLACEHOLDER_UUID_HERE'::uuid,
--   'REAL_UUID_HERE'::uuid
-- );
