-- =====================================================================
-- FAMMY — RESTORE part 2 of 3 (dopo reset accidentale)
-- ESEGUI IN ORDINE: 1 → 2 → 3
-- Idempotente: rilanciabile senza danni
-- =====================================================================

-- BLOCCO: fammy-task-subtasks.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Subtask / Checklist sui task
-- ---------------------------------------------------------------------
--  Tabella `task_subtasks` per supportare checklist all'interno di un
--  task (es. "lista spesa", "preparare bagaglio").
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

create table if not exists public.task_subtasks (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  text          text not null,
  done          boolean not null default false,
  order_index   int not null default 0,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.members(id) on delete set null,
  -- snapshot del nome di chi completa (sopravvive a rimozione del membro)
  completed_by_name text
);

create index if not exists idx_task_subtasks_task on public.task_subtasks(task_id, order_index);

-- RLS: stessa logica dei task_responses
alter table public.task_subtasks enable row level security;

drop policy if exists "task_subtasks_rw" on public.task_subtasks;
create policy "task_subtasks_rw" on public.task_subtasks for all
  using (exists (
    select 1 from public.tasks t
    where t.id = task_subtasks.task_id and (
      is_family_member(t.family_id)
      or exists (
        select 1 from public.task_assignees ta
        join public.members m on m.id = ta.member_id
        where ta.task_id = t.id and m.user_id = auth.uid()
      )
    )
  ))
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_subtasks.task_id and (
      is_family_member(t.family_id)
      or exists (
        select 1 from public.task_assignees ta
        join public.members m on m.id = ta.member_id
        where ta.task_id = t.id and m.user_id = auth.uid()
      )
    )
  ));

-- Realtime: utile per vedere i tick degli altri membri in tempo reale
do $$
begin
  begin
    alter publication supabase_realtime add table public.task_subtasks;
  exception when others then null;
  end;
end$$;

-- Trigger snapshot completed_by_name (come per task_responses author_name)
create or replace function public.fammy_snapshot_subtask_completer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare m record;
begin
  -- Solo quando done diventa true e c'è completed_by
  if new.done is true and new.completed_by is not null and new.completed_by_name is null then
    select name into m from public.members where id = new.completed_by;
    if found then
      new.completed_by_name := m.name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fammy_snapshot_subtask on public.task_subtasks;
create trigger trg_fammy_snapshot_subtask
  before insert or update on public.task_subtasks
  for each row execute function public.fammy_snapshot_subtask_completer();


-- ============================================================
-- BLOCCO: fammy-author-snapshot.sql
-- ============================================================
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


-- ============================================================
-- BLOCCO: fammy-fix-invitations.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Fix funzione get_invitation
-- ---------------------------------------------------------------------
--  Risolve l'errore: record "mem" is not assigned yet
--  che si verificava quando l'invito non era legato a un membro
--  pre-creato (member_id NULL).
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase. Sostituisce solo
--  la funzione, non distrugge dati.
-- =====================================================================

create or replace function get_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  mem_name text := null;
  mem_role text := null;
begin
  select i.*, f.name as family_name, f.emoji as family_emoji
    into inv
    from invitations i
    join families f on f.id = i.family_id
    where i.token = invite_token;

  if not found then
    return json_build_object('valid', false, 'error', 'Invito non trovato.');
  end if;

  if inv.status <> 'pending' then
    return json_build_object('valid', false, 'error', 'Invito già usato o annullato.');
  end if;

  if inv.expires_at < now() then
    return json_build_object('valid', false, 'error', 'Invito scaduto.');
  end if;

  -- Solo se l'invito puntava a un membro pre-creato, recupera il suo nome
  if inv.member_id is not null then
    select name, role into mem_name, mem_role from members where id = inv.member_id;
  end if;

  return json_build_object(
    'valid', true,
    'family_name', inv.family_name,
    'family_emoji', inv.family_emoji,
    'member_name', mem_name,
    'member_role', mem_role
  );
end;
$$;

grant execute on function get_invitation(text) to anon, authenticated;


-- ============================================================
-- BLOCCO: fammy-fix-recursion.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Fix infinite recursion nelle RLS policy
-- ---------------------------------------------------------------------
--  La precedente policy "tasks_read" interrogava task_assignees, e
--  task_assignees a sua volta interrogava tasks → infinite recursion.
--  Soluzione: usare funzioni SECURITY DEFINER che bypassano RLS.
--
--  Da eseguire UNA VOLTA su Supabase. Sostituisce solo le policy.
-- =====================================================================

-- 1. Helper: l'utente corrente è assegnatario di questo task?
create or replace function is_task_assignee(t_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = t_id and m.user_id = auth.uid()
  );
$$;

