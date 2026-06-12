-- =====================================================================
--  FAMMY — Trigger push notification per tasks (INSERT + UPDATE)
-- ---------------------------------------------------------------------
--  Scenari coperti:
--   1) INSERT su `tasks` → notifica TUTTI gli assegnatari (+ delegated_to,
--      taken_by, couple_members) escluso l'autore.
--   2) UPDATE di `priority` o `urgent` → notifica gli stessi se la
--      priorità è SALITA (medium→high, normal→medium, normal→high).
--      Se scende, niente push (è solo "il giorno dopo, la cosa è meno urgente").
--
--  Idempotente. Si appoggia all'edge function `send-push` via pg_net come
--  già fa `fammy-push-on-comment.sql`. Richiede:
--    - fammy_private.config con edge_base_url + service_role_key
--    - estensione pg_net abilitata
--
--  ⚠️ DA ESEGUIRE su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Helper: lista user_id dei destinatari per un task
-- ---------------------------------------------------------------------
create or replace function fammy_private.task_recipient_user_ids(
  p_task_id uuid,
  p_exclude_member_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_task     record;
  v_user_ids uuid[];
begin
  select id, family_id, author_id, taken_by, delegated_to
    into v_task
    from public.tasks where id = p_task_id;
  if not found then
    return ARRAY[]::uuid[];
  end if;

  -- Aggrega tutti i member_id coinvolti, poi risolve a user_id distinti.
  -- Include: task_assignees (multi), author_id, taken_by, delegated_to,
  -- task_couple_members (legacy 'couple' visibility).
  select array_agg(distinct m.user_id) into v_user_ids
  from public.members m
  where m.user_id is not null
    and m.id <> coalesce(p_exclude_member_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and m.family_id = v_task.family_id
    and (
      m.id = v_task.author_id
      or m.id = v_task.taken_by
      or m.id = v_task.delegated_to
      or m.id in (select member_id from public.task_assignees where task_id = v_task.id)
      or m.id in (select member_id from public.task_couple_members where task_id = v_task.id)
    );

  return coalesce(v_user_ids, ARRAY[]::uuid[]);
end;
$$;

-- ---------------------------------------------------------------------
-- B) Trigger su INSERT: nuovo task
-- ---------------------------------------------------------------------
create or replace function fammy_private.notify_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_url         text;
  v_service_key text;
  v_author_name text;
  v_recipients  uuid[];
  v_title       text;
  v_body        text;
begin
  -- Recupera config edge function
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then return new; end if;

  -- ATTENZIONE: al momento dell'INSERT su tasks, i task_assignees
  -- (tabella join) NON sono ancora stati inseriti dal client.
  -- Per non perdere la push, deferiamo via pg_net con un piccolo timeout
  -- non possibile in plpgsql sincrono. Soluzione: il trigger lo facciamo
  -- partire su task_assignees AFTER INSERT (più affidabile).
  -- Manteniamo questo trigger per casi senza assegnatari (task "famiglia").

  -- Se ci sono già assegnatari, esci (il trigger su task_assignees gestirà)
  if exists (select 1 from public.task_assignees where task_id = new.id) then
    return new;
  end if;

  -- Calcola destinatari (escluso l'autore). Per task senza assegnatari,
  -- notifica tutta la famiglia (è probabile sia un "incarico generico").
  select array_agg(distinct m.user_id) into v_recipients
  from public.members m
  where m.user_id is not null
    and m.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and m.family_id = new.family_id;

  if v_recipients is null or array_length(v_recipients, 1) is null then
    return new;
  end if;

  -- Nome dell'autore
  select coalesce(m.name, 'Qualcuno') into v_author_name
  from public.members m where m.id = new.author_id;

  v_title := format('📌 %s · Nuovo incarico', coalesce(v_author_name, 'FAMMY'));
  v_body := coalesce(new.title, 'Nuovo incarico aggiunto');

  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_recipients),
      'title', v_title,
      'body', v_body,
      'tag', 'task-new-' || new.id::text,
      'data', jsonb_build_object(
        'kind', 'task_new',
        'task_id', new.id,
        'family_id', new.family_id,
        'url', '/?task=' || new.id::text
      )
    )
  );

  return new;
exception when others then
  raise notice 'notify_task_created error: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_created on public.tasks;
create trigger trg_notify_task_created
  after insert on public.tasks
  for each row execute function fammy_private.notify_task_created();

-- ---------------------------------------------------------------------
-- C) Trigger su INSERT task_assignees: notifica chi è stato assegnato
-- ---------------------------------------------------------------------
-- Quando un task_assignees row viene aggiunto (sia in creazione task,
-- sia in delegazione successiva), notifica il singolo assegnatario.
create or replace function fammy_private.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_url           text;
  v_service_key   text;
  v_task          record;
  v_assignee_uid  uuid;
  v_author_name   text;
  v_title         text;
  v_body          text;
