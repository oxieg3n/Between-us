-- AFTER triggers cannot change the row returned by INSERT/managed Auth.
-- Consume the invitation and remove the bearer token BEFORE the Auth row is written.
create function app_private.consume_auth_registration() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare intent uuid;
begin
  intent := app_private.valid_registration(new.email,new.raw_user_meta_data->>'registration_token');
  if intent is null then raise exception 'registration intent required' using errcode='42501'; end if;
  update app_private.registration_intents set bound_user_id=new.id,consumed_at=now() where id=intent;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data,'{}'::jsonb)-'registration_token';
  return new;
end $$;
create trigger between_us_consume_registration before insert on auth.users
  for each row execute function app_private.consume_auth_registration();
create or replace function app_private.on_auth_user_created() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  insert into app_private.profiles(user_id,kind,auth_alias)
    select new.id,case when purpose='child' then 'child' else 'pending' end,auth_alias
    from app_private.registration_intents where bound_user_id=new.id and consumed_at is not null;
  if not found then raise exception 'registration intent required' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function app_private.consume_auth_registration() from public,anon,authenticated;
