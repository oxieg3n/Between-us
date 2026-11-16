begin;
-- Opaque hints are coalescible refresh prompts, not an activity or delivery log.
-- Hold the API relation's writer lock while registering historical rows/triggers.
lock table api.user_invalidations in share row exclusive mode;
create table app_private.invalidation_creation (
  id uuid primary key references api.user_invalidations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ordinal bigint generated always as identity (sequence name app_private.invalidation_creation_ordinal_seq) unique
);
create index invalidation_creation_own_order on app_private.invalidation_creation(user_id,ordinal desc);
alter table app_private.invalidation_creation enable row level security;
revoke all on app_private.invalidation_creation from public,anon,authenticated,service_role;
revoke all on sequence app_private.invalidation_creation_ordinal_seq from public,anon,authenticated,service_role;

create function app_private.prune_own_invalidation_hints(p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_user is null then return false; end if;
  -- Callers already hold family/relationship locks and some emit for multiple
  -- users in different orders. NEVER wait for a new per-user hint lock here.
  -- A busy owner keeps its new row; a later successful emit repairs overflow.
  if not pg_try_advisory_xact_lock(hashtextextended('betweenus-invalidation-retention:'||p_user::text,0)) then return false; end if;
  delete from api.user_invalidations hint using app_private.invalidation_creation creation
    where hint.id=creation.id and hint.user_id=p_user and creation.user_id=p_user
      and creation.id not in(select own.id from app_private.invalidation_creation own where own.user_id=p_user order by own.ordinal desc limit 20);
  return true;
end $$;

create function app_private.register_invalidation_creation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into app_private.invalidation_creation(id,user_id) values(new.id,new.user_id);
  perform app_private.prune_own_invalidation_hints(new.user_id);
  return new;
end $$;
create trigger invalidation_creation_after_insert after insert on api.user_invalidations
  for each row execute function app_private.register_invalidation_creation();

create function app_private.invalidation_identity_immutable() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'opaque invalidations are immutable' using errcode='42501'; end if;
  return new;
end $$;
create trigger invalidation_identity_immutable before update on api.user_invalidations
  for each row execute function app_private.invalidation_identity_immutable();

create or replace function app_private.invalidate_user(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  -- UUID remains opaque; retention is driven only by the private server ordinal.
  insert into api.user_invalidations(user_id) values(p_user);
end $$;

-- Historical creation order was not recorded. Assign legacy rows an explicitly
-- unknown relative order, all older than future inserts; never invent event time.
insert into app_private.invalidation_creation(id,user_id)
  select hint.id,hint.user_id from api.user_invalidations hint order by hint.id;
do $$ declare v_user uuid; begin
  for v_user in select distinct creation.user_id from app_private.invalidation_creation creation order by creation.user_id loop
    perform app_private.prune_own_invalidation_hints(v_user);
  end loop;
end $$;

revoke all on function app_private.prune_own_invalidation_hints(uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.register_invalidation_creation() from public,anon,authenticated,service_role;
revoke all on function app_private.invalidation_identity_immutable() from public,anon,authenticated,service_role;
revoke all on function app_private.invalidate_user(uuid) from public,anon,authenticated,service_role;

commit;
