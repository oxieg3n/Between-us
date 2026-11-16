-- The sole Realtime surface is opaque own-user INSERT invalidation hints.
create function api.can_read_own_invalidation(p_user_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v_user uuid; v_exp numeric;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() or (auth.jwt()->>'role') is distinct from 'authenticated' then return false; end if;
  v_exp:=(auth.jwt()->>'exp')::numeric;
  if v_exp is null or v_exp<=extract(epoch from clock_timestamp()) then return false; end if;
  v_user:=app_private.actor();
  return coalesce(v_user=p_user_id and app_private.account_usable(v_user),false);
exception when others then
  -- Missing/malformed/expired/revoked identity and unavailable authorization all
  -- suppress hints. Never fall back to uid equality or expose internal errors.
  return false;
end $$;
revoke all on function api.can_read_own_invalidation(uuid) from public,anon,authenticated,service_role;
grant execute on function api.can_read_own_invalidation(uuid) to authenticated;

drop policy own_invalidations on api.user_invalidations;
create policy own_invalidations on api.user_invalidations for select to authenticated
  using(api.can_read_own_invalidation(user_id));

-- Supabase Postgres Changes does not apply RLS to DELETE. Publication filtering
-- must enforce INSERT-only even for hostile wildcard clients, not just UI filters.
-- Never silently change another domain's publication behavior.
do $$ declare v_publication record; begin
  select p.* into v_publication from pg_catalog.pg_publication p where p.pubname='supabase_realtime';
  if not found or v_publication.puballtables or
    (select count(*) from pg_catalog.pg_publication_tables t where t.pubname='supabase_realtime')<>1 or
    not exists(select 1 from pg_catalog.pg_publication_tables t where t.pubname='supabase_realtime' and t.schemaname='api' and t.tablename='user_invalidations') then
    raise exception 'invalidation publication requires explicit review' using errcode='55000'; end if;
  alter publication supabase_realtime set(publish='insert');
  if not exists(select 1 from pg_catalog.pg_publication p where p.pubname='supabase_realtime' and p.pubinsert and not p.pubupdate and not p.pubdelete and not p.pubtruncate and not p.puballtables) then
    raise exception 'invalidation publication requires explicit review' using errcode='55000'; end if;
end $$;
