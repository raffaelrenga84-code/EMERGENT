-- =====================================================================
-- FAMMY — RESTORE part 3 of 3 (dopo reset accidentale)
-- ESEGUI IN ORDINE: 1 → 2 → 3
-- Idempotente: rilanciabile senza danni
-- =====================================================================

-- BLOCCO: fammy-chat-enhancements.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Chat enhancements (reply, edit, delete)
-- ---------------------------------------------------------------------
--  Aggiunge a task_responses:
--   - reply_to_id  → ref al messaggio a cui si risponde (WhatsApp-style)
--   - edited_at    → timestamp ultima modifica (mostra "(modificato)" in UI)
--  + RPC sicure per UPDATE/DELETE del proprio messaggio (RLS-friendly).
--  Idempotente.
-- =====================================================================

alter table public.task_responses
  add column if not exists reply_to_id uuid references public.task_responses(id) on delete set null,
  add column if not exists edited_at timestamptz;

create index if not exists task_responses_reply_to_idx
  on public.task_responses(reply_to_id);

-- RPC: aggiorna il testo del proprio messaggio.
-- Usa security invoker → l'utente DEVE essere autore del messaggio
-- (verifica via members.user_id = auth.uid()).
create or replace function fammy_update_response(p_id uuid, p_text text)
returns void language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_text is null or length(trim(p_text)) = 0 then
    raise exception 'empty_text';
  end if;

  update public.task_responses
    set text = p_text, edited_at = now()
    where id = p_id
      and author_id in (select id from public.members where user_id = auth.uid())
      and (type is null or type in ('comment', 'message', 'reply'));
end;
$$;
grant execute on function fammy_update_response(uuid, text) to authenticated;

-- RPC: elimina il proprio messaggio.
create or replace function fammy_delete_response(p_id uuid)
returns void language plpgsql security invoker as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.task_responses
    where id = p_id
      and author_id in (select id from public.members where user_id = auth.uid())
      and (type is null or type in ('comment', 'message', 'reply'));
end;
$$;
grant execute on function fammy_delete_response(uuid) to authenticated;


-- ============================================================
-- BLOCCO: fammy-expense-categories.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Categoria per le spese (con icone)
-- ---------------------------------------------------------------------
--  Aggiunge colonna `category` opzionale a `expenses`.
--  Valori canonici (frontend mappa a icone/colori):
--   - groceries  🛒  supermercato, alimentari
--   - bills      💡  bollette, utenze
--   - school     🎒  scuola, asilo
--   - home       🏠  casa, manutenzione
--   - health     🩺  salute, medico, farmaci
--   - transport  🚗  trasporti, carburante
--   - leisure    🎉  svago, ristoranti
--   - other      💶  altro (default)
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

alter table public.expenses
  add column if not exists category text;

comment on column public.expenses.category is
  'Categoria opzionale: groceries|bills|school|home|health|transport|leisure|other';

create index if not exists idx_expenses_category on public.expenses(category);


-- ============================================================
-- BLOCCO: fammy-expense-partial-payments.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Pagamenti parziali sulle quote spese
-- ---------------------------------------------------------------------
--  Estende `expense_shares` con `paid_amount` per supportare il caso
--  "ti devo 50€, oggi te ne do 10, fra una settimana altri 15…".
--  La share è considerata SALDATA quando paid_amount >= amount.
--
--  Per non perdere lo storico dei pagamenti parziali, la tabella
--  `expense_payments` registra ogni versamento (chi, quando, quanto)
--  e un trigger aggiorna automaticamente paid_amount + settled sulla
--  share corrispondente.
--
--  IDEMPOTENTE: può essere ri-eseguita senza errori.
-- =====================================================================

-- 1) Colonna paid_amount sulla share (default 0)
alter table expense_shares
  add column if not exists paid_amount numeric(10,2) not null default 0
    check (paid_amount >= 0);

-- 2) Tabella dei pagamenti parziali (storico)
create table if not exists expense_payments (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null,
  member_id    uuid not null,
  amount       numeric(10,2) not null check (amount > 0),
  note         text,
  paid_at      timestamptz not null default now(),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  -- FK composita sulla share (cascade se la share viene eliminata)
  constraint fk_expense_payments_share
    foreign key (expense_id, member_id)
    references expense_shares(expense_id, member_id)
    on delete cascade
);

