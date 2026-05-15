-- =====================================================================
--  FAMMY - Aggiunge supporto "assegnato a" per i task
-- ---------------------------------------------------------------------
--  Aggiunge la colonna assigned_to alla tabella tasks, con FK
--  al membro a cui il task è destinato. Null = non assegnato a nessuno.
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
--  Operazione sicura: aggiunge colonna senza distruggere dati esistenti.
-- =====================================================================

alter table tasks
  add column if not exists assigned_to uuid references members(id) on delete set null;

create index if not exists idx_tasks_assigned_to on tasks(assigned_to);

-- Aggiorniamo lo schema completo per renderlo coerente nella vista
comment on column tasks.assigned_to is 'Membro a cui il task è assegnato. NULL = chiunque.';
