-- ============================================================
--  FAMMY — Snapshot autore sui task_responses
-- ============================================================
--  Problema risolto:
--  Quando un membro viene rimosso o esce dalla famiglia, la FK
--  `task_responses.author_id REFERENCES members(id) ON DELETE SET NULL`
--  azzera il riferimento → in chat il messaggio appare come
--  "Qualcuno" con avatar "?".
--
--  Soluzione:
--  Snapshot di display_name + avatar_color + avatar_letter al
--  momento dell'INSERT, così il nome rimane visibile anche se
--  il membro viene poi rimosso.
--
--  Esegui questo file su Supabase SQL Editor → Run.
--  Idempotente: si può rieseguire senza effetti collaterali.
-- ============================================================

-- 1) Aggiungi le 3 colonne snapshot (se non esistono già)
alter table public.task_responses
  add column if not exists author_name         text,
  add column if not exists author_avatar_color text,
  add column if not exists author_avatar_letter text;

-- 2) Backfill: per ogni messaggio esistente con author_id valido,
--    popola lo snapshot da members. I messaggi con author_id NULL
--    (autore già rimosso) restano senza snapshot → la UI mostrerà
--    "Membro rimosso" come label.
update public.task_responses tr
   set author_name          = m.name,
       author_avatar_color  = m.avatar_color,
       author_avatar_letter = m.avatar_letter
  from public.members m
 where tr.author_id = m.id
   and tr.author_name is null;

-- 3) Trigger BEFORE INSERT: snapshotta automaticamente da members
--    se il client non l'ha già fornito. Così tutto il codice
--    frontend esistente continua a funzionare senza modifiche.
create or replace function public.fammy_snapshot_task_response_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  -- Se lo snapshot è già stato fornito dal client, non sovrascrivere
  if new.author_name is not null
     and new.author_avatar_color is not null
     and new.author_avatar_letter is not null then
    return new;
  end if;

  if new.author_id is not null then
    select name, avatar_color, avatar_letter
      into m
      from public.members
     where id = new.author_id;

    if found then
      new.author_name          := coalesce(new.author_name,          m.name);
      new.author_avatar_color  := coalesce(new.author_avatar_color,  m.avatar_color);
      new.author_avatar_letter := coalesce(new.author_avatar_letter, m.avatar_letter);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fammy_snapshot_task_response_author on public.task_responses;

create trigger trg_fammy_snapshot_task_response_author
  before insert on public.task_responses
  for each row
  execute function public.fammy_snapshot_task_response_author();

-- 4) Verifica (opzionale): conta quanti messaggi hanno snapshot
--    SELECT
--      count(*) filter (where author_name is not null)  as con_snapshot,
--      count(*) filter (where author_name is null)      as senza_snapshot,
--      count(*) filter (where author_id is null)        as autore_rimosso
--    FROM public.task_responses;