create index if not exists idx_expense_payments_share
  on expense_payments(expense_id, member_id);
create index if not exists idx_expense_payments_paid_at
  on expense_payments(paid_at desc);

alter table expense_payments enable row level security;

drop policy if exists "expense_payments_rw" on expense_payments;
create policy "expense_payments_rw" on expense_payments for all
  using (exists (select 1 from expenses e
                  where e.id = expense_id
                    and is_family_member(e.family_id)))
  with check (exists (select 1 from expenses e
                       where e.id = expense_id
                         and is_family_member(e.family_id)));

-- 3) Trigger: dopo INSERT/DELETE su expense_payments aggiorna paid_amount
--    + settled sulla share corrispondente. La share è settled quando
--    paid_amount >= amount (tolleranza 1 centesimo per arrotondamenti).
create or replace function fammy_recalc_share_paid()
returns trigger language plpgsql as $$
declare
  v_expense_id uuid;
  v_member_id  uuid;
  v_total      numeric(10,2);
  v_amount     numeric(10,2);
begin
  v_expense_id := coalesce(new.expense_id, old.expense_id);
  v_member_id  := coalesce(new.member_id,  old.member_id);

  select coalesce(sum(amount), 0) into v_total
    from expense_payments
    where expense_id = v_expense_id and member_id = v_member_id;

  select amount into v_amount
    from expense_shares
    where expense_id = v_expense_id and member_id = v_member_id;

  if v_amount is null then
    return coalesce(new, old);
  end if;

  update expense_shares set
    paid_amount = v_total,
    settled     = (v_total + 0.01 >= v_amount),
    settled_at  = case when (v_total + 0.01 >= v_amount) then now() else null end
    where expense_id = v_expense_id and member_id = v_member_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalc_share_paid on expense_payments;
create trigger trg_recalc_share_paid
  after insert or delete or update on expense_payments
  for each row execute function fammy_recalc_share_paid();

-- 4) Backfill: imposta paid_amount = amount sulle share già settled,
--    così le card "saldate" pre-esistenti mostrano 100% nel progress.
update expense_shares
  set paid_amount = amount
  where settled = true and paid_amount = 0;


-- ============================================================
-- BLOCCO: fammy-push-notifications.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Push Notifications ad app chiusa (Web Push + pg_cron)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente. NON inserire qui le VAPID keys: vanno nei Supabase Secrets.

-- 1) Tabella subscriptions: una per (user, browser/device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Gli utenti possono leggere/scrivere SOLO le proprie subscription
drop policy if exists "push_subs_self_rw" on public.push_subscriptions;
create policy "push_subs_self_rw" on public.push_subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Estensioni richieste
create extension if not exists pg_cron;
create extension if not exists pg_net;  -- per net.http_post

-- 3) Helper SECURITY DEFINER per richiamare le edge function
-- Le funzioni edge richiedono un Authorization header con il service_role
-- key. Lo leggiamo dal secret `app_service_role_key` (vault o Vault-like).
-- Per semplicita' usiamo un secret salvato in app.settings (modificabile via SQL).

-- Crea uno schema per i secret se non esiste
create schema if not exists fammy_private;

-- Tabella key-value per i config (solo accesso service_role lato Supabase API)
create table if not exists fammy_private.config (
  key text primary key,
  value text not null
);

revoke all on fammy_private.config from public, authenticated, anon;

-- 4) Funzioni helper per scatenare le edge function via pg_net
create or replace function fammy_private.trigger_daily_digest()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_service_key text;
begin
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    raise notice 'fammy: edge_base_url or service_role_key not set, skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/cron-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('kind', 'daily')
  );
end$$;

create or replace function fammy_private.trigger_weekly_summary()
returns void
language plpgsql
security definer
as $$
declare
  v_url text;
  v_service_key text;
begin
  select value into v_url from fammy_private.config where key = 'edge_base_url';
  select value into v_service_key from fammy_private.config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    raise notice 'fammy: edge_base_url or service_role_key not set, skipping';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/cron-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('kind', 'weekly')
  );
end$$;

