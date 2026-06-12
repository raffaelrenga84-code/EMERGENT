-- =====================================================================
-- FAMMY — MASTER RESTORE dopo reset accidentale dello schema
-- ---------------------------------------------------------------------
-- Esegui SOLO questo file su Supabase Dashboard → SQL Editor.
-- Riallinea il DB con TUTTE le colonne/tabelle/funzioni che il codice
-- frontend si aspetta. Idempotente: rilanciabile.
--
-- IMPORTANTE: prima di eseguire questo file, assicurati di:
--   1. Aver eseguito `fammy-schema.sql` (lo schema base) — già fatto
--   2. NON eseguirlo di nuovo per nessun motivo (drop+create distruttivo)
-- =====================================================================


-- ============================================================
-- BLOCCO: fammy-auth-trigger.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Trigger di sincronizzazione profili
-- ---------------------------------------------------------------------
--  Quando un utente fa login per la prima volta (via magic link),
--  Supabase crea automaticamente una riga in auth.users.
--  Noi vogliamo che, in parallelo, venga creata anche una riga in
--  public.profiles con il display_name preso dall'email.
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase.
-- =====================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_letter)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    upper(substring(coalesce(new.raw_user_meta_data->>'display_name', new.email) from 1 for 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- BLOCCO: fammy-profile-hotfix.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Hotfix profile creation (FIX P0)
-- ---------------------------------------------------------------------
--  Risolve l'errore "insert or update on table 'families' violates
--  foreign key constraint families_created_by_fkey".
--
--  Root causes (3 problemi):
--
--   1) MISSING RLS INSERT POLICY su `profiles`
--      Lo schema ha `profiles_read_all` (SELECT) e `profiles_update_own`
--      (UPDATE), ma NON una policy INSERT. Quindi qualsiasi upsert
--      client-side su profiles veniva silenziosamente bloccato da RLS.
--
--   2) TRIGGER `handle_new_user` RIGIDO sui phone signup
--      Il trigger usava `split_part(new.email, '@', 1)` ma per i signup
--      via phone OTP `email` è NULL → split_part(null,...) ritorna ''
--      → `display_name` finiva stringa vuota o, peggio, il trigger andava
--      in errore e il profile non veniva creato → tutti i flow successivi
--      (creazione famiglia con FK created_by → profiles.id) fallivano.
--
--   3) PROFILI ORFANI esistenti
--      Gli utenti creati PRIMA del fix del trigger non hanno una riga in
--      profiles. Vanno backfillati con dati minimi (display_name + letter).
--
--  Esegui SOLO questo file su Supabase Dashboard → SQL Editor → Run.
--  Idempotente: rilanciabile senza danni.
-- =====================================================================

-- =====================================================================
-- (1) Policy INSERT su profiles (manca dallo schema iniziale)
-- =====================================================================
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

-- =====================================================================
-- (2) Trigger `handle_new_user` robusto a phone-only signup
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_letter text;
begin
  -- Display name fallback chain:
  -- 1) raw_user_meta_data.full_name (Google OAuth)
  -- 2) raw_user_meta_data.name (alt label)
  -- 3) raw_user_meta_data.display_name (custom)
  -- 4) split_part(email, '@', 1) (email signup)
  -- 5) phone (phone OTP signup)
  -- 6) 'Membro' (last resort)
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Membro'
  );

  v_letter := upper(substring(v_name from 1 for 1));
  if v_letter is null or v_letter = '' then v_letter := 'M'; end if;

  -- INSERT idempotente: se la riga esiste già (es. backfill manuale),
  -- non solleviamo errore. ON CONFLICT NOTHING evita rollback.
  insert into public.profiles (id, display_name, avatar_letter)
  values (new.id, v_name, v_letter)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Non bloccare MAI il signup auth a causa di un errore in profiles:
    -- al peggio il profilo viene creato lato client al primo login.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- (3) Backfill: ricrea profili mancanti per utenti già esistenti
-- =====================================================================
insert into public.profiles (id, display_name, avatar_letter)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(u.raw_user_meta_data->>'display_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    u.phone,
    'Membro'
  ) as display_name,
  upper(substring(
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      nullif(u.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      u.phone,
      'Membro'
    )
    from 1 for 1
  )) as avatar_letter
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- =====================================================================
-- FINE — dopo aver eseguito questo file:
--   ✅ Tutti gli utenti hanno una riga in profiles
--   ✅ Il trigger gestisce email NULL (phone signup) senza fallire
--   ✅ Il safety net client-side in App.jsx ora può fare upsert
--   ✅ La creazione famiglia con created_by → profiles(id) non viola più FK
-- =====================================================================


-- ============================================================
-- BLOCCO: fammy-add-birthdate.sql
-- ============================================================
-- =====================================================================
-- Aggiunta di birth_date per gestire i compleanni
-- =====================================================================

-- Aggiungi campo birth_date a members
ALTER TABLE members
ADD COLUMN birth_date date;

-- Commento per chiarezza
COMMENT ON COLUMN members.birth_date IS 'Data di nascita del membro per calcolare i compleanni';

-- Crea un indice per cercare velocemente i compleanni di oggi/domani
CREATE INDEX IF NOT EXISTS idx_members_birth_date ON members(birth_date);


