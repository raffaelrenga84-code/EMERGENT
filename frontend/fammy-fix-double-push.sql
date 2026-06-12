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

notify pgrst, 'reload schema';

-- VERIFICA — deve restituire 1 riga (la tabella esiste)
select tablename from pg_tables where tablename = 'task_notify_queue';