-- 5) Schedulazione pg_cron (timezone Europe/Rome = UTC+1/+2)
-- 21:00 ora di Roma = 19:00 UTC (estate) / 20:00 UTC (inverno).
-- Per semplicita' usiamo 19:00 UTC tutto l'anno (l'utente puo' aggiustare).
-- Domenica 20:00 UTC = 21:00 / 22:00 ora locale → weekly summary.
--
-- Cancella i job se già esistono (idempotente)
do $$
begin
  perform cron.unschedule('fammy-daily-digest');
  exception when others then null;
end$$;
do $$
begin
  perform cron.unschedule('fammy-weekly-summary');
  exception when others then null;
end$$;

select cron.schedule(
  'fammy-daily-digest',
  '0 19 * * *',     -- tutti i giorni alle 19:00 UTC (≈ 21:00 IT)
  $$ select fammy_private.trigger_daily_digest() $$
);

select cron.schedule(
  'fammy-weekly-summary',
  '0 20 * * 0',     -- domenica alle 20:00 UTC (≈ 22:00 IT)
  $$ select fammy_private.trigger_weekly_summary() $$
);

-- =====================================================================
-- ⚠️ DOPO AVER ESEGUITO QUESTO FILE, devi inserire 2 valori in
--    fammy_private.config (UNA volta sola). Trovi le istruzioni
--    nel commento finale.
-- =====================================================================
--
-- INSERIRE QUESTI VALORI MANUALMENTE (NON committarli in git):
--
--   insert into fammy_private.config (key, value) values
--     ('edge_base_url',     'https://<TUO-PROJECT-REF>.supabase.co'),
--     ('service_role_key',  '<la tua SERVICE_ROLE_KEY da Settings → API>')
--   on conflict (key) do update set value = excluded.value;
--
-- 🔒 La service_role_key dà accesso completo al DB; resta solo in
-- fammy_private.config che è inaccessibile da auth client. La rimozione
-- delle politiche di default (revoke all) garantisce che solo postgres
-- (service_role) e SECURITY DEFINER possano leggerla.


-- ============================================================
-- BLOCCO: fammy-push-on-comment.sql
-- ============================================================
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


-- ============================================================
-- BLOCCO: fammy-push-on-tasks.sql
-- ============================================================
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

  -- Non notificare l'autore se è anche assegnatario di se stesso
  if new.member_id = v_task.author_id then return new; end if;

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


-- ============================================================
-- BLOCCO: fammy-weekly-sync.sql
-- ============================================================
-- ============================================================================
-- FAMMY — Preferenze utente + Weekly Calendar Sync (Iter 17)
--
-- Tabella generica `user_preferences` per memorizzare le preferenze utente
-- (qui usata per il sync settimanale del calendario via email).
--
-- Idempotente: puoi rilanciarla.
-- ============================================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Sync settimanale del calendario via email (.ics)
  weekly_email_sync boolean not null default false,
  -- Ultimo invio (per evitare doppi invii nella stessa settimana)
  weekly_email_last_sent_at timestamptz,
  -- Email destinazione (di default user.email, ma possiamo override)
  email_override text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_preferences_sync_idx
  on public.user_preferences(weekly_email_sync)
  where weekly_email_sync = true;

-- RLS: solo io vedo / modifico le mie preferenze
alter table public.user_preferences enable row level security;

drop policy if exists "Read own prefs" on public.user_preferences;
create policy "Read own prefs" on public.user_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert own prefs" on public.user_preferences;
create policy "Insert own prefs" on public.user_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Update own prefs" on public.user_preferences;
create policy "Update own prefs" on public.user_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger updated_at
create or replace function public.touch_user_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists user_preferences_touch_updated on public.user_preferences;
create trigger user_preferences_touch_updated
  before update on public.user_preferences
  for each row execute function public.touch_user_preferences_updated_at();


-- ============================================================================
-- pg_cron schedule: invocazione settimanale (domenica 18:00 UTC) dell'edge
-- function `weekly-calendar-sync`.
--
-- Richiede:
--   • pg_cron + pg_net abilitati nel progetto Supabase
--   • Tabella fammy_private.config con keys 'project_url' e 'service_role_key'
--     (le hai già configurate per il digest delle push notifications)
-- ============================================================================

do $$
declare
  project_url text;
  service_role_key text;