-- ============================================================
-- BLOCCO: fammy-add-google-avatar.sql
-- ============================================================
-- =====================================================================
-- Aggiunta di avatar_url per foto profilo da Google
-- =====================================================================

-- Aggiungi campo avatar_url a profiles
ALTER TABLE profiles
ADD COLUMN avatar_url text;

-- Aggiungi campo avatar_url a members
ALTER TABLE members
ADD COLUMN avatar_url text;

-- Commento per chiarezza
COMMENT ON COLUMN profiles.avatar_url IS 'URL della foto profilo da Google People API o provider OAuth';
COMMENT ON COLUMN members.avatar_url IS 'URL della foto profilo da Google People API o provider OAuth';


-- ============================================================
-- BLOCCO: fammy-add-ical.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Aggiunge token per export iCal per famiglia
-- ---------------------------------------------------------------------
--  Ogni famiglia avrà un token segreto stabile, usato come URL
--  pubblico di sottoscrizione iCal. Es:
--     https://fammy-flame.vercel.app/api/ical/abc123def456.ics
--
--  Da eseguire UNA VOLTA nel SQL Editor di Supabase. Idempotente.
-- =====================================================================

-- 1. Aggiungi la colonna se non esiste
alter table families
  add column if not exists ical_token text;

-- 2. Genera un token per le famiglie esistenti che non l'hanno
update families
  set ical_token = encode(gen_random_bytes(16), 'hex')
  where ical_token is null;

-- 3. Default per le famiglie create d'ora in poi
alter table families
  alter column ical_token set default encode(gen_random_bytes(16), 'hex');

-- 4. Vincolo not null + indice unico
alter table families
  alter column ical_token set not null;

create unique index if not exists idx_families_ical_token on families(ical_token);

-- 5. Permetti revoca: rigenera token (chiamabile via RPC dal frontend)
create or replace function regenerate_ical_token(family uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  new_token text;
begin
  if not exists (select 1 from members where family_id = family and user_id = auth.uid()) then
    raise exception 'Non sei membro di questa famiglia';
  end if;
  new_token := encode(gen_random_bytes(16), 'hex');
  update families set ical_token = new_token where id = family;
  return new_token;
end;
$$;

grant execute on function regenerate_ical_token(uuid) to authenticated;


-- ============================================================
-- BLOCCO: fammy-add-assignee.sql
-- ============================================================
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


-- ============================================================
-- BLOCCO: fammy-add-expense-shares.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Spese con split / rimborso
-- ---------------------------------------------------------------------
--  Una spesa può essere divisa in N "quote" tra i membri della famiglia
--  (o cross-famiglia). Ogni quota dice quanto un membro deve a chi ha
--  pagato. Quando rimborsa, la quota viene marcata "settled".
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

create table if not exists expense_shares (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id)  on delete cascade,
  amount      numeric(10,2) not null check (amount >= 0),
  settled     boolean not null default false,
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  primary key (expense_id, member_id)
);

create index if not exists idx_expense_shares_expense on expense_shares(expense_id);
create index if not exists idx_expense_shares_member  on expense_shares(member_id);

alter table expense_shares enable row level security;

drop policy if exists "expense_shares_rw" on expense_shares;
create policy "expense_shares_rw" on expense_shares for all
  using (exists (select 1 from expenses e where e.id = expense_id and is_family_member(e.family_id)))
  with check (exists (select 1 from expenses e where e.id = expense_id and is_family_member(e.family_id)));


-- ============================================================
-- BLOCCO: fammy-add-spese-category.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Aggiunge categoria 'spese' ai task
-- ---------------------------------------------------------------------
--  Da eseguire UNA VOLTA su Supabase. Sostituisce solo il check constraint,
--  niente di distruttivo.
-- =====================================================================

alter table tasks drop constraint if exists tasks_category_check;
alter table tasks add constraint tasks_category_check
  check (category in ('care','home','health','admin','other','spese'));


-- ============================================================
-- BLOCCO: fammy-invite-code.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Codice invito famiglia (6 char) + accept by code
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente: sicuro rieseguire.
--
-- Perché un codice invito?
-- L'email non è affidabile per evitare doppioni (Google→gmail vs
-- Apple→icloud vs Magic link→hotmail = 3 utenti distinti). Un codice
-- breve è la soluzione standard (Splitwise, WhatsApp, ecc.) e funziona
-- a prescindere dal provider.

-- 1) Colonna invite_code su families (6 char A-Z 0-9, unique)
alter table public.families add column if not exists invite_code text unique;

-- Funzione che genera un codice random 6-char (no caratteri ambigui: 0,O,1,I,L)
create or replace function fammy_gen_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end$$;

-- Riempi i codici mancanti per famiglie esistenti (retry su collisione)
do $$
declare
  fam record;
  candidate text;
  attempts int;
begin
  for fam in select id from public.families where invite_code is null loop
    attempts := 0;
    loop
      candidate := fammy_gen_invite_code();
      attempts := attempts + 1;
      begin
        update public.families set invite_code = candidate where id = fam.id;
        exit;
      exception when unique_violation then
        if attempts > 10 then raise exception 'troppe collisioni per family %', fam.id; end if;
      end;
    end loop;
  end loop;