-- 2. Helper: l'utente corrente è membro di questa famiglia O assegnatario
--    di un task in essa?
create or replace function can_see_family_members(fam_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.family_id = fam_id and m.user_id = auth.uid())
      or exists (
        select 1 from tasks t
        join task_assignees ta on ta.task_id = t.id
        join members m on m.id = ta.member_id
        where t.family_id = fam_id and m.user_id = auth.uid()
      );
$$;

-- 3. Helper: l'utente corrente vede questa famiglia?
create or replace function can_see_family(fam_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.family_id = fam_id and m.user_id = auth.uid())
      or exists (select 1 from families f where f.id = fam_id and f.created_by = auth.uid())
      or exists (
        select 1 from tasks t
        join task_assignees ta on ta.task_id = t.id
        join members m on m.id = ta.member_id
        where t.family_id = fam_id and m.user_id = auth.uid()
      );
$$;

grant execute on function is_task_assignee(uuid) to authenticated;
grant execute on function can_see_family_members(uuid) to authenticated;
grant execute on function can_see_family(uuid) to authenticated;


-- 4. Sostituisci le policy in loop con quelle che usano gli helper

drop policy if exists "tasks_read"   on tasks;
drop policy if exists "tasks_update" on tasks;

create policy "tasks_read" on tasks for select using (
  is_family_member(family_id) or is_task_assignee(id)
);

create policy "tasks_update" on tasks for update
  using (is_family_member(family_id) or is_task_assignee(id))
  with check (is_family_member(family_id) or is_task_assignee(id));

drop policy if exists "members_read" on members;
create policy "members_read" on members for select using (
  is_family_member(family_id) or can_see_family_members(family_id)
);

drop policy if exists "families_read" on families;
create policy "families_read" on families for select using (
  can_see_family(id)
);


-- ============================================================
-- BLOCCO: fammy-fix-rls.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Fix policy RLS sui membri
-- ---------------------------------------------------------------------
--  Risolve l'errore:
--  "new row violates row-level security policy for table members"
--  che si verifica quando il creatore di una famiglia tenta di
--  inserire se stesso come primo membro.
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
--  Non è distruttivo: non tocca i dati, sostituisce solo le regole.
-- =====================================================================

-- Rimuovi la policy generica "for all" che è troppo restrittiva sull'INSERT
drop policy if exists "members_write" on members;

-- Policy separate per insert/update/delete

-- INSERT: consentito se sei già membro della famiglia
-- OPPURE se sei il creatore della famiglia (caso del primo membro)
create policy "members_insert" on members for insert with check (
  is_family_member(family_id)
  or exists (
    select 1 from families f
    where f.id = family_id and f.created_by = auth.uid()
  )
);

-- UPDATE: solo membri esistenti possono modificare
create policy "members_update" on members for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- DELETE: solo membri esistenti possono cancellare
create policy "members_delete" on members for delete
  using (is_family_member(family_id));


-- ============================================================
-- BLOCCO: fammy-rpc-invitations.sql
-- ============================================================
-- =====================================================================
--  FAMMY - RPC per gestire l'accettazione degli inviti
-- ---------------------------------------------------------------------
--  Aggiunge due funzioni:
--    - get_invitation(token): legge i dati pubblici di un invito
--      (per la pagina "stai per entrare in Famiglia X")
--    - accept_invitation(token): collega l'utente loggato al membro
--      della famiglia indicato dall'invito
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
-- =====================================================================

-- 1. Lettura pubblica di un invito (anche senza autenticazione)
--    Restituisce solo info safe per la landing page.
create or replace function get_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  fam record;
  mem record;
begin
  select i.*, f.name as family_name, f.emoji as family_emoji
    into inv
    from invitations i
    join families f on f.id = i.family_id
    where i.token = invite_token;

  if not found then
    return json_build_object('valid', false, 'error', 'Invito non trovato.');
  end if;

  if inv.status <> 'pending' then
    return json_build_object('valid', false, 'error', 'Invito già usato o annullato.');
  end if;

  if inv.expires_at < now() then
    return json_build_object('valid', false, 'error', 'Invito scaduto.');
  end if;

  -- Eventuale info sul membro pre-creato
  if inv.member_id is not null then
    select name, role into mem from members where id = inv.member_id;
  end if;

  return json_build_object(
    'valid', true,
    'family_name', inv.family_name,
    'family_emoji', inv.family_emoji,
    'member_name', coalesce(mem.name, null),
    'member_role', coalesce(mem.role, null)
  );
end;
$$;

-- Permetti chiamata anche senza login (per la landing /invite/:token)
grant execute on function get_invitation(text) to anon, authenticated;