begin
  select value into project_url from fammy_private.config where key = 'project_url';
  select value into service_role_key from fammy_private.config where key = 'service_role_key';

  if project_url is null or service_role_key is null then
    raise notice 'fammy_private.config non configurato. Skip cron schedule.';
    return;
  end if;

  -- Rimuovi job esistente con lo stesso nome (idempotente)
  perform cron.unschedule('fammy-weekly-calendar-sync')
    where exists (select 1 from cron.job where jobname = 'fammy-weekly-calendar-sync');

  -- Domenica alle 18:00 UTC (= 19:00 ora italiana CET / 20:00 CEST)
  perform cron.schedule(
    'fammy-weekly-calendar-sync',
    '0 18 * * 0',
    format(
      $cron$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      project_url || '/functions/v1/weekly-calendar-sync',
      'Bearer ' || service_role_key
    )
  );
  raise notice '✓ Cron fammy-weekly-calendar-sync schedulato (domenica 18:00 UTC)';
end$$;

-- ============================================================================
-- DONE.
-- ============================================================================


-- ============================================================
-- BLOCCO: fammy-enable-realtime.sql
-- ============================================================
-- FAMMY — Abilita Realtime sulle tabelle che il frontend ascolta
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente: gestisce il caso in cui la tabella sia già nella publication.

-- task_responses: indispensabile per le notifiche "Nuovo commento" in
-- useEventNotifications.jsx. Senza questa riga il `postgres_changes` listener
-- non riceve mai gli INSERT.
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_responses;
  exception when duplicate_object then
    -- già in publication, ok
    null;
  end;
end$$;

-- Belt-and-suspenders: assicura realtime anche su tasks/events/expenses/assignees
-- (servono per le notifiche di nuovi task, urgent, delegated, eventi, auto-refresh).
do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.events;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.expenses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.task_assignees;
  exception when duplicate_object then null;
  end;
end$$;

-- Verifica: vedi quali tabelle sono attualmente pubblicate
-- select schemaname, tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' order by tablename;


-- ============================================================
-- BLOCCO: sql/fammy-add-priority-and-permissions.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Aggiunta priorità task + permessi creator-only delete
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Modifiche:
--   1. Aggiunge colonna `priority` ai task (low / normal / high)
--   2. Aggiunge colonna `created_by` alle expenses (chi ha creato la spesa)
--   3. Aggiorna RLS: solo il creatore può eliminare task / event / expense
-- =====================================================================

-- 1. PRIORITÀ TASK -----------------------------------------------------
-- Semaforo: normal = verde (default), medium = arancio, high = rosso
alter table tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal','medium','high'));

-- Per i task urgenti esistenti, segnali alta priorità
update tasks set priority = 'high' where urgent = true and priority = 'normal';

-- 2. CREATORE SPESA ----------------------------------------------------
alter table expenses
  add column if not exists created_by uuid references members(id) on delete set null;

-- Per spese esistenti che non hanno il creatore, usa paid_by come fallback
update expenses set created_by = paid_by where created_by is null;


-- 3. RLS — DELETE solo per il creatore --------------------------------

-- TASKS
-- La policy esistente "tasks_write" è FOR ALL → la sostituiamo con
-- 4 policy separate (select/insert/update permissive, delete ristretto)
drop policy if exists "tasks_write"  on tasks;
drop policy if exists "tasks_read"   on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_insert" on tasks;
drop policy if exists "tasks_update" on tasks;
drop policy if exists "tasks_delete" on tasks;

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks for select
  using (is_family_member(family_id));

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert
  with check (is_family_member(family_id));

drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- DELETE: solo il creatore (author_id = mio member.id) o se author_id è null
drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks for delete
  using (
    is_family_member(family_id)
    and (
      author_id is null
      or author_id in (select id from members where user_id = auth.uid())
    )
  );


-- EVENTS
drop policy if exists "events_rw"     on events;
drop policy if exists "events_select" on events;
drop policy if exists "events_insert" on events;
drop policy if exists "events_update" on events;
drop policy if exists "events_delete" on events;

drop policy if exists "events_select" on events;
create policy "events_select" on events for select
  using (is_family_member(family_id));

drop policy if exists "events_insert" on events;
create policy "events_insert" on events for insert
  with check (is_family_member(family_id));

drop policy if exists "events_update" on events;
create policy "events_update" on events for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

