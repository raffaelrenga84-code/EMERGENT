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

-- =====================================================================
-- USO LATO FRONTEND:
--   const { data, error } = await supabase.rpc('accept_family_by_code', {
--     p_code: 'MX68YV', p_name: 'Marco'
--   });
--   if (data.ok) toast(`Benvenuto in ${data.family_name}!`);
-- =====================================================================