end$$;

-- Trigger: auto-generate per i nuovi inserimenti
create or replace function fammy_set_invite_code()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.invite_code is not null then return new; end if;
  loop
    candidate := fammy_gen_invite_code();
    attempts := attempts + 1;
    -- Verifica unicità prima di assegnare (la PK fa il resto)
    if not exists (select 1 from public.families where invite_code = candidate) then
      new.invite_code := candidate;
      return new;
    end if;
    if attempts > 10 then raise exception 'troppe collisioni invite_code'; end if;
  end loop;
end$$;

drop trigger if exists trg_set_invite_code on public.families;
create trigger trg_set_invite_code before insert on public.families
  for each row execute function fammy_set_invite_code();

-- 2) Funzione RPC: accept_family_by_code(code, member_name?)
-- Sicura, SECURITY DEFINER. Anti-doppione: se l'utente è GIÀ membro
-- di quella famiglia, non crea un duplicato, restituisce solo OK.
create or replace function public.accept_family_by_code(
  p_code text,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_family_name text;
  v_existing_id uuid;
  v_member_id uuid;
  v_user_name text;
  v_user_avatar text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Trova la famiglia (codice case-insensitive)
  select id, name into v_family_id, v_family_name
  from public.families where upper(invite_code) = upper(trim(p_code))
  limit 1;

  if v_family_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  -- Anti-doppione: utente già membro?
  select id into v_existing_id
  from public.members where family_id = v_family_id and user_id = auth.uid()
  limit 1;
  if v_existing_id is not null then
    return jsonb_build_object('ok', true, 'family_id', v_family_id,
      'family_name', v_family_name, 'already_member', true);
  end if;

  -- Recupera name + avatar dal profilo
  select coalesce(p_name, display_name, 'Membro'), upper(left(coalesce(p_name, display_name, 'M'), 1))
  into v_user_name, v_user_avatar
  from public.profiles where id = auth.uid();

  -- Crea il member
  insert into public.members (family_id, user_id, name, role, avatar_letter, status)
  values (v_family_id, auth.uid(), v_user_name, 'membro', v_user_avatar, 'active')
  returning id into v_member_id;

  return jsonb_build_object('ok', true, 'family_id', v_family_id,
    'family_name', v_family_name, 'member_id', v_member_id, 'already_member', false);
end$$;

grant execute on function public.accept_family_by_code(text, text) to authenticated;

-- 3) RPC: peek_family_by_code(code) → ritorna info anteprima SENZA joinare.
-- Usato dal frontend per mostrare "Stai per unirti a 🌳 TEST (3 membri)"
-- prima del join. Non rivela info sensibili (solo nome/emoji/count).
create or replace function public.peek_family_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_family_name text;
  v_emoji text;
  v_members_count int;
  v_already_member boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select id, name, emoji into v_family_id, v_family_name, v_emoji
  from public.families where upper(invite_code) = upper(trim(p_code))
  limit 1;

  if v_family_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select count(*) into v_members_count
  from public.members where family_id = v_family_id and status = 'active';

  select exists(
    select 1 from public.members
    where family_id = v_family_id and user_id = auth.uid()
  ) into v_already_member;

  return jsonb_build_object(
    'ok', true,
    'family_id', v_family_id,
    'family_name', v_family_name,
    'emoji', v_emoji,
    'members_count', v_members_count,
    'already_member', v_already_member
  );
end$$;

grant execute on function public.peek_family_by_code(text) to authenticated;

-- 4) RPC: regenerate_family_invite_code(family_id) → solo il creator può
-- rigenerare il codice. Utile se il vecchio è finito a qualcuno che non
-- dovrebbe averlo.
create or replace function public.regenerate_family_invite_code(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_new_code text;
  v_attempts int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select created_by into v_owner from public.families where id = p_family_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'family_not_found');
  end if;
  if v_owner <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;
  loop
    v_new_code := fammy_gen_invite_code();
    v_attempts := v_attempts + 1;
    if not exists (select 1 from public.families where invite_code = v_new_code) then
      update public.families set invite_code = v_new_code where id = p_family_id;
      return jsonb_build_object('ok', true, 'new_code', v_new_code);
    end if;
    if v_attempts > 10 then
      return jsonb_build_object('ok', false, 'error', 'collisions');
    end if;
  end loop;
end$$;

grant execute on function public.regenerate_family_invite_code(uuid) to authenticated;

-- =====================================================================
-- USO LATO FRONTEND:
--   const { data, error } = await supabase.rpc('accept_family_by_code', {
--     p_code: 'MX68YV', p_name: 'Marco'
--   });
--   if (data.ok) toast(`Benvenuto in ${data.family_name}!`);
-- =====================================================================


-- ============================================================
-- BLOCCO: fammy-family-photo.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Foto famiglia (al posto/oltre emoji)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente.

-- 1) Colonna photo_url su families (path del file nel bucket)
alter table public.families add column if not exists photo_url text;

-- 2) Bucket pubblico per le copertine famiglia
-- Pubblico = niente signed URL, le copertine sono ok-da-vedere (nessun
-- dato sensibile). I path includono comunque il family_id.
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