drop policy if exists "events_delete" on events;
create policy "events_delete" on events for delete
  using (
    is_family_member(family_id)
    and (
      created_by is null
      or created_by in (select id from members where user_id = auth.uid())
    )
  );


-- EXPENSES
drop policy if exists "expenses_rw"     on expenses;
drop policy if exists "expenses_select" on expenses;
drop policy if exists "expenses_insert" on expenses;
drop policy if exists "expenses_update" on expenses;
drop policy if exists "expenses_delete" on expenses;

drop policy if exists "expenses_select" on expenses;
create policy "expenses_select" on expenses for select
  using (is_family_member(family_id));

drop policy if exists "expenses_insert" on expenses;
create policy "expenses_insert" on expenses for insert
  with check (is_family_member(family_id));

drop policy if exists "expenses_update" on expenses;
create policy "expenses_update" on expenses for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

drop policy if exists "expenses_delete" on expenses;
create policy "expenses_delete" on expenses for delete
  using (
    is_family_member(family_id)
    and (
      created_by is null
      or created_by in (select id from members where user_id = auth.uid())
    )
  );

-- =====================================================================
-- FINE
-- =====================================================================


-- ============================================================
-- BLOCCO: sql/fammy-add-push-subscriptions.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Push notifications (Web Push API)
--  Data: 2026-05-10
-- ---------------------------------------------------------------------
--  Tabella per memorizzare gli endpoint Web Push degli utenti, così le
--  Edge Functions possono inviare notifiche anche ad app chiusa.
-- =====================================================================

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

-- RLS
alter table push_subscriptions enable row level security;

-- Ognuno legge/scrive solo i propri endpoint
drop policy if exists "push_subscriptions_own" on push_subscriptions;
create policy "push_subscriptions_own" on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ============================================================
-- BLOCCO: sql/fammy-add-task-attachments.sql
-- ============================================================
-- Create task_attachments table for storing file references
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);

-- RLS Policies: Drop existing policies first, then create them
-- (Policies don't support IF NOT EXISTS in PostgreSQL)
DROP POLICY IF EXISTS "Users can view task attachments in their families" ON task_attachments;
DROP POLICY IF EXISTS "Users can insert task attachments for tasks in their families" ON task_attachments;
DROP POLICY IF EXISTS "Users can delete task attachments they created" ON task_attachments;

drop policy if exists "Users can view task attachments in their families" on task_attachments;
create policy "Users can view task attachments in their families" on task_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

drop policy if exists "Users can insert task attachments for tasks in their families" on task_attachments;
create policy "Users can insert task attachments for tasks in their families" on task_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

drop policy if exists "Users can delete task attachments they created" on task_attachments;
create policy "Users can delete task attachments they created" on task_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

-- Create task-attachments storage bucket (if doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket - Drop and recreate
DROP POLICY IF EXISTS "Users can upload task attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can view task attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete task attachments they have access to" ON storage.objects;

drop policy if exists "Users can upload task attachments in their families" on storage.objects;
create policy "Users can upload task attachments in their families" on storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-attachments' AND
    auth.role() = 'authenticated'
  );

drop policy if exists "Users can view task attachments in their families" on storage.objects;
create policy "Users can view task attachments in their families" on storage.objects FOR SELECT
  USING (
    bucket_id = 'task-attachments' AND
    EXISTS (
      SELECT 1 FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ta.file_path = storage.objects.name
    )
  );

drop policy if exists "Users can delete task attachments they have access to" on storage.objects;
create policy "Users can delete task attachments they have access to" on storage.objects FOR DELETE
  USING (
    bucket_id = 'task-attachments' AND
    EXISTS (
      SELECT 1 FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ta.file_path = storage.objects.name
    )
  );


-- ============================================================
-- BLOCCO: sql/fammy-add-expense-attachments.sql
-- ============================================================
-- Create expense_attachments table for storing file references
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_path VARCHAR NOT NULL,
  file_name VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id);

