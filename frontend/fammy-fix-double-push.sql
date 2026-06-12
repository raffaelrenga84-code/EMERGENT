-- =====================================================================
--  FAMMY — FIX doppia notifica "Nuovo incarico" + "Assegnato a te"
-- ---------------------------------------------------------------------
--  Problema: alla creazione di un task con assegnatario, l'assegnatario
--  riceveva DUE push (Nuovo incarico + Assegnato a te). Il trigger su
--  tasks non può escludere gli assegnatari perché vengono inseriti DOPO.
--  Soluzione: il trigger ACCODA la notifica in una tabella; la edge
--  function task-reminder-push (cron ogni minuto) la invia dopo ~45s,
--  quando gli assegnatari sono noti, ESCLUDENDOLI (loro ricevono già
--  "Assegnato a te" dall'altro trigger, che resta immediato).
--  ⚠️ PREREQUISITO: ri-deploya prima la edge function `task-reminder-push`
--     aggiornata (processa la coda).
--  Idempotente. Esegui su: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

-- 1) Coda notifiche "Nuovo incarico" (solo service_role: RLS senza policy)
create table if not exists public.task_notify_queue (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.task_notify_queue enable row level security;

-- 2) Il trigger ora accoda invece di inviare subito
create or replace function fammy_private.notify_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, fammy_private
as $$
begin
  insert into public.task_notify_queue(task_id) values (new.id)
  on conflict do nothing;
  return new;
exception when others then
  raise notice 'notify_task_created error: %', sqlerrm;
  return new;
end;
$$;

-- (il trigger trg_notify_task_created su tasks resta invariato e ora
--  esegue la nuova versione della funzione)

-- 3) FIX "Assegnato a te" anche all'autore (caso multi-famiglia):
--    il confronto era per member id, ma con più famiglie l'author_id può
--    appartenere a un membro di un'altra famiglia → confronto per UTENTE.
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

  select id, family_id, title, author_id into v_task
    from public.tasks where id = new.task_id;
  if not found then return new; end if;

  select user_id into v_assignee_uid
    from public.members where id = new.member_id;
  if v_assignee_uid is null then return new; end if;

  -- Non notificare l'autore se è anche assegnatario di se stesso
  -- (confronto per UTENTE, non per member id)
  if new.member_id = v_task.author_id
     or v_assignee_uid = (select user_id from public.members where id = v_task.author_id) then
    return new;
  end if;

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

notify pgrst, 'reload schema';

-- VERIFICA — deve restituire 1 riga (la tabella esiste)
select tablename from pg_tables where tablename = 'task_notify_queue';
