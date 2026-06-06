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