-- Policies: solo i membri possono caricare/eliminare, lettura aperta (bucket public)
drop policy if exists "Family members can upload family photo" on storage.objects;
drop policy if exists "Family members can delete family photo" on storage.objects;

create policy "Family members can upload family photo"
  on storage.objects for insert
  with check (
    bucket_id = 'family-photos' and auth.role() = 'authenticated'
  );

create policy "Family members can delete family photo"
  on storage.objects for delete
  using (
    bucket_id = 'family-photos' and auth.role() = 'authenticated'
  );


-- ============================================================
-- BLOCCO: fammy-photo-permissions.sql
-- ============================================================
-- ============================================================================
-- FAMMY — Family + Members Photo Upload (allargamento policy)
--
-- Idempotente. Concede a TUTTI i membri (non solo al creator) di:
--   • Modificare nome, emoji, photo_url della famiglia
--   • Modificare campi cosmetici del proprio member record
--   • Caricare/cancellare foto nel bucket 'family-photos'
--   • Caricare/cancellare foto nel bucket 'member-avatars'
--
-- Non tocca le restrizioni di sicurezza:
--   • L'eliminazione della famiglia resta solo del creator
--   • La rimozione di altri member resta solo del creator
-- ============================================================================

-- 1) FAMILY UPDATE — tutti i membri (non solo il creator)
drop policy if exists "Update family if member" on public.families;
create policy "Update family if member"
  on public.families for update
  to authenticated
  using (
    -- Sono il creator OPPURE sono membro di questa famiglia
    created_by = auth.uid()
    or exists (
      select 1 from public.members m
      where m.family_id = families.id and m.user_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.members m
      where m.family_id = families.id and m.user_id = auth.uid()
    )
  );

-- 2) BUCKET family-photos — tutti i membri possono uploadare/cancellare
insert into storage.buckets (id, name, public)
values ('family-photos', 'family-photos', true)
on conflict (id) do nothing;

drop policy if exists "Family members can upload family photo" on storage.objects;
drop policy if exists "Family members can update family photo" on storage.objects;
drop policy if exists "Family members can delete family photo" on storage.objects;
drop policy if exists "Anyone can read family photo" on storage.objects;

create policy "Anyone can read family photo"
  on storage.objects for select
  using (bucket_id = 'family-photos');

create policy "Family members can upload family photo"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'family-photos');

create policy "Family members can update family photo"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'family-photos')
  with check (bucket_id = 'family-photos');

create policy "Family members can delete family photo"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'family-photos');


-- 3) MEMBER AVATARS — bucket per le foto profilo individuali
alter table public.members add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('member-avatars', 'member-avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can read member avatar" on storage.objects;
drop policy if exists "Members can upload member avatar" on storage.objects;
drop policy if exists "Members can update member avatar" on storage.objects;
drop policy if exists "Members can delete member avatar" on storage.objects;

create policy "Anyone can read member avatar"
  on storage.objects for select
  using (bucket_id = 'member-avatars');

create policy "Members can upload member avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'member-avatars');

create policy "Members can update member avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'member-avatars')
  with check (bucket_id = 'member-avatars');

create policy "Members can delete member avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'member-avatars');


-- 4) MEMBERS — tutti possono modificare i propri dati cosmetici;
--    il creator della famiglia può modificare quelli degli altri.
drop policy if exists "Update own member or as family creator" on public.members;
create policy "Update own member or as family creator"
  on public.members for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.families f
      where f.id = members.family_id and f.created_by = auth.uid()
    )
  );

-- ============================================================================
-- DONE.
-- ============================================================================


-- ============================================================
-- BLOCCO: fammy-member-address.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Indirizzo membro (opzionale)
-- ---------------------------------------------------------------------
--  Aggiunge colonna `address` a `members` (e a `profiles` per
--  persistenza cross-family: se l'utente cambia famiglia, l'indirizzo
--  resta).
--  L'utente lo edita dal proprio Profilo → poi viene mostrato nelle
--  MemberCard di FamilyTab.
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

-- Per il membro corrente nella famiglia
alter table public.members
  add column if not exists address text;
comment on column public.members.address is
  'Indirizzo opzionale di residenza del membro. Visibile agli altri membri della famiglia.';

-- Per il profilo cross-family: quando un utente è in più famiglie,
-- l'indirizzo viene "propagato" a tutte le sue righe members. Per ora
-- lo salviamo SOLO in members; in futuro potremmo sincronizzarlo.
alter table public.profiles
  add column if not exists address text;
comment on column public.profiles.address is
  'Indirizzo opzionale (fonte canonica). Sincronizzato in tutti i members dell utente.';

-- Trigger: quando l'utente aggiorna `profiles.address`, propaga
-- l'aggiornamento a tutti i `members` con quel user_id (così l'utente
-- non deve editarlo in ogni famiglia separatamente).
create or replace function public.fammy_sync_profile_address_to_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.address is distinct from old.address then
    update public.members set address = new.address where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_address_profile_to_members on public.profiles;
create trigger trg_sync_address_profile_to_members
  after update of address on public.profiles
  for each row execute function public.fammy_sync_profile_address_to_members();