-- RLS Policies: Drop existing policies first, then create them
-- (Policies don't support IF NOT EXISTS in PostgreSQL)
DROP POLICY IF EXISTS "Users can view expense attachments in their families" ON expense_attachments;
DROP POLICY IF EXISTS "Users can insert expense attachments for expenses in their families" ON expense_attachments;
DROP POLICY IF EXISTS "Users can delete expense attachments they have access to" ON expense_attachments;

drop policy if exists "Users can view expense attachments in their families" on expense_attachments;
create policy "Users can view expense attachments in their families" on expense_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

drop policy if exists "Users can insert expense attachments for expenses in their families" on expense_attachments;
create policy "Users can insert expense attachments for expenses in their families" on expense_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

drop policy if exists "Users can delete expense attachments they have access to" on expense_attachments;
create policy "Users can delete expense attachments they have access to" on expense_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

-- Create expense-attachments storage bucket (if doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-attachments', 'expense-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket - Drop and recreate
DROP POLICY IF EXISTS "Users can upload expense attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can view expense attachments in their families" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete expense attachments they have access to" ON storage.objects;

drop policy if exists "Users can upload expense attachments in their families" on storage.objects;
create policy "Users can upload expense attachments in their families" on storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-attachments' AND
    auth.role() = 'authenticated'
  );

drop policy if exists "Users can view expense attachments in their families" on storage.objects;
create policy "Users can view expense attachments in their families" on storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-attachments' AND
    EXISTS (
      SELECT 1 FROM expense_attachments ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ea.file_path = storage.objects.name
    )
  );

drop policy if exists "Users can delete expense attachments they have access to" on storage.objects;
create policy "Users can delete expense attachments they have access to" on storage.objects FOR DELETE
  USING (
    bucket_id = 'expense-attachments' AND
    EXISTS (
      SELECT 1 FROM expense_attachments ea
      JOIN expenses e ON ea.expense_id = e.id
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND ea.file_path = storage.objects.name
    )
  );


-- ============================================================
-- BLOCCO: sql/fammy-add-delegated-from.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Snapshot assegnatari originali per ripristino "Ho un imprevisto"
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Quando un membro clicca "Me ne occupo io (rendilo solo mio)" su un task
--  condiviso con più persone, gli altri assegnatari vengono rimossi.
--  Se poi quello stesso membro clicca "Ho un imprevisto", senza questa
--  colonna la lista originale è persa per sempre.
--
--  delegated_from contiene gli ID dei members assegnati AL MOMENTO del claim,
--  così al "Ho un imprevisto" possiamo ripristinarli.
-- =====================================================================

alter table tasks
  add column if not exists delegated_from uuid[];

comment on column tasks.delegated_from is
  'Snapshot degli ID member assegnatari prima di un claim solo-mio. Usato per ripristinare la lista al "Ho un imprevisto".';


-- ============================================================
-- BLOCCO: sql/fammy-add-delegated-to.sql
-- ============================================================
-- =====================================================================
--  FAMMY — "Lo fai tu?" delega come INVITO (non imposizione)
--  Data: 2026-05-09
-- ---------------------------------------------------------------------
--  Quando un membro clicca "Lo fai tu? — delega a X" su un task di cui è
--  unico responsabile, il task DEVE:
--   1. tornare in bacheca a tutti gli assegnatari originali (delegated_from)
--   2. comparire in "Solo mie" per X (il delegato), con priority='medium'
--      (arancione = attenzione)
--   3. X può accettare ("Me ne occupo io") o rifiutare ("No, non posso")
--
--  Per supportarlo serve una colonna che indichi CHI è il delegato.
-- =====================================================================

alter table tasks
  add column if not exists delegated_to uuid references members(id) on delete set null;

comment on column tasks.delegated_to is
  'Membro a cui un altro responsabile ha chiesto "Lo fai tu?". Vede il task in Solo mie con priority medium fino ad accettare/rifiutare.';

create index if not exists idx_tasks_delegated_to on tasks(delegated_to);


-- ============================================================
-- BLOCCO: sql/fammy-add-gift-messages.sql
-- ============================================================
-- Create gift_messages table for gift coordination conversations
CREATE TABLE IF NOT EXISTS gift_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  birthday_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_gift_messages_birthday ON gift_messages(birthday_member_id);
CREATE INDEX IF NOT EXISTS idx_gift_messages_family ON gift_messages(family_id);