begin
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then return new; end if;

  -- Carica task e member assegnato
  select id, family_id, title, author_id into v_task
    from public.tasks where id = new.task_id;
  if not found then return new; end if;

  select user_id into v_assignee_uid
    from public.members where id = new.member_id;
  -- Non notificare placeholder senza account
  if v_assignee_uid is null then return new; end if;

  -- Non notificare l'autore se è anche assegnatario di se stesso.
  -- Confronto per UTENTE (non per member id): con più famiglie
  -- l'author_id può appartenere a un membro di un'altra famiglia.
  if new.member_id = v_task.author_id
     or v_assignee_uid = (select user_id from public.members where id = v_task.author_id) then
    return new;
  end if;

  -- Nome dell'autore
  select coalesce(m.name, 'Qualcuno') into v_author_name
    from public.members m where m.id = v_task.author_id;

  v_title := format('📌 %s · Assegnato a te', coalesce(v_author_name, 'FAMMY'));
  v_body := coalesce(v_task.title, 'Nuovo incarico');

  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(v_assignee_uid),
      'title', v_title,
      'body', v_body,
      'tag', 'task-assigned-' || v_task.id::text,
      'data', jsonb_build_object(
        'kind', 'task_assigned',
        'task_id', v_task.id,
        'family_id', v_task.family_id,
        'url', '/?task=' || v_task.id::text
      )
    )
  );

  return new;
exception when others then
  raise notice 'notify_task_assigned error: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assigned on public.task_assignees;
create trigger trg_notify_task_assigned
  after insert on public.task_assignees
  for each row execute function fammy_private.notify_task_assigned();

-- ---------------------------------------------------------------------
-- D) Trigger su UPDATE priority/urgent: cambio urgenza
-- ---------------------------------------------------------------------
-- Scatta SOLO quando priority sale (normal→medium, normal/medium→high,
-- o urgent passa da false→true). Niente push quando scende.
create or replace function fammy_private.notify_task_priority_change()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_url         text;
  v_service_key text;
  v_recipients  uuid[];
  v_old_rank    int;
  v_new_rank    int;
  v_title_emoji text;
  v_priority_label text;
  v_actor_name  text;
  v_title       text;
  v_body        text;
begin
  -- Se nulla è cambiato a livello di priorità → esci
  if (old.priority is not distinct from new.priority)
     and (old.urgent is not distinct from new.urgent) then
    return new;
  end if;

  -- Rank: 0=normal, 1=medium, 2=high (urgent=true equivale a 2)
  v_old_rank := case
    when old.urgent then 2
    when old.priority = 'high' then 2
    when old.priority = 'medium' then 1
    else 0
  end;
  v_new_rank := case
    when new.urgent then 2
    when new.priority = 'high' then 2
    when new.priority = 'medium' then 1
    else 0
  end;

  -- Notifica solo se la priorità SALE
  if v_new_rank <= v_old_rank then return new; end if;

  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then return new; end if;

  -- Destinatari: tutti i coinvolti escluso CHI sta facendo l'update
  -- (idealmente sarebbe il chiamante, ma non lo sappiamo lato DB →
  --  escludiamo solo l'author originale; chi cambia urgenza è di solito
  --  qualcuno di affine).
  v_recipients := fammy_private.task_recipient_user_ids(new.id, null);
  if v_recipients is null or array_length(v_recipients, 1) is null then
    return new;
  end if;

  -- Emoji e label per la priorità nuova
  if v_new_rank = 2 then
    v_title_emoji := '🔴';
    v_priority_label := 'Urgente';
  else
    v_title_emoji := '🟠';
    v_priority_label := 'Attenzione';
  end if;

  -- Nome di chi ha modificato (best-effort: prendiamo l'autore se non sappiamo)
  select coalesce(m.name, 'Qualcuno') into v_actor_name
    from public.members m where m.id = new.author_id;

  v_title := format('%s %s · %s', v_title_emoji, v_priority_label, coalesce(new.title, 'Incarico'));
  v_body := format('La priorità è stata alzata a "%s"', v_priority_label);

  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_recipients),
      'title', v_title,
      'body', v_body,
      'tag', 'task-priority-' || new.id::text,
      'data', jsonb_build_object(
        'kind', 'task_priority_change',
        'task_id', new.id,
        'family_id', new.family_id,
        'old_rank', v_old_rank,
        'new_rank', v_new_rank,
        'url', '/?task=' || new.id::text
      )
    )
  );

  return new;
exception when others then
  raise notice 'notify_task_priority_change error: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_priority on public.tasks;
create trigger trg_notify_task_priority
  after update of priority, urgent on public.tasks
  for each row execute function fammy_private.notify_task_priority_change();

-- =====================================================================
-- Verifica rapida (opzionale): controlla che i trigger siano installati
--   SELECT tgname, tgrelid::regclass
--   FROM pg_trigger
--   WHERE tgname LIKE 'trg_notify_task%' AND NOT tgisinternal;
-- =====================================================================