-- 2. Accettazione invito (richiede utente loggato)
--    Collega l'utente al membro target o crea un nuovo membro.
create or replace function accept_invitation(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  result_member_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Devi essere loggato.');
  end if;

  select * into inv
    from invitations
    where token = invite_token and status = 'pending' and expires_at > now()
    for update;

  if not found then
    return json_build_object('success', false, 'error', 'Invito non valido o scaduto.');
  end if;

  -- L'utente è già membro di questa famiglia? Allora basta marcare come accettato.
  if exists (select 1 from members where family_id = inv.family_id and user_id = auth.uid()) then
    update invitations set status = 'accepted' where id = inv.id;
    return json_build_object('success', true, 'family_id', inv.family_id, 'already_member', true);
  end if;

  -- Caso 1: l'invito puntava a un membro pre-creato senza account → linkalo
  if inv.member_id is not null then
    update members set user_id = auth.uid(), status = 'active'
      where id = inv.member_id and user_id is null
      returning id into result_member_id;

    if result_member_id is null then
      -- il membro era già linkato: creiamo nuovo membro per quest'utente
      insert into members (family_id, user_id, name, role, status, avatar_letter)
      select inv.family_id, auth.uid(),
             coalesce(p.display_name, 'Nuovo membro'),
             'altro', 'active',
             upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
      from profiles p where p.id = auth.uid()
      returning id into result_member_id;
    end if;
  else
    -- Caso 2: invito generico → crea un nuovo membro per l'utente loggato
    insert into members (family_id, user_id, name, role, status, avatar_letter)
    select inv.family_id, auth.uid(),
           coalesce(p.display_name, 'Nuovo membro'),
           'altro', 'active',
           upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
    from profiles p where p.id = auth.uid()
    returning id into result_member_id;
  end if;

  update invitations set status = 'accepted' where id = inv.id;

  return json_build_object('success', true, 'family_id', inv.family_id, 'member_id', result_member_id);
end;
$$;

grant execute on function accept_invitation(text) to authenticated;


-- ============================================================
-- BLOCCO: sql/fammy-rpc-invitations-v2.sql
-- ============================================================
-- =====================================================================
--  FAMMY - RPC inviti v2: supporto claim di un placeholder esistente
-- ---------------------------------------------------------------------
--  Cambiamenti rispetto a v1 (fammy-rpc-invitations.sql):
--   * accept_invitation accetta un secondo parametro opzionale
--     `claim_member_id`: se l'invitato sceglie di "essere" un membro
--     placeholder già presente nella famiglia (senza account), il suo
--     user_id viene collegato a quel placeholder invece di creare un
--     nuovo membro duplicato.
--   * Nuova RPC `list_claimable_placeholders(token)` per la pagina di
--     accettazione: ritorna i membri della famiglia senza account
--     così l'utente può scegliere "Io sono Rex".
--
--  Da eseguire UNA VOLTA su Supabase (sostituisce le funzioni v1).
-- =====================================================================

-- 1. Lista placeholder claimabili (senza account) per un dato invito --
create or replace function list_claimable_placeholders(invite_token text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
begin
  select i.family_id into inv
    from invitations i
    where i.token = invite_token
      and i.status = 'pending'
      and i.expires_at > now();

  if not found then
    return json_build_object('valid', false, 'placeholders', '[]'::json);
  end if;

  return json_build_object(
    'valid', true,
    'placeholders', coalesce(
      (
        select json_agg(
                 json_build_object(
                   'id', m.id,
                   'name', m.name,
                   'role', m.role,
                   'avatar_letter', m.avatar_letter,
                   'avatar_color', m.avatar_color
                 )
                 order by m.created_at
               )
          from members m
         where m.family_id = inv.family_id
           and m.user_id is null
           and m.status <> 'inactive'
      ),
      '[]'::json
    )
  );
end;
$$;

grant execute on function list_claimable_placeholders(text) to anon, authenticated;


-- 2. accept_invitation con parametro opzionale claim_member_id ---------
-- Drop firma vecchia (1 arg) e firma nuova (2 args) per evitare ambiguità
drop function if exists accept_invitation(text);
drop function if exists accept_invitation(text, uuid);

create or replace function accept_invitation(
  invite_token text,
  claim_member_id uuid default null
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  target_member record;
  result_member_id uuid;
  already_linked_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Devi essere loggato.');
  end if;

  select * into inv
    from invitations
    where token = invite_token and status = 'pending' and expires_at > now()
    for update;

  if not found then
    return json_build_object('success', false, 'error', 'Invito non valido o scaduto.');
  end if;

  -- L'utente è già membro di questa famiglia? Marca l'invito come accettato
  -- e ritorna il membro esistente.
  select id into already_linked_id
    from members
    where family_id = inv.family_id and user_id = auth.uid()
    limit 1;
  if already_linked_id is not null then
    update invitations set status = 'accepted' where id = inv.id;
    return json_build_object(
      'success', true,
      'family_id', inv.family_id,
      'member_id', already_linked_id,
      'already_member', true
    );
  end if;

  ---------------------------------------------------------------------
  -- Decide a quale placeholder collegare l'utente (priorità):
  --   1. claim_member_id passato esplicitamente dall'UI
  --   2. invitations.member_id (link generato per uno specifico
  --      placeholder dal FamilyInviteModal)
  --   3. altrimenti: crea un nuovo membro
  ---------------------------------------------------------------------
  if claim_member_id is not null then
    select * into target_member
      from members
      where id = claim_member_id
        and family_id = inv.family_id
        and user_id is null
      for update;
    if not found then
      return json_build_object(
        'success', false,
        'error', 'Il profilo selezionato non è più disponibile.'
      );
    end if;

    update members
       set user_id = auth.uid(), status = 'active'
     where id = target_member.id
     returning id into result_member_id;

  elsif inv.member_id is not null then
    update members
       set user_id = auth.uid(), status = 'active'
     where id = inv.member_id and user_id is null
     returning id into result_member_id;

    -- Il placeholder era già stato preso da un altro? Crea nuovo membro
    if result_member_id is null then
      insert into members (family_id, user_id, name, role, status, avatar_letter)
      select inv.family_id, auth.uid(),
             coalesce(p.display_name, 'Nuovo membro'),
             'altro', 'active',
             upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
        from profiles p where p.id = auth.uid()
      returning id into result_member_id;
    end if;

  else
    insert into members (family_id, user_id, name, role, status, avatar_letter)
    select inv.family_id, auth.uid(),
           coalesce(p.display_name, 'Nuovo membro'),
           'altro', 'active',
           upper(substring(coalesce(p.display_name, 'N') from 1 for 1))
      from profiles p where p.id = auth.uid()
    returning id into result_member_id;
  end if;

  update invitations set status = 'accepted' where id = inv.id;

  return json_build_object(
    'success', true,
    'family_id', inv.family_id,
    'member_id', result_member_id
  );
end;
$$;

grant execute on function accept_invitation(text, uuid) to authenticated;


-- ============================================================
-- BLOCCO: fammy-feedback.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Feedback log
-- ---------------------------------------------------------------------
--  Tabella opzionale per archiviare i feedback ricevuti (oltre a inviarli
--  via email). Utile per analizzare il trend, esportare in CSV ecc.
--
--  Idempotente: eseguibile più volte.
-- =====================================================================

create table if not exists public.feedback_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  rating      smallint check (rating between 0 and 5),
  message     text,
  app_lang    text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_log_created_idx
  on public.feedback_log(created_at desc);

create index if not exists feedback_log_user_idx
  on public.feedback_log(user_id);

alter table public.feedback_log enable row level security;

-- L'utente può vedere SOLO i propri feedback (privacy).
drop policy if exists "feedback_select_self" on public.feedback_log;
create policy "feedback_select_self" on public.feedback_log for select
  to authenticated using (user_id = auth.uid());

-- Inserimento avviene tramite Edge Function (service role), quindi NESSUNA
-- policy di INSERT per authenticated → l'unico path è server-side.


-- ============================================================
-- BLOCCO: fammy-feedback-v2.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Feedback log (v2): INSERT self + SELECT admin
-- ---------------------------------------------------------------------
--  Aggiorna la tabella feedback_log per:
--   1. Permettere a qualunque utente loggato di INSERIRE il proprio feedback
--      (RLS: user_id = auth.uid()).
--   2. Permettere agli ADMIN (Raffael, Rex) di SELECT tutti i feedback.
--      Helper function is_fammy_admin() con whitelist email hard-coded.
--
--  Idempotente.
-- =====================================================================

-- 1) Helper: chi è admin? Whitelist email.
create or replace function public.is_fammy_admin()
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(coalesce(email, '')) in (
        'raffael.renga84@gmail.com',
        'rjphillpott@gmail.com'
      )
  );
$$;

grant execute on function public.is_fammy_admin() to authenticated;

-- 2) INSERT: ogni utente loggato può creare un proprio feedback
drop policy if exists "feedback_insert_self" on public.feedback_log;
create policy "feedback_insert_self" on public.feedback_log for insert
  to authenticated with check (user_id = auth.uid());

