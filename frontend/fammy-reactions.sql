-- =====================================================================
-- FAMMY — Sticker reactions sui commenti (task_responses)
-- =====================================================================
-- Aggiunge una colonna `reactions jsonb` a `task_responses` per memorizzare
-- le reaction (es. ❤️, 👍, 🎉). Formato:
--    { "❤️": ["<member_id1>", "<member_id2>"], "👍": ["<member_id3>"] }
--
-- Per consentire a chiunque della famiglia di reagire (non solo all'autore
-- del messaggio) usiamo una RPC SECURITY DEFINER che valida i permessi:
--   - l'utente deve essere membro della famiglia del task
--   - può aggiungere/togliere solo il suo member_id, mai quello di altri
--
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente.

-- 1) Colonna reactions
alter table public.task_responses
  add column if not exists reactions jsonb not null default '{}'::jsonb;

-- 2) Indice GIN per query veloci sulle reactions (opzionale ma utile)
create index if not exists idx_task_responses_reactions_gin
  on public.task_responses using gin (reactions);

-- 3) RPC: toggle_reaction
--    Toggle del proprio member_id sotto la chiave emoji nel JSON.
--    Sicurezza:
--      - L'utente deve essere autenticato
--      - Deve essere membro della famiglia a cui appartiene il task
--      - Il `p_member_id` deve corrispondere a uno dei suoi member_id
--    Ritorna le reactions aggiornate.
create or replace function public.toggle_reaction(
  p_response_id uuid,
  p_emoji text,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task_id uuid;
  v_family_id uuid;
  v_member_user uuid;
  v_current jsonb;
  v_arr jsonb;
  v_new jsonb;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  -- Verifica che il member_id appartenga davvero all'utente loggato
  select user_id, family_id into v_member_user, v_family_id
    from public.members where id = p_member_id;
  if v_member_user is null or v_member_user <> v_uid then
    raise exception 'forbidden_member';
  end if;

  -- Verifica che il response esista e che il task appartenga alla stessa famiglia
  -- in cui l'utente è membro
  select tr.task_id, t.family_id, tr.reactions
    into v_task_id, v_family_id, v_current
  from public.task_responses tr
  join public.tasks t on t.id = tr.task_id
  where tr.id = p_response_id;
  if v_task_id is null then
    raise exception 'response_not_found';
  end if;

  -- L'utente è membro della famiglia di questo task?
  if not exists (
    select 1 from public.members m
    where m.user_id = v_uid and m.family_id = v_family_id
  ) then
    raise exception 'not_in_family';
  end if;

  -- Estrai l'array di member_id per questa emoji, fallback []
  v_arr := coalesce(v_current -> p_emoji, '[]'::jsonb);

  -- Toggle: se il mio member_id è già lì → rimuovi, altrimenti aggiungi
  if v_arr @> to_jsonb(p_member_id::text) then
    v_arr := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements_text(v_arr) as elem
      where elem <> p_member_id::text
    );
  else
    v_arr := v_arr || to_jsonb(p_member_id::text);
  end if;

  -- Se l'array è vuoto → rimuovi la chiave; altrimenti aggiorna
  if jsonb_array_length(v_arr) = 0 then
    v_new := v_current - p_emoji;
  else
    v_new := jsonb_set(v_current, array[p_emoji], v_arr, true);
  end if;

  update public.task_responses
    set reactions = v_new
    where id = p_response_id;

  return v_new;
end$$;

grant execute on function public.toggle_reaction(uuid, text, uuid) to authenticated;

-- 4) Garantisci che `task_responses` sia in realtime publication (potrebbe
--    già esserlo, ma è idempotente). Serve per ricevere gli UPDATE
--    quando qualcuno aggiunge una reaction.
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_responses;
  exception when duplicate_object then null;
  end;
end$$;