-- Enable RLS
ALTER TABLE gift_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see messages for their family's birthday events
drop policy if exists "Users can view family gift messages" on gift_messages;
create policy "Users can view family gift messages" on gift_messages FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can create messages for their family
drop policy if exists "Users can create gift messages in their family" on gift_messages;
create policy "Users can create gift messages in their family" on gift_messages FOR INSERT
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM members WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- BLOCCO: fammy-attachments-hotfix-fixed.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Hotfix attachments unificato (FIXED)
-- ---------------------------------------------------------------------
--  Sostituisce `fammy-attachments-hotfix.sql` (versione precedente con
--  3 bug: `owner_user_id` non esiste, riferimenti a `name` ambigui, e
--  in alcuni vecchi DB la colonna `tasks.priority` non era ancora creata).
--
--  Esegui SOLO questo file su Supabase Dashboard → SQL Editor → Run.
--  È completamente idempotente: puoi rilanciarlo senza danni.
-- =====================================================================

-- =====================================================================
-- (1) task_attachments.uploaded_by — fix colonna mancante
-- =====================================================================
alter table public.task_attachments
  add column if not exists uploaded_by uuid references public.members(id) on delete set null;

create index if not exists idx_task_attachments_uploaded_by
  on public.task_attachments(uploaded_by);

-- =====================================================================
-- (2) tasks.priority — assicura la colonna (per DB più vecchi)
-- =====================================================================
alter table public.tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal','medium','high'));

-- Allinea i task urgent=true che non hanno ancora la priorità "high"
update public.tasks set priority = 'high' where urgent = true and priority = 'normal';

-- =====================================================================
-- (3) care_attachments — tabella + RLS
-- =====================================================================
-- Bucket di storage
insert into storage.buckets (id, name, public)
select 'care-attachments', 'care-attachments', false
where not exists (select 1 from storage.buckets where id = 'care-attachments');