-- 3) SELECT: l'utente vede i propri + gli admin vedono tutto
drop policy if exists "feedback_select_self" on public.feedback_log;
drop policy if exists "feedback_select_self_or_admin" on public.feedback_log;
create policy "feedback_select_self_or_admin" on public.feedback_log for select
  to authenticated using (
    user_id = auth.uid() or public.is_fammy_admin()
  );

-- 4) UPDATE: gli admin possono marcare un feedback come "letto"
alter table public.feedback_log
  add column if not exists read_at timestamptz;

drop policy if exists "feedback_update_admin" on public.feedback_log;
create policy "feedback_update_admin" on public.feedback_log for update
  to authenticated
  using (public.is_fammy_admin())
  with check (public.is_fammy_admin());

-- 5) Index per query "non letti"
create index if not exists feedback_log_unread_idx
  on public.feedback_log (read_at) where read_at is null;


-- ============================================================
-- BLOCCO: fammy-feedback-v3.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Feedback log (v3): supporto invio anonimo
-- ---------------------------------------------------------------------
--  Aggiunge la colonna is_anonymous: quando true, l'inbox lato admin
--  mostra "Anonimo" e nasconde nome/contatti dell'autore.
--  Il user_id RIMANE su DB (per RLS insert_self e abuse prevention),
--  ma nessun admin lo vede né può risalire al profilo da UI.
--
--  Idempotente.
-- =====================================================================

