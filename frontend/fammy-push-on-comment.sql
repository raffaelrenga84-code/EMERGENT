-- =====================================================================
--  FAMMY — Trigger push notification per task_responses (chat / commenti)
-- ---------------------------------------------------------------------
--  Ogni volta che qualcuno scrive un messaggio in una chat di un task,
--  invia una push notification a TUTTI i membri coinvolti nel task
--  (assignee + author + delegated_to + couple members), escluso l'autore.
--
--  Funziona via pg_net che chiama l'edge function send-push con la
--  service_role_key salvata in fammy_private.config.
--
--  Idempotente.
-- =====================================================================

create or replace function fammy_private.notify_task_response()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_url           text;
  v_service_key   text;
  v_task          record;
  v_author        record;
  v_author_name   text;
  v_recipients    uuid[];
  v_title         text;
  v_body          text;
  v_task_title    text;
begin
  -- Solo i messaggi "veri" (skipiamo system/log)
  if new.type is not null and new.type not in ('comment', 'message', 'reply') then
    return new;
  end if;

  -- Config edge function: senza, esci silenziosamente
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    return new;
  end if;

  -- Recupera task + family_id
  select id, family_id, title, author_id, taken_by, delegated_to
    into v_task
    from public.tasks where id = new.task_id;
  if not found then return new; end if;

  -- Nome dell'autore del messaggio (per il titolo notifica)
  select id, name, user_id into v_author from public.members where id = new.author_id;
  v_author_name := coalesce(v_author.name, 'Qualcuno');

  -- Costruisci la lista destinatari: tutti i member coinvolti nel task,
  -- escluso l'autore del messaggio. Include:
  --   - author_id del task
  --   - taken_by (chi se ne occupa)
  --   - delegated_to (delegato)
  --   - task_couple_members (assignees multipli)
  select array_agg(distinct m.user_id) into v_recipients
  from public.members m
  where m.user_id is not null
    and m.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and m.family_id = v_task.family_id
    and (
      m.id = v_task.author_id
      or m.id = v_task.taken_by
      or m.id = v_task.delegated_to
      or m.id in (select member_id from public.task_couple_members where task_id = v_task.id)
    );

  -- Se nessun destinatario, esci silenziosamente
  if v_recipients is null or array_length(v_recipients, 1) is null then
    return new;
  end if;

  -- Costruisci payload notifica
  v_task_title := coalesce(v_task.title, 'Incarico');
  v_title := format('💬 %s · %s', v_author_name, v_task_title);
  -- Limita il body a 120 char per le push (alcuni browser tagliano oltre)
  v_body := substring(coalesce(new.text, '') from 1 for 120);
  if length(coalesce(new.text, '')) > 120 then
    v_body := v_body || '…';
  end if;

  -- Fire-and-forget verso l'edge function send-push
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
      'tag', 'task-chat-' || v_task.id::text,
      'data', jsonb_build_object(
        'kind', 'task_comment',
        'task_id', v_task.id,
        'family_id', v_task.family_id,
        'response_id', new.id,
        'url', '/?task=' || v_task.id::text
      )
    )
  );

  return new;
exception
  -- Se per qualche motivo pg_net fallisce, NON bloccare l'INSERT del messaggio
  when others then
    raise notice 'fammy_private.notify_task_response error: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_notify_task_response on public.task_responses;
create trigger trg_notify_task_response
  after insert on public.task_responses
  for each row execute function fammy_private.notify_task_response();
