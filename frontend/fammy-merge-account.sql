-- =====================================================================
--  FAMMY — Merge Account
-- ---------------------------------------------------------------------
--  Permette di fondere DUE auth.users (che rappresentano la stessa
--  persona reale, es. login Google + login Phone) in UN unico account,
--  preservando tutti i dati: famiglie, task, eventi, spese, assenze,
--  push subscriptions, preferenze.
--
--  Flow:
--    1. L'utente A (loggato → vuole "essere" l'account finale) chiede
--       di assorbire l'account B.
--    2. Il frontend logga temporaneamente B (via OTP) e chiama
--       fammy_set_merge_target(A_uid) → crea record in fammy_merge_requests.
--    3. Il frontend rilogga A e chiama fammy_execute_merge() → migra
--       tutto da B ad A e cancella B.
--
--  Idempotente.
-- =====================================================================

-- 1) Tabella delle richieste di merge (one-shot, scadono in 10 min)
create table if not exists fammy_merge_requests (
  source_user_id uuid primary key references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now()
);

alter table fammy_merge_requests enable row level security;

-- L'utente vede solo le richieste che CONFERMERÀ (cioè dove lui è il target).
-- L'utente può creare/aggiornare solo richieste in cui lui è la SOURCE.
drop policy if exists "merge_req_select" on fammy_merge_requests;
create policy "merge_req_select" on fammy_merge_requests for select
  to authenticated using (target_user_id = auth.uid() or source_user_id = auth.uid());

drop policy if exists "merge_req_insert_self" on fammy_merge_requests;
create policy "merge_req_insert_self" on fammy_merge_requests for insert
  to authenticated with check (source_user_id = auth.uid());

drop policy if exists "merge_req_delete_own" on fammy_merge_requests;
create policy "merge_req_delete_own" on fammy_merge_requests for delete
  to authenticated using (source_user_id = auth.uid() or target_user_id = auth.uid());


-- 2) RPC: fammy_set_merge_target (chiamata MENTRE LOGGATO COME B)
--    Crea/aggiorna la richiesta: "Sono B, voglio essere assorbito da A."
create or replace function fammy_set_merge_target(p_target uuid)
returns void language plpgsql security invoker as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target is null or p_target = auth.uid() then
    raise exception 'invalid_target';
  end if;

  insert into fammy_merge_requests (source_user_id, target_user_id, created_at)
  values (auth.uid(), p_target, now())
  on conflict (source_user_id) do update set
    target_user_id = excluded.target_user_id,
    created_at = excluded.created_at;
end;
$$;
grant execute on function fammy_set_merge_target(uuid) to authenticated;