-- ============================================================
-- BLOCCO: fammy-phone-auth.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Phone Auth support
-- ---------------------------------------------------------------------
--  1) Aggiorna il trigger handle_new_user per gestire utenti solo-telefono
--     (senza email). Prima fallava con "Database error saving new user".
--  2) Aggiunge la colonna `phone` alla tabella public.profiles per
--     permettere a chi entra via Google/Email di aggiungere il proprio
--     telefono e poter loggarsi anche con SMS in futuro.
--
--  Idempotente: eseguibile più volte senza errori.
-- =====================================================================

-- 1) Colonna phone (E.164 format: +393331234567)
alter table public.profiles
  add column if not exists phone text;

-- Index unico per accelerare le lookup "trova profilo per telefono"
-- (utile in futuro per "invita per SMS")
create unique index if not exists profiles_phone_idx
  on public.profiles(phone)
  where phone is not null;

-- 2) Trigger aggiornato — robusto su utenti solo email, solo phone, o entrambi.
--    Gestisce 3 casi:
--    A) signup email-only (phone NULL)         → INSERT profilo con phone NULL
--    B) signup phone-only / phone+email nuovo → INSERT profilo con phone valorizzato
--    C) signup phone già esistente in un altro profile (caso "secondo account
--       per stessa persona reale", es. Google+Phone) → INSERT con phone NULL
--       per evitare l'UNIQUE violation. L'utente potrà fare merge dal Profilo.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_display      text;
  v_letter       text;
  v_phone        text;
  v_phone_taken  boolean := false;
begin
  -- Display name di fallback con priorità:
  -- 1. metadata.display_name (passato esplicitamente, es. OAuth)
  -- 2. metadata.full_name / metadata.name (Google/Apple)
  -- 3. parte locale dell'email
  -- 4. ultime 4 cifre del telefono (es. "*7531")
  -- 5. "Membro" (fallback finale)
  v_display := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    case when new.phone is not null and length(new.phone) > 4
         then '*' || right(new.phone, 4)
         else null
    end,
    'Membro'
  );

  v_letter := upper(substring(v_display from 1 for 1));
  v_phone  := nullif(new.phone, '');

  -- Caso C: phone già preso in un altro profilo → lasciamo NULL per evitare
  -- duplicate-key violation su profiles_phone_idx. L'utente potrà mergeare
  -- i due account tramite il flow "Merge Account" del Profilo.
  if v_phone is not null then
    select exists (
      select 1 from public.profiles where phone = v_phone and id <> new.id
    ) into v_phone_taken;
    if v_phone_taken then
      v_phone := null;
    end if;
  end if;

  -- Anti-conflitto sull'id (es. utente che si è loggato prima via Google e poi
  -- sta confermando il telefono dallo stesso account): fai UPDATE invece di INSERT.
  insert into public.profiles (id, display_name, avatar_letter, phone)
  values (new.id, v_display, v_letter, v_phone)
  on conflict (id) do update set
    phone = coalesce(public.profiles.phone, excluded.phone),
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
exception when others then
  -- Difesa in profondità: se per qualsiasi motivo l'INSERT fallisce ancora,
  -- NON bloccare la creazione di auth.users — logghiamo soltanto. Il profile
  -- mancante verrà creato lazy al primo login dal client.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- 3) Backfill: copia il numero di telefono di auth.users → public.profiles
--    per gli utenti già esistenti che lo hanno (es. la tua ragazza Jenna).
update public.profiles p
  set phone = u.phone
  from auth.users u
  where u.id = p.id
    and u.phone is not null
    and u.phone <> ''
    and p.phone is null;

