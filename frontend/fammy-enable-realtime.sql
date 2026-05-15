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