alter table public.feedback_log
  add column if not exists is_anonymous boolean not null default false;


-- ============================================================
-- BLOCCO: fammy-feedback-notify.sql
-- ============================================================
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


-- ============================================================
-- BLOCCO: fammy-reactions.sql
-- ============================================================
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


-- ============================================================
-- BLOCCO: fammy-absences.sql
-- ============================================================
-- ============================================================================
-- FAMMY — Assenze membri famiglia (Iterazione 15)
--
-- Permette ai membri di dichiarare un periodo di assenza (vacanza, lavoro,
-- salute, altro). Le assenze sono:
--   • Pubbliche di default in selezione famiglie tramite visible_to_families[]
--   • Visibili a chi vuoi (lista di family_id)
--   • Modificabili/cancellabili solo dal proprietario o dall'admin della famiglia
--
-- Idempotente: puoi eseguirla più volte senza errori.
-- ============================================================================

-- 1) Tabella assenze
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Snapshot del display name al momento della creazione (per UX nelle liste
  -- anche quando guardiamo da famiglie dove la persona non è membro).
  member_name text,
  -- Range periodo (inclusive)
  start_date date not null,
  end_date date not null,
  -- Motivo: 'vacation' | 'work' | 'health' | 'other'
  reason text not null default 'other',
  -- Dove (libero, es. "Messico", "Milano", "Casa")
  location text,
  -- Note opzionali per la famiglia
  note text,
  -- Famiglie con cui si condivide l'assenza. Vuoto = nessuna (privato).
  visible_to_families uuid[] default '{}'::uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint absences_dates_check check (end_date >= start_date)
);

create index if not exists absences_user_idx on public.absences(user_id);
create index if not exists absences_range_idx on public.absences(start_date, end_date);
-- GIN index per query "quale assenza è visibile alla famiglia X?"
create index if not exists absences_visible_families_idx
  on public.absences using gin (visible_to_families);

-- 2) RLS
alter table public.absences enable row level security;

-- Read: posso vedere
--   • le mie assenze (sempre)
--   • le assenze condivise con una famiglia di cui sono membro
drop policy if exists "Read own or shared absences" on public.absences;
create policy "Read own or shared absences"
  on public.absences for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.members m
      where m.user_id = auth.uid()
        and m.family_id = any(absences.visible_to_families)
    )
  );

-- Insert: solo io posso creare le mie
drop policy if exists "Create own absence" on public.absences;
create policy "Create own absence"
  on public.absences for insert
  to authenticated
  with check (user_id = auth.uid());

-- Update: solo il proprietario
drop policy if exists "Update own absence" on public.absences;
create policy "Update own absence"
  on public.absences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: solo il proprietario
drop policy if exists "Delete own absence" on public.absences;
create policy "Delete own absence"
  on public.absences for delete
  to authenticated
  using (user_id = auth.uid());

-- 3) Trigger updated_at
create or replace function public.touch_absences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists absences_touch_updated on public.absences;
create trigger absences_touch_updated
  before update on public.absences
  for each row execute function public.touch_absences_updated_at();

-- ============================================================================
-- DONE.
-- ============================================================================


-- ============================================================
-- BLOCCO: fammy-absence-comments.sql
-- ============================================================
-- ============================================================
-- FAMMY · Absence comments (commenti su assenze stile chat task)
-- ============================================================
-- Permette ai membri della famiglia di commentare un'assenza con un thread
-- simile a quello dei task. Utile per dare info di viaggio, contatti,
-- raccomandazioni a chi resta a casa, etc.
-- ============================================================