-- Tabella
create table if not exists public.care_attachments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  kind         text not null check (kind in ('medical_profile','medication','log','diary')),
  parent_id    uuid,
  file_path    text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.members(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_care_attachments_member on public.care_attachments(member_id);
create index if not exists idx_care_attachments_parent on public.care_attachments(kind, parent_id);

alter table public.care_attachments enable row level security;

-- SELECT
drop policy if exists "care_attachments same family read" on public.care_attachments;
create policy "care_attachments same family read" on public.care_attachments for select
  using (
    exists (
      select 1 from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- INSERT
drop policy if exists "care_attachments same family insert" on public.care_attachments;
create policy "care_attachments same family insert" on public.care_attachments for insert
  with check (
    exists (
      select 1 from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- DELETE: uploader o owner della famiglia (NB: la colonna è `created_by`)
drop policy if exists "care_attachments uploader or owner manage" on public.care_attachments;
create policy "care_attachments uploader or owner manage" on public.care_attachments for delete
  using (
    exists (
      select 1 from public.members m_me
      where m_me.id = care_attachments.uploaded_by
        and m_me.user_id = auth.uid()
    )
    OR
    exists (
      select 1 from public.members m_target
      join public.families f on f.id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and f.created_by = auth.uid()
    )
  );

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.care_attachments;
  exception when others then null;
  end;
end$$;

-- =====================================================================
-- (4) storage.objects RLS per il bucket care-attachments
--     NB: `name` (la colonna file path di storage.objects) deve essere
--     SEMPRE qualificata come `storage.objects.name`, altrimenti la
--     PostgreSQL la confonde con `members.name` o `care_attachments.file_name`
--     nei JOIN delle subquery → errore "column reference name is ambiguous".
-- =====================================================================
drop policy if exists "care-attachments read same family" on storage.objects;
create policy "care-attachments read same family" on storage.objects for select
  using (
    bucket_id = 'care-attachments' AND (
      exists (
        select 1 from public.members m_target
        join public.members m_me on m_me.family_id = m_target.family_id
        where m_target.id::text = (storage.foldername(storage.objects.name))[2]
          and m_me.user_id = auth.uid()
      )
    )
  );

drop policy if exists "care-attachments write same family" on storage.objects;
create policy "care-attachments write same family" on storage.objects for insert
  with check (
    bucket_id = 'care-attachments' AND (
      exists (
        select 1 from public.members m_target
        join public.members m_me on m_me.family_id = m_target.family_id
        where m_target.id::text = (storage.foldername(storage.objects.name))[2]
          and m_me.user_id = auth.uid()
      )
    )
  );

drop policy if exists "care-attachments delete uploader or owner" on storage.objects;
create policy "care-attachments delete uploader or owner" on storage.objects for delete
  using (
    bucket_id = 'care-attachments' AND (
      -- Uploader: chi ha registrato l'attachment può cancellare anche il file
      exists (
        select 1 from public.care_attachments ca
        join public.members m_me on m_me.id = ca.uploaded_by
        where ca.file_path = storage.objects.name
          and m_me.user_id = auth.uid()
      )
      OR
      -- Owner famiglia (colonna: `created_by`, NON `owner_user_id`)
      exists (
        select 1 from public.care_attachments ca
        join public.members m_target on m_target.id = ca.member_id
        join public.families f on f.id = m_target.family_id
        where ca.file_path = storage.objects.name
          and f.created_by = auth.uid()
      )
    )
  );

-- =====================================================================
-- FINE — dopo aver eseguito questo file:
--   ✅ Niente più "uploaded_by column not found"
--   ✅ Niente più "care_attachments table not found"
--   ✅ Niente più "owner_user_id does not exist"
--   ✅ Niente più "name is ambiguous"
--   ✅ Niente più "priority column does not exist"
-- =====================================================================


-- ============================================================
-- BLOCCO: fammy-care-attachments.sql
-- ============================================================
-- ============================================================
-- FAMMY · Care Hub Attachments (foto + file)
-- ============================================================
-- Estensione del Care Hub per permettere di allegare:
--   • Documenti al profilo medico (referti, esami, ricette)
--   • Foto alle medicine (confezione, bugiardino)
--   • Foto/file alle entry del diario giornaliero
--
-- Privacy: stessa RLS dei meds → tutti i membri della famiglia
-- dell'assistito possono vedere/aggiungere; nessun outsider.
-- ============================================================

-- 1) Bucket storage pubblico per i file (link diretti)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'care-attachments',
  'care-attachments',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Tabella metadati
create table if not exists public.care_attachments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  -- Tipo del parent: 'profile' (profilo medico), 'medication' (medicina), 'diary' (entry diario)
  kind text not null check (kind in ('profile', 'medication', 'diary')),
  -- ID del parent (medication_id o diary_id). NULL per 'profile' (1:N con member).
  parent_id uuid,
  -- Nome originale del file
  file_name text not null,
  -- Path nello storage bucket
  file_path text not null,
  -- MIME type
  mime_type text,
  -- Dimensione in bytes
  file_size bigint,
  -- Note descrittive opzionali (es. "Esami del sangue 5 giu 2026")
  note text,
  uploaded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_care_attachments_member on public.care_attachments(member_id);
create index if not exists idx_care_attachments_parent on public.care_attachments(kind, parent_id);

-- 3) RLS
alter table public.care_attachments enable row level security;

-- Tutti i membri della stessa famiglia possono leggere / scrivere / cancellare
drop policy if exists "care_attachments same family read" on public.care_attachments;
create policy "care_attachments same family read" on public.care_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

drop policy if exists "care_attachments same family insert" on public.care_attachments;
create policy "care_attachments same family insert" on public.care_attachments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

drop policy if exists "care_attachments same family delete" on public.care_attachments;
create policy "care_attachments same family delete" on public.care_attachments for delete
  to authenticated
  using (
    exists (
      select 1
      from public.members m_target
      join public.members m_me on m_me.family_id = m_target.family_id
      where m_target.id = care_attachments.member_id
        and m_me.user_id = auth.uid()
    )
  );

-- 4) RLS sullo storage bucket
-- Lettura pubblica (il bucket è pubblico, link diretti funzionano)
drop policy if exists "care-attachments public read" on storage.objects;
create policy "care-attachments public read" on storage.objects for select
  to public
  using (bucket_id = 'care-attachments');

-- Upload solo da utenti autenticati
drop policy if exists "care-attachments authenticated upload" on storage.objects;
create policy "care-attachments authenticated upload" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'care-attachments');

-- Delete solo da utenti autenticati (il DB-level RLS protegge il record)
drop policy if exists "care-attachments authenticated delete" on storage.objects;
create policy "care-attachments authenticated delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'care-attachments');

-- 5) Aggiungi al realtime publication (opzionale, per refresh live)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'care_attachments'
  ) then
    alter publication supabase_realtime add table public.care_attachments;
  end if;
end$$;