-- 4) Funzione helper: l'utente loggato può aggiornare il proprio phone
--    chiamando questa RPC. Aggiorna sia auth.users.phone (se ancora vuoto)
--    sia public.profiles.phone. Lato auth.users questo NON triggera SMS:
--    è solo per "claim" del numero per matchare login futuri.
--    Per il claim "ufficiale" con verifica SMS l'utente userà
--    supabase.auth.updateUser({ phone }) dal client.
create or replace function public.fammy_set_profile_phone(p_phone text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
    set phone = nullif(p_phone, '')
    where id = auth.uid();
end;
$$;

grant execute on function public.fammy_set_profile_phone(text) to authenticated;


-- ============================================================
-- BLOCCO: fammy-calendar-tokens.sql
-- ============================================================
-- =====================================================================
--  FAMMY — Calendar Tokens per ICS/CalDAV feed live
-- ---------------------------------------------------------------------
--  Tabella che custodisce un token segreto per ogni utente, usato per
--  l'endpoint pubblico backend `/api/calendar/{token}.ics`.
--
--  L'utente genera il proprio token dal Profilo (max 1 per utente),
--  poi incolla il link es. `https://fammy-flame.vercel.app/api/calendar/abc123.ics`
--  in Apple Calendar / Google Calendar → sincronizzazione automatica
--  ogni ora, no più email settimanale.
--
--  Idempotente. Da eseguire su Supabase Dashboard → SQL Editor → Run.
-- =====================================================================

create table if not exists public.calendar_tokens (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- Indice per lookup veloce dal backend
create index if not exists idx_calendar_tokens_token on public.calendar_tokens(token)
  where revoked_at is null;

alter table public.calendar_tokens enable row level security;

-- L'utente può vedere/modificare solo il proprio token
drop policy if exists "calendar_tokens_owner_rw" on public.calendar_tokens;
create policy "calendar_tokens_owner_rw" on public.calendar_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- RPC: rotazione token (genera nuovo + invalida vecchi)
create or replace function public.rotate_calendar_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.calendar_tokens (user_id, token)
    values (auth.uid(), v_token)
  on conflict (user_id) do update
    set token = excluded.token,
        created_at = now(),
        revoked_at = null;
  return v_token;
end;
$$;

grant execute on function public.rotate_calendar_token() to authenticated;

-- RPC: leggi il proprio token (se esiste)
create or replace function public.get_calendar_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then return null; end if;
  select token into v_token from public.calendar_tokens
    where user_id = auth.uid() and revoked_at is null;
  return v_token;
end;
$$;

grant execute on function public.get_calendar_token() to authenticated;


-- ============================================================
-- BLOCCO: fammy-recurring-tasks.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Task ricorrenti (settimanali)
-- ---------------------------------------------------------------------
--  Aggiunge recurring_days + recurring_until a tasks (come per events).
--  Aggiunge task_completions: per ogni "istanza" di task ricorrente
--  segnata come fatta, c'è una riga.
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

alter table tasks add column if not exists recurring_days  int[];
alter table tasks add column if not exists recurring_until date;

create table if not exists task_completions (
  task_id          uuid not null references tasks(id) on delete cascade,
  occurrence_date  date not null,
  completed_at     timestamptz not null default now(),
  completed_by     uuid references members(id) on delete set null,
  primary key (task_id, occurrence_date)
);

create index if not exists idx_task_completions_task on task_completions(task_id);

alter table task_completions enable row level security;

drop policy if exists "task_completions_rw" on task_completions;
create policy "task_completions_rw" on task_completions for all
  using (exists (select 1 from tasks t where t.id = task_id and (
    is_family_member(t.family_id)
    or exists (select 1 from task_assignees ta join members m on m.id = ta.member_id
               where ta.task_id = t.id and m.user_id = auth.uid())
  )))
  with check (exists (select 1 from tasks t where t.id = task_id and (
    is_family_member(t.family_id)
    or exists (select 1 from task_assignees ta join members m on m.id = ta.member_id
               where ta.task_id = t.id and m.user_id = auth.uid())
  )));


-- ============================================================
-- BLOCCO: fammy-recurring-exceptions.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Eccezioni per occorrenze singole di eventi/task ricorrenti
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente: sicuro rieseguire.
--
-- Cosa fa:
-- Aggiunge una colonna `recurring_exceptions text[]` (array di date YYYY-MM-DD)
-- su events e tasks. Quando l'utente elimina o modifica UNA SOLA occorrenza
-- di una serie ricorrente, la data viene aggiunta a questo array e il
-- frontend la salta nell'espansione.

alter table public.events add column if not exists recurring_exceptions text[];
alter table public.tasks  add column if not exists recurring_exceptions text[];

-- Indici GIN per query veloci (se mai filtriamo per "questa data è esclusa")
create index if not exists idx_events_recurring_exceptions
  on public.events using gin (recurring_exceptions);
create index if not exists idx_tasks_recurring_exceptions
  on public.tasks using gin (recurring_exceptions);


-- ============================================================
-- BLOCCO: fammy-unify-task-event-schema.sql
-- ============================================================
-- =====================================================================
-- FAMMY — Unifica i campi tra task ed eventi (per le nuove modali)
-- =====================================================================
-- Esegui UNA volta su Supabase Dashboard → SQL Editor → Run.
-- Idempotente — colonne e tabelle vengono create solo se mancanti.

-- 1) TASKS: aggiungi ORA (HH:MM) e LUOGO opzionali
alter table public.tasks add column if not exists due_time text;
alter table public.tasks add column if not exists location text;

-- 2) EVENT_ASSIGNEES — mirror di task_assignees, gli eventi ora supportano
--    "assegnato a" (chi partecipa). Composite PK previene duplicati.
create table if not exists public.event_assignees (
  event_id  uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists idx_event_assignees_event on public.event_assignees(event_id);
create index if not exists idx_event_assignees_member on public.event_assignees(member_id);

alter table public.event_assignees enable row level security;

drop policy if exists "event_assignees_rw" on public.event_assignees;
create policy "event_assignees_rw" on public.event_assignees
for all using (
  exists (
    select 1 from public.events ev
    join public.members me on me.family_id = ev.family_id
    where ev.id = event_assignees.event_id
      and me.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.events ev
    join public.members me on me.family_id = ev.family_id
    where ev.id = event_assignees.event_id
      and me.user_id = auth.uid()
  )
);

-- 3) EVENT_ATTACHMENTS — mirror di task_attachments per le foto degli eventi
create table if not exists public.event_attachments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_path varchar not null,
  file_name varchar not null,
  created_at timestamptz not null default now()
);

