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
