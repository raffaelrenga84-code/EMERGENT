-- =====================================================================
-- FAMMY — RESTORE part 1 of 3 (dopo reset accidentale)
-- ESEGUI IN ORDINE: 1 → 2 → 3
-- Idempotente: rilanciabile senza danni
-- =====================================================================

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
create policy "profiles_insert_own" on public.profiles for insert
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

drop policy if exists "Family members can upload family photo" on storage.objects;
create policy "Family members can upload family photo" on storage.objects for insert
  with check (
    bucket_id = 'family-photos' and auth.role() = 'authenticated'
  );

drop policy if exists "Family members can delete family photo" on storage.objects;
create policy "Family members can delete family photo" on storage.objects for delete
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
create policy "Update family if member" on public.families for update
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

drop policy if exists "Anyone can read family photo" on storage.objects;
create policy "Anyone can read family photo" on storage.objects for select
  using (bucket_id = 'family-photos');

drop policy if exists "Family members can upload family photo" on storage.objects;
create policy "Family members can upload family photo" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'family-photos');

drop policy if exists "Family members can update family photo" on storage.objects;
create policy "Family members can update family photo" on storage.objects for update
  to authenticated
  using (bucket_id = 'family-photos')
  with check (bucket_id = 'family-photos');

drop policy if exists "Family members can delete family photo" on storage.objects;
create policy "Family members can delete family photo" on storage.objects for delete
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

drop policy if exists "Anyone can read member avatar" on storage.objects;
create policy "Anyone can read member avatar" on storage.objects for select
  using (bucket_id = 'member-avatars');

drop policy if exists "Members can upload member avatar" on storage.objects;
create policy "Members can upload member avatar" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'member-avatars');

drop policy if exists "Members can update member avatar" on storage.objects;
create policy "Members can update member avatar" on storage.objects for update
  to authenticated
  using (bucket_id = 'member-avatars')
  with check (bucket_id = 'member-avatars');

drop policy if exists "Members can delete member avatar" on storage.objects;
create policy "Members can delete member avatar" on storage.objects for delete
  to authenticated
  using (bucket_id = 'member-avatars');


-- 4) MEMBERS — tutti possono modificare i propri dati cosmetici;
--    il creator della famiglia può modificare quelli degli altri.
drop policy if exists "Update own member or as family creator" on public.members;
create policy "Update own member or as family creator" on public.members for update
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

drop policy if exists "Users can view event attachments in their families" on public.event_attachments;
create policy "Users can view event attachments in their families" on public.event_attachments for select
  using (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

drop policy if exists "Users can insert event attachments in their families" on public.event_attachments;
create policy "Users can insert event attachments in their families" on public.event_attachments for insert
  with check (
    exists (
      select 1 from public.events e
      where e.family_id in (
        select family_id from public.members where user_id = auth.uid()
      )
      and e.id = event_attachments.event_id
    )
  );

drop policy if exists "Users can delete event attachments in their families" on public.event_attachments;
create policy "Users can delete event attachments in their families" on public.event_attachments for delete
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

drop policy if exists "Users can upload event attachments" on storage.objects;
create policy "Users can upload event attachments" on storage.objects for insert
  with check (
    bucket_id = 'event-attachments' and auth.role() = 'authenticated'
  );

drop policy if exists "Users can view event attachments" on storage.objects;
create policy "Users can view event attachments" on storage.objects for select
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

drop policy if exists "Users can delete event attachments" on storage.objects;
create policy "Users can delete event attachments" on storage.objects for delete
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
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update using (
  is_family_member(family_id)
  or exists (
    select 1 from task_assignees ta
    join members m on m.id = ta.member_id
    where ta.task_id = tasks.id and m.user_id = auth.uid()
  )
);

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert with check (
  is_family_member(family_id)
);

drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks for delete using (
  is_family_member(family_id)
);

-- 3. Permetti agli assegnatari cross-famiglia di leggere i membri
--    della famiglia origine del task (per vedere chi sono gli altri
--    assegnatari nelle UI). Esistente "members_read" usa is_family_member,
--    quindi serve estendere.
drop policy if exists "members_read" on members;

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