alter table public.event_attachments enable row level security;
create index if not exists idx_event_attachments_event on public.event_attachments(event_id);

drop policy if exists "Users can view event attachments in their families" on public.event_attachments;
drop policy if exists "Users can insert event attachments in their families" on public.event_attachments;
drop policy if exists "Users can delete event attachments in their families" on public.event_attachments;

create policy "Users can view event attachments in their families"
  on public.event_attachments for select
  using (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

create policy "Users can insert event attachments in their families"
  on public.event_attachments for insert
  with check (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

create policy "Users can delete event attachments in their families"
  on public.event_attachments for delete
  using (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

-- 4) STORAGE BUCKET per le foto degli eventi
insert into storage.buckets (id, name, public)
values ('event-attachments', 'event-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload event attachments" on storage.objects;
drop policy if exists "Users can view event attachments" on storage.objects;
drop policy if exists "Users can delete event attachments" on storage.objects;

create policy "Users can upload event attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'event-attachments' and auth.role() = 'authenticated'
  );

create policy "Users can view event attachments"
  on storage.objects for select
  using (
    bucket_id = 'event-attachments' and exists (
      select 1 from public.event_attachments ea
      join public.events e on ea.event_id = e.id
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and ea.file_path = storage.objects.name
    )
  );

create policy "Users can delete event attachments"
  on storage.objects for delete
  using (
    bucket_id = 'event-attachments' and exists (
      select 1 from public.event_attachments ea
      join public.events e on ea.event_id = e.id
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and ea.file_path = storage.objects.name
    )
  );

-- 5) Realtime: aggiungi le nuove tabelle alla publication (idempotente)
do $$
begin
  begin
    alter publication supabase_realtime add table public.event_assignees;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.event_attachments;
  exception when duplicate_object then null;
  end;
end$$;


-- ============================================================
-- BLOCCO: fammy-add-multi-assign-recurring.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Multi-assegnatari + eventi ricorrenti
-- ---------------------------------------------------------------------
--  1. Aggiunge tabella task_assignees (un task può avere più persone)
--  2. Aggiunge recurring_days a events (giorni della settimana 0..6)
--  Da eseguire UNA VOLTA su Supabase.
-- =====================================================================

-- 1. Multi-assegnatari ----------------------------------------------------

create table if not exists task_assignees (
  task_id    uuid not null references tasks(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index if not exists idx_task_assignees_task   on task_assignees(task_id);
create index if not exists idx_task_assignees_member on task_assignees(member_id);

-- Migra le assegnazioni esistenti (single -> join table)
insert into task_assignees (task_id, member_id)
  select id, assigned_to from tasks where assigned_to is not null
  on conflict do nothing;

-- RLS
alter table task_assignees enable row level security;

drop policy if exists "task_assignees_rw" on task_assignees;
create policy "task_assignees_rw" on task_assignees for all
  using (exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id)))
  with check (exists (select 1 from tasks t where t.id = task_id and is_family_member(t.family_id)));


-- 2. Eventi ricorrenti ---------------------------------------------------
-- recurring_days: array int[] con i giorni della settimana
--   0=Lunedì, 1=Martedì, ..., 6=Domenica
--   NULL o array vuoto = evento non ricorrente

alter table events
  add column if not exists recurring_days int[];

alter table events
  add column if not exists recurring_until date;
-- recurring_until: data fino a cui ripetere (NULL = nessun limite, default 1 anno)


-- ============================================================
-- BLOCCO: fammy-cross-family-assign.sql
-- ============================================================
-- =====================================================================
--  FAMMY - Permetti assegnazione task cross-famiglia
-- ---------------------------------------------------------------------
--  Aggiorna la policy RLS di tasks per consentire la visibilità a
--  utenti che NON sono membri della famiglia del task ma che sono
--  stati assegnati al task tramite task_assignees.
--
--  Caso d'uso: Raffael (famiglia Renga) crea un task "andare a prendere
--  nipote a scuola" e lo assegna sia ai nonni di Renga sia ai nonni di
--  Munegato. Anche i nonni Munegato devono vedere quel task nella loro
--  bacheca, anche se appartiene a Renga.
-- =====================================================================

-- 1. Aggiorna policy READ su tasks: includi gli assegnatari
drop policy if exists "tasks_read" on tasks;

create policy "tasks_read" on tasks for select using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = tasks.id and m.user_id = auth.uid()
  )
);

-- 2. Anche gli assegnatari di altre famiglie devono poter scrivere
--    commenti, marcare fatto, ecc. Ma NON modificare il titolo.
--    Per semplicità: chi è assegnato può fare update di status.
--    (Modifica avanzata: ristretta ai membri della famiglia origine.)
drop policy if exists "tasks_write" on tasks;

-- Per ora: chi è membro della famiglia OR assegnato può fare update.
-- Vincolo più stretto: solo author/membri famiglia per modifiche
-- avanzate verrà aggiunto in una versione futura.
create policy "tasks_update" on tasks for update using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = tasks.id and m.user_id = auth.uid()
  )
);

create policy "tasks_insert" on tasks for insert with check (
  is_family_member(family_id)
);

create policy "tasks_delete" on tasks for delete using (
  is_family_member(family_id)
);

