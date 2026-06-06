-- =====================================================================
--  FAMMY — Notifiche push quando arriva un nuovo feedback
-- ---------------------------------------------------------------------
--  Trigger AFTER INSERT su feedback_log che invia push notification
--  agli admin (Raffael, Rex) usando l'edge function `send-push`.
--
--  Usa la config in fammy_private.config (edge_base_url + service_role_key)
--  già impostata per gli altri trigger push.
--
--  Idempotente.
-- =====================================================================

create or replace function fammy_private.notify_new_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
declare
  v_url           text;
  v_service_key   text;
  v_admin_user_ids uuid[];
  v_title         text;
  v_body          text;
  v_rating_emoji  text;
  v_author_label  text;
begin
  -- Config edge function: senza, esci silenziosamente
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    return new;
  end if;

  -- Lista user_id admin (whitelist email, stessa di is_fammy_admin())
  select array_agg(id) into v_admin_user_ids
    from auth.users
    where lower(coalesce(email, '')) in (
      'raffael.renga84@gmail.com',
      'rjphillpott@gmail.com'
    );

  if v_admin_user_ids is null or array_length(v_admin_user_ids, 1) is null then
    return new;
  end if;

  -- Emoji rating
  v_rating_emoji := case
    when new.rating >= 5 then '🥰'
    when new.rating >= 4 then '🙂'
    when new.rating >= 3 then '😐'
    when new.rating >= 2 then '😕'
    when new.rating >= 1 then '😞'
    else '💬'
  end;

  -- Autore (rispetta anonimato)
  if new.is_anonymous then
    v_author_label := 'Anonimo';
  else
    select coalesce(display_name, 'Utente') into v_author_label
      from public.profiles where id = new.user_id;
    v_author_label := coalesce(v_author_label, 'Utente');
  end if;

  v_title := format('%s Nuovo feedback FAMMY', v_rating_emoji);
  -- Body: include autore (o "Anonimo") + preview messaggio (max 120 char)
  v_body := v_author_label;
  if new.message is not null and length(trim(new.message)) > 0 then
    v_body := v_body || ' · ' || substring(new.message from 1 for 120);
    if length(new.message) > 120 then
      v_body := v_body || '…';
    end if;
  end if;

  -- Fire-and-forget verso send-push (TUTTI gli admin in un solo invio)
  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_admin_user_ids),
      'title', v_title,
      'body', v_body,
      'tag', 'feedback-' || new.id::text,
      'data', jsonb_build_object(
        'kind', 'feedback',
        'feedback_id', new.id,
        'url', '/?inbox=feedback'
      )
    )
  );

  return new;
exception when others then
  -- Niente errori bloccanti: il feedback DEVE essere salvato anche se la
  -- notifica fallisce.
  raise notice 'fammy_private.notify_new_feedback error: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_feedback on public.feedback_log;
create trigger trg_notify_new_feedback
  after insert on public.feedback_log
  for each row execute function fammy_private.notify_new_feedback();