create table if not exists public.absence_responses (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references public.absences(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_absence_responses_absence on public.absence_responses(absence_id, created_at);
create index if not exists idx_absence_responses_author on public.absence_responses(author_id);

alter table public.absence_responses enable row level security;

-- READ: tutti i membri delle famiglie a cui l'assenza è visibile
-- (o l'autore dell'assenza stessa).
drop policy if exists "absence_responses read" on public.absence_responses;
create policy "absence_responses read"
  on public.absence_responses for select
  to authenticated
  using (
    exists (
      select 1 from public.absences a
      where a.id = absence_responses.absence_id
        and (
          a.user_id = auth.uid()
          or exists (
            select 1 from public.members m
            where m.user_id = auth.uid()
              and (
                a.visible_to_families is null
                or m.family_id = any(a.visible_to_families)
              )
          )
        )
    )
  );

-- INSERT: stessi criteri della read
drop policy if exists "absence_responses insert" on public.absence_responses;
create policy "absence_responses insert"
  on public.absence_responses for insert
  to authenticated
  with check (
    author_id = auth.uid() and
    exists (
      select 1 from public.absences a
      where a.id = absence_responses.absence_id
        and (
          a.user_id = auth.uid()
          or exists (
            select 1 from public.members m
            where m.user_id = auth.uid()
              and (
                a.visible_to_families is null
                or m.family_id = any(a.visible_to_families)
              )
          )
        )
    )
  );

-- UPDATE: solo l'autore può modificare (es. reactions)
drop policy if exists "absence_responses update own" on public.absence_responses;
create policy "absence_responses update own"
  on public.absence_responses for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- UPDATE generale per reactions (chiunque può aggiungere reaction):
-- usiamo una policy separata che permette UPDATE solo del campo reactions
-- da parte di chi può leggere. Per semplicità del MVP, lo lasciamo
-- all'autore. Le reactions vengono gestite via separato JSONB merge in client.

-- DELETE: solo autore
drop policy if exists "absence_responses delete own" on public.absence_responses;
create policy "absence_responses delete own"
  on public.absence_responses for delete
  to authenticated
  using (author_id = auth.uid());

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'absence_responses'
  ) then
    alter publication supabase_realtime add table public.absence_responses;
  end if;
end$$;


-- ============================================================
-- BLOCCO: fammy-medications.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Sezione Persone Assistite (Fase 1: Medicine + Reminders)
-- =====================================================================
-- Aggiunge:
--   1. `members.is_assisted`: toggle per marcare un membro come "assistito"
--      (anziano, bambino, persona con esigenze speciali). Sblocca sezioni
--      mediche nel suo profilo.
--   2. `medications`: lista farmaci di un membro (nome, dose, orari)
--   3. `medication_logs`: registro presa medicine (per ogni reminder)
--
-- Privacy: tutti i membri della stessa famiglia possono vedere e gestire
-- le medicine (come da scelta utente, modalità "2a"). Le RLS limitano
-- l'accesso ai membri della stessa famiglia tramite il `member_id`.
--
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run. Idempotente.

-- ============ 1) is_assisted sui members ============
alter table public.members
  add column if not exists is_assisted boolean not null default false;

-- ============ 2) Tabella medications ============
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  name varchar not null,
  dose varchar,                          -- es. "5 mg" o "1 pastiglia"
  notes text,
  -- Array di orari giornalieri "HH:MM" (es. ['08:00', '14:00', '20:00'])
  -- Per medicine "al bisogno", lascia [].
  times_of_day text[] not null default array[]::text[],
  -- Giorni della settimana attivi: 0=Domenica..6=Sabato. Vuoto = tutti.
  days_of_week int[] not null default array[]::int[],
  -- Start/end (per cure a tempo). Null = sempre.
  start_date date,
  end_date date,
  -- Posticipo richiesto dall'utente (in minuti) — usato dal reminder
  -- per offrire i pulsanti "Posticipa". Default 10/30/60.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.members(id) on delete set null
);

create index if not exists idx_medications_member_active
  on public.medications(member_id, active);

-- ============ 3) Tabella medication_logs ============
-- Ogni record = "questa dose è stata presa / saltata / posticipata".
create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  -- Quando la dose era programmata (timezone-aware UTC)
  scheduled_at timestamptz not null,
  -- Quando l'utente ha agito
  acted_at timestamptz not null default now(),
  action varchar not null check (action in ('taken', 'snoozed', 'skipped')),
  -- Se snoozed: nuovo orario; altrimenti null
  snoozed_until timestamptz,
  -- Chi ha registrato l'azione (può essere diverso da member_id:
  -- es. una figlia che marca la medicina per il padre anziano)
  recorded_by uuid references public.members(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_med_logs_member_date
  on public.medication_logs(member_id, scheduled_at desc);
create index if not exists idx_med_logs_med
  on public.medication_logs(medication_id);

-- ============ 4) RLS Policies ============
-- Tutti i membri della stessa famiglia possono SELECT/INSERT/UPDATE/DELETE
-- sulle medicine e sui log dei membri assistiti della loro famiglia.
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;