-- 3. Permetti agli assegnatari cross-famiglia di leggere i membri
--    della famiglia origine del task (per vedere chi sono gli altri
--    assegnatari nelle UI). Esistente "members_read" usa is_family_member,
--    quindi serve estendere.
drop policy if exists "members_read" on members;

create policy "members_read" on members for select using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m_self on m_self.id = ta.member_id
    join tasks t on t.id = ta.task_id
    where t.family_id = members.family_id and m_self.user_id = auth.uid()
  )
);

-- 4. Stessa cosa per la lettura della famiglia
drop policy if exists "families_read" on families;

create policy "families_read" on families for select using (
  is_family_member(id)
  or created_by = auth.uid()
  or exists (
    select 1 from tasks t
    join task_assignees ta on ta.task_id = t.id
    join members m on m.id = ta.member_id
    where t.family_id = families.id and m.user_id = auth.uid()
  )
);


-- ============================================================
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

  -- Eventuale info sul membro pre-creato
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

  -- Non notificare l'autore se è anche assegnatario di se stesso.
  -- Confronto per UTENTE (non per member id): con più famiglie
  -- l'author_id può appartenere a un membro di un'altra famiglia.
  if new.member_id = v_task.author_id
     or v_assignee_uid = (select user_id from public.members where id = v_task.author_id) then
    return new;
  end if;

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
create policy "Read own prefs"
  on public.user_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert own prefs" on public.user_preferences;
create policy "Insert own prefs"
  on public.user_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Update own prefs" on public.user_preferences;
create policy "Update own prefs"
  on public.user_preferences for update
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

create policy "tasks_select" on tasks for select
  using (is_family_member(family_id));

create policy "tasks_insert" on tasks for insert
  with check (is_family_member(family_id));

create policy "tasks_update" on tasks for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- DELETE: solo il creatore (author_id = mio member.id) o se author_id è null
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

create policy "events_select" on events for select
  using (is_family_member(family_id));

create policy "events_insert" on events for insert
  with check (is_family_member(family_id));

create policy "events_update" on events for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

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

create policy "expenses_select" on expenses for select
  using (is_family_member(family_id));

create policy "expenses_insert" on expenses for insert
  with check (is_family_member(family_id));

create policy "expenses_update" on expenses for update
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

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

CREATE POLICY "Users can view task attachments in their families"
  ON task_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

CREATE POLICY "Users can insert task attachments for tasks in their families"
  ON task_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND t.id = task_attachments.task_id
    )
  );

CREATE POLICY "Users can delete task attachments they created"
  ON task_attachments FOR DELETE
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

CREATE POLICY "Users can upload task attachments in their families"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view task attachments in their families"
  ON storage.objects FOR SELECT
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

CREATE POLICY "Users can delete task attachments they have access to"
  ON storage.objects FOR DELETE
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

CREATE POLICY "Users can view expense attachments in their families"
  ON expense_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

CREATE POLICY "Users can insert expense attachments for expenses in their families"
  ON expense_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      WHERE e.family_id IN (
        SELECT family_id FROM members WHERE user_id = auth.uid()
      )
      AND e.id = expense_attachments.expense_id
    )
  );

CREATE POLICY "Users can delete expense attachments they have access to"
  ON expense_attachments FOR DELETE
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

CREATE POLICY "Users can upload expense attachments in their families"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-attachments' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can view expense attachments in their families"
  ON storage.objects FOR SELECT
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

CREATE POLICY "Users can delete expense attachments they have access to"
  ON storage.objects FOR DELETE
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
CREATE TABLE gift_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  birthday_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX idx_gift_messages_birthday ON gift_messages(birthday_member_id);
CREATE INDEX idx_gift_messages_family ON gift_messages(family_id);

-- Enable RLS
ALTER TABLE gift_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see messages for their family's birthday events
CREATE POLICY "Users can view family gift messages"
  ON gift_messages FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can create messages for their family
CREATE POLICY "Users can create gift messages in their family"
  ON gift_messages FOR INSERT
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
create policy "care_attachments same family read"
  on public.care_attachments for select
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
create policy "care_attachments same family insert"
  on public.care_attachments for insert
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
create policy "care_attachments uploader or owner manage"
  on public.care_attachments for delete
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
create policy "care-attachments read same family"
  on storage.objects for select
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
create policy "care-attachments write same family"
  on storage.objects for insert
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
create policy "care-attachments delete uploader or owner"
  on storage.objects for delete
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
create policy "care_attachments same family read"
  on public.care_attachments for select
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
create policy "care_attachments same family insert"
  on public.care_attachments for insert
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
create policy "care_attachments same family delete"
  on public.care_attachments for delete
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
create policy "care-attachments public read"
  on storage.objects for select
  to public
  using (bucket_id = 'care-attachments');

-- Upload solo da utenti autenticati
drop policy if exists "care-attachments authenticated upload" on storage.objects;
create policy "care-attachments authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'care-attachments');

-- Delete solo da utenti autenticati (il DB-level RLS protegge il record)
drop policy if exists "care-attachments authenticated delete" on storage.objects;
create policy "care-attachments authenticated delete"
  on storage.objects for delete
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

