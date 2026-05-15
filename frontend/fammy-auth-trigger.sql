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
