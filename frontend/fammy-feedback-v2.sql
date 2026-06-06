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
