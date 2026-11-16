-- Managed Auth may persist its in-memory metadata again after creating an identity.
-- Keep enrollment bearers out of every subsequent stored Auth row and session.
create function app_private.strip_registration_metadata() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data,'{}'::jsonb)-'registration_token';
  return new;
end $$;
create trigger between_us_strip_registration before update on auth.users
  for each row execute function app_private.strip_registration_metadata();
update auth.users set raw_user_meta_data=raw_user_meta_data-'registration_token'
  where raw_user_meta_data ? 'registration_token';
revoke all on function app_private.strip_registration_metadata() from public,anon,authenticated;
