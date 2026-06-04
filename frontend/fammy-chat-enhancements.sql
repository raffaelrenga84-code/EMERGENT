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