-- SELECT medications: chiunque della famiglia del member
drop policy if exists "med_select_same_family" on public.medications;
create policy "med_select_same_family"
  on public.medications for select
  to authenticated
  using (
    exists (
      select 1
      from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  );

-- INSERT/UPDATE/DELETE: idem
drop policy if exists "med_modify_same_family" on public.medications;
create policy "med_modify_same_family"
  on public.medications for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medications.member_id
    )
  );

-- Stesse policy per medication_logs
drop policy if exists "medlog_select_same_family" on public.medication_logs;
create policy "medlog_select_same_family"
  on public.medication_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  );

drop policy if exists "medlog_modify_same_family" on public.medication_logs;
create policy "medlog_modify_same_family"
  on public.medication_logs for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medication_logs.member_id
    )
  );

-- Realtime: per i client riceve INSERT/UPDATE in tempo reale
do $$
begin
  begin alter publication supabase_realtime add table public.medications;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.medication_logs;
  exception when duplicate_object then null; end;
end$$;


-- ============================================================
-- BLOCCO: fammy-medication-cron.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Schedule cron per medication-reminder-push
-- =====================================================================
-- Esegue la edge function `medication-reminder-push` ogni MINUTO.
-- Richiede:
--   1. fammy_private.config con `edge_base_url` e `service_role_key`
--      (lo stesso usato dagli altri cron, vedi fammy-push-notifications.sql)
--   2. estensione pg_cron già abilitata su Supabase (Dashboard → Database
--      → Extensions → enable pg_cron)
--
-- Idempotente: drop & re-create il job.

select cron.unschedule('fammy-medication-reminder')
  where exists (select 1 from cron.job where jobname = 'fammy-medication-reminder');

select cron.schedule(
  'fammy-medication-reminder',
  '* * * * *',  -- ogni minuto
  $$
  select net.http_post(
    url := (select edge_base_url || '/functions/v1/medication-reminder-push'
            from fammy_private.config limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select service_role_key from fammy_private.config limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);


-- ============================================================
-- BLOCCO: fammy-medical-profile-diary.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Sezione Persone Assistite (Fase 2: Profilo medico + Diario)
-- =====================================================================
-- Aggiunge:
--   1. `medical_profiles` (1:1 con members) — gruppo sanguigno, allergie,
--      contatti emergenza, condizioni note, medico curante, allergie alimentari
--   2. `daily_diary` — note giornaliere (sonno, umore, appetito, eventi)
--   3. Edge function `medication-reminder-push` deployata SEPARATAMENTE
--      (vedi /app/frontend/supabase/_dashboard_standalone/medication-reminder-push.ts)
--
-- Privacy: medesime regole della Fase 1 (membri della stessa famiglia).
-- Idempotente.

-- ============ 1) Profilo medico (1:1 con members) ============
create table if not exists public.medical_profiles (
  member_id uuid primary key references public.members(id) on delete cascade,
  blood_type varchar,                    -- 'A+', 'B-', '0+', 'AB+'...
  allergies text[] not null default array[]::text[],
  food_intolerances text[] not null default array[]::text[],
  conditions text,                       -- testo libero: "Diabete tipo 2, ipertensione"
  emergency_contact_name varchar,        -- nome del contatto emergenza
  emergency_contact_phone varchar,       -- es. "+39 333..."
  emergency_contact_relation varchar,    -- "figlio", "moglie", "vicino"
  doctor_name varchar,
  doctor_phone varchar,
  health_card_number varchar,            -- tessera sanitaria
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id) on delete set null
);

-- Trigger updated_at
create or replace function public._touch_medical_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_medical_updated on public.medical_profiles;
create trigger trg_medical_updated
  before update on public.medical_profiles
  for each row execute function public._touch_medical_updated_at();

alter table public.medical_profiles enable row level security;

drop policy if exists "medical_select_same_family" on public.medical_profiles;
create policy "medical_select_same_family"
  on public.medical_profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  );

drop policy if exists "medical_modify_same_family" on public.medical_profiles;
create policy "medical_modify_same_family"
  on public.medical_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = medical_profiles.member_id
    )
  );

-- ============ 2) Diario giornaliero ============
-- Una riga per (member_id, date). Tracking opzionale di sonno, umore,
-- appetito + note libere. La famiglia può vedere e contribuire.
create table if not exists public.daily_diary (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  diary_date date not null,
  -- mood: 1-5 ★ (1 = pessimo, 5 = ottimo)
  mood smallint check (mood between 1 and 5),
  sleep_hours numeric(4, 1),             -- es. 7.5
  -- appetite: 1-3 (poco / normale / molto)
  appetite smallint check (appetite between 1 and 3),
  -- weight in kg (opzionale)
  weight_kg numeric(5, 1),
  notes text,
  recorded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, diary_date)
);

create index if not exists idx_diary_member_date
  on public.daily_diary(member_id, diary_date desc);