-- 3) RPC: fammy_execute_merge (chiamata MENTRE LOGGATO COME A, target finale)
--    Esegue la migrazione di tutti i dati da B ad A. Funzione SECURITY DEFINER
--    perché deve toccare tabelle anche di B.
create or replace function fammy_execute_merge()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_source        uuid;
  v_member_b      record;
  v_member_a_id   uuid;
  v_members_moved int := 0;
  v_members_dedup int := 0;
  v_absences_moved int := 0;
  v_pushes_moved   int := 0;
  v_prefs_moved    int := 0;
  v_email_b        text;
  v_phone_b        text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Cerca una merge request valida indirizzata a me
  select source_user_id into v_source
  from fammy_merge_requests
  where target_user_id = auth.uid()
    and created_at > now() - interval '15 minutes'
  limit 1;

  if v_source is null then
    raise exception 'no_pending_merge';
  end if;

  -- Recupero email/phone di B per restituirli in response (debug + UI)
  select email, phone into v_email_b, v_phone_b
  from auth.users where id = v_source;

  -- ============================================================
  -- Migra i `members` di B verso A, gestendo il caso di conflitto
  -- (stesso family_id già occupato da A).
  -- ============================================================
  for v_member_b in
    select * from public.members where user_id = v_source
  loop
    -- Cerca se A ha già un member in quella famiglia
    select id into v_member_a_id
    from public.members
    where family_id = v_member_b.family_id
      and user_id = auth.uid()
    limit 1;

    if v_member_a_id is not null then
      -- CONFLITTO: A e B sono entrambi member della stessa famiglia.
      -- Sposta tutti i riferimenti dal member di B al member di A,
      -- poi elimina il member di B.
      update public.tasks    set author_id = v_member_a_id where author_id = v_member_b.id;
      update public.tasks    set taken_by  = v_member_a_id where taken_by  = v_member_b.id;
      update public.tasks    set delegated_to = v_member_a_id where delegated_to = v_member_b.id;
      update public.events   set created_by = v_member_a_id where created_by = v_member_b.id;
      update public.expenses set paid_by = v_member_a_id where paid_by = v_member_b.id;
      update public.expenses set created_by = v_member_a_id where created_by = v_member_b.id;
      -- task_responses
      update public.task_responses set author_id = v_member_a_id where author_id = v_member_b.id;
      -- task_couple_members (potenziale unique constraint)
      delete from public.task_couple_members
        where member_id = v_member_b.id
          and task_id in (select task_id from public.task_couple_members where member_id = v_member_a_id);
      update public.task_couple_members set member_id = v_member_a_id where member_id = v_member_b.id;
      -- expense_shares
      delete from public.expense_shares
        where member_id = v_member_b.id
          and expense_id in (select expense_id from public.expense_shares where member_id = v_member_a_id);
      update public.expense_shares set member_id = v_member_a_id where member_id = v_member_b.id;
      -- expense_payments (FK composita)
      update public.expense_payments set member_id = v_member_a_id where member_id = v_member_b.id;
      -- task_attachments (uploaded_by riferisce auth.users se esiste questo campo)
      begin
        execute 'update public.task_attachments set uploaded_by = $1 where uploaded_by = $2'
          using auth.uid(), v_source;
      exception when undefined_column then null; -- la tabella potrebbe non avere il campo
      end;
      delete from public.members where id = v_member_b.id;
      v_members_dedup := v_members_dedup + 1;
    else
      -- Nessun conflitto: A NON è ancora member di questa famiglia.
      -- Aggiorna semplicemente user_id su quel member.
      update public.members set user_id = auth.uid() where id = v_member_b.id;
      v_members_moved := v_members_moved + 1;
    end if;
  end loop;

  -- Migra absences (user_id → auth.users)
  begin
    update public.absences set user_id = auth.uid() where user_id = v_source;
    get diagnostics v_absences_moved = row_count;
  exception when undefined_table then null;
  end;

  -- Migra push_subscriptions
  begin
    update public.push_subscriptions set user_id = auth.uid() where user_id = v_source;
    get diagnostics v_pushes_moved = row_count;
  exception when undefined_table then null;
  end;

  -- Migra user_preferences (gestire conflitto su PK user_id)
  begin
    -- Se A non ha ancora prefs, sposta quelle di B
    update public.user_preferences set user_id = auth.uid()
      where user_id = v_source
        and not exists (select 1 from public.user_preferences where user_id = auth.uid());
    get diagnostics v_prefs_moved = row_count;
    -- Pulisci eventuali residui di B
    delete from public.user_preferences where user_id = v_source;
  exception when undefined_table then null;
  end;

  -- Copia il phone su A se A non ne ha uno
  update public.profiles
    set phone = coalesce(public.profiles.phone, v_phone_b)
    where id = auth.uid();

  -- Cancella le merge_requests (prima della DELETE di auth.users per FK)
  delete from fammy_merge_requests where source_user_id = v_source;

  -- Cancella il profilo di B (cascade su tutto ciò che è ancora user_id=B)
  delete from public.profiles where id = v_source;

  -- Cancella l'utente B in auth (CASCADE sulle FK rimanenti)
  delete from auth.users where id = v_source;

  return jsonb_build_object(
    'ok', true,
    'source_user_id', v_source,
    'source_email', v_email_b,
    'source_phone', v_phone_b,
    'members_moved', v_members_moved,
    'members_dedup', v_members_dedup,
    'absences_moved', v_absences_moved,
    'pushes_moved', v_pushes_moved,
    'prefs_moved', v_prefs_moved
  );
end;
$$;
grant execute on function fammy_execute_merge() to authenticated;


-- 4) RPC: fammy_cancel_merge — annulla una richiesta in sospeso (cleanup)
create or replace function fammy_cancel_merge()
returns void language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from fammy_merge_requests
    where source_user_id = auth.uid() or target_user_id = auth.uid();
end;
$$;
grant execute on function fammy_cancel_merge() to authenticated;