drop trigger if exists trg_diary_updated on public.daily_diary;
create trigger trg_diary_updated
  before update on public.daily_diary
  for each row execute function public._touch_medical_updated_at();

alter table public.daily_diary enable row level security;

drop policy if exists "diary_select_same_family" on public.daily_diary;
create policy "diary_select_same_family"
  on public.daily_diary for select
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  );

drop policy if exists "diary_modify_same_family" on public.daily_diary;
create policy "diary_modify_same_family"
  on public.daily_diary for all
  to authenticated
  using (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  )
  with check (
    exists (
      select 1 from public.members me
      join public.members target on target.family_id = me.family_id
      where me.user_id = auth.uid() and target.id = daily_diary.member_id
    )
  );

do $$
begin
  begin alter publication supabase_realtime add table public.medical_profiles;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.daily_diary;
  exception when duplicate_object then null; end;
end$$;


-- ============================================================
-- BLOCCO: fammy-caregivers.sql
-- ============================================================
-- ============================================================
-- FAMMY · Caregiver system (Fase 3 Care Hub)
-- ============================================================
-- Un membro "assistito" (es. nonna senza smartphone, bambino,
-- persona con demenza) può avere uno o più "caregiver" — altri
-- membri della stessa famiglia che si occupano di lui/lei.
--
-- Comportamenti sbloccati:
--  • Push di reminder medicine vanno SOLO ai caregiver (non a tutta
--    la famiglia, e ovviamente non all'assistito che non userebbe
--    il telefono)
--  • Care Hub mostra badge "🤝 Caregiver: Maria, Luca"
--  • Profilo personale mostra sezione "👥 Persone che assisto"
--    con shortcut diretto al loro Care Hub
--  • FamilyTab mostra mini-chip "🤝 Maria" sotto il nome dell'assistito
--  • Bacheca saluta "Ciao Maria — sei caregiver di Pina" se applicabile
-- ============================================================

-- 1) Colonna cared_by — array di members.id che sono caregivers
--    di questo assistito. Default vuoto.
alter table public.members
  add column if not exists cared_by uuid[] not null default '{}'::uuid[];

-- 2) Index GIN per query rapide "trova tutti i miei assistiti"
create index if not exists idx_members_cared_by
  on public.members using gin (cared_by);

-- 3) Helper SQL: dato un member_id, ritorna gli user_id auth dei
--    caregiver da notificare (escludendo placeholder senza account).
--    Usata da edge function medication-reminder-push.
create or replace function public.get_member_caregiver_user_ids(p_member_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m_c.user_id
  from public.members m_target
  cross join lateral unnest(m_target.cared_by) as cg_id
  join public.members m_c on m_c.id = cg_id
  where m_target.id = p_member_id
    and m_c.user_id is not null;
$$;

comment on function public.get_member_caregiver_user_ids is
  'Restituisce gli user_id (auth.uid) dei caregiver attivi assegnati a un membro. Esclude caregiver senza account.';

-- 4) Helper SQL: per un dato auth.uid, ritorna la lista di assistiti
--    di cui è caregiver. Usata dal Profilo per la sezione "Assisto".
create or replace function public.get_my_assisted_members()
returns table(
  member_id uuid,
  member_name text,
  family_id uuid,
  member_avatar_letter text,
  member_avatar_color text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id from public.members where user_id = auth.uid()
  )
  select distinct
    m.id, m.name, m.family_id, m.avatar_letter, m.avatar_color
  from public.members m
  where m.is_assisted = true
    and exists (
      select 1 from me where me.id = any(m.cared_by)
    );
$$;

comment on function public.get_my_assisted_members is
  'Lista degli assistiti di cui l''utente corrente è caregiver.';


-- ============================================================
-- BLOCCO: fammy-ai-chat-table.sql
-- ============================================================
-- =====================================================================
-- FAMMY — AI Chat History storage for Edge Functions
--
-- Run this once on Supabase → SQL Editor → New query → Paste → Run.
-- Creates the table the `ai-chat` Edge Function persists chat turns to,
-- plus a tight RLS policy so users can only read their own messages.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          bigserial PRIMARY KEY,
  session_id  text         NOT NULL,
  user_id     text         NOT NULL,
  role        text         NOT NULL CHECK (role IN ('user','assistant','system')),
  content     text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user    ON public.chat_messages (user_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SELECT only rows they own.
DROP POLICY IF EXISTS chat_messages_select_own ON public.chat_messages;
CREATE POLICY chat_messages_select_own ON public.chat_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

-- INSERT/UPDATE/DELETE are reserved for the service role (Edge Function).
DROP POLICY IF EXISTS chat_messages_block_writes ON public.chat_messages;
CREATE POLICY chat_messages_block_writes ON public.chat_messages
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.chat_messages IS 'Multi-turn chat history written by the ai-chat Edge Function.';


-- ============================================================
