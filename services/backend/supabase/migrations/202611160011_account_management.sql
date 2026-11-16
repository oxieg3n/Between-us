-- Narrow account/privacy projections. Managed Auth remains the session authority.
create table app_private.account_management_policy (
  singleton boolean primary key default true check(singleton),
  auth_issuer text check(auth_issuer is null or char_length(auth_issuer) between 1 and 512)
);
insert into app_private.account_management_policy(singleton) values(true);
alter table app_private.account_management_policy enable row level security;
revoke all on app_private.account_management_policy from public,anon,authenticated;
alter table app_private.families add column created_by uuid references app_private.profiles(user_id);
create index families_creator on app_private.families(created_by) where created_by is not null;
-- Historical rows remain NULL: current guardianship does not prove original authorship.
create table app_private.account_management_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check(operation in('family','child','consent')),
  window_at timestamptz not null,
  used int not null check(used>0),
  primary key(user_id,operation)
);
alter table app_private.account_management_budgets enable row level security;
revoke all on app_private.account_management_budgets from public,anon,authenticated;

create function app_private.account_management_budget(p_user uuid,p_operation text,p_limit int) returns void
language plpgsql security definer set search_path='' as $$
declare n int; window_start timestamptz:=date_trunc('hour',clock_timestamp());
begin
  insert into app_private.account_management_budgets(user_id,operation,window_at,used) values(p_user,p_operation,window_start,1)
    on conflict(user_id,operation) do update set window_at=excluded.window_at,
      used=case when app_private.account_management_budgets.window_at=excluded.window_at then app_private.account_management_budgets.used+1 else 1 end
    returning used into n;
  if n>p_limit then raise exception 'account operation limit reached' using errcode='54000'; end if;
end $$;

create function app_private.account_guardian_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='guardian' and new.status='active' then
    if tg_op='UPDATE' then
      if old.user_id=new.user_id and old.family_id=new.family_id and old.role='guardian' and old.status='active' then return new; end if;
    end if;
    -- All guardian admission paths share this actor lock after their existing family lock.
    perform pg_advisory_xact_lock(hashtextextended('account-admin:'||new.user_id::text,0));
    if (select count(*) from app_private.memberships where user_id=new.user_id and role='guardian' and status='active')>=4 then
      raise exception 'family administration limit reached' using errcode='54000';
    end if;
  end if;
  return new;
end $$;
create trigger account_guardian_capacity before insert or update on app_private.memberships
  for each row execute function app_private.account_guardian_capacity();

create or replace function api.create_family(p_name text,p_timezone text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=app_private.actor(); result uuid;
begin
  if not exists(select 1 from app_private.profiles where user_id=u and kind='parent' and state='active') then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid timezone' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-admin:'||u::text,0));
  if (select count(*) from app_private.families where created_by=u)>=4 or
     (select count(*) from app_private.memberships where user_id=u and role='guardian' and status='active')>=4 then
    raise exception 'family administration limit reached' using errcode='54000'; end if;
  perform app_private.account_management_budget(u,'family',4);
  insert into app_private.families(name,timezone,created_by) values(btrim(p_name),p_timezone,u) returning id into result;
  insert into app_private.memberships(family_id,user_id,role) values(result,u,'guardian');
  return result;
end $$;

create or replace function api.create_child(p_family_id uuid,p_name text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=app_private.actor(); result uuid; email text;
begin
  perform app_private.lock_family(p_family_id);
  if not app_private.is_guardian(p_family_id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  select a.email into email from auth.users a where id=u;
  if not app_private.enrollment_allowed(email,true) then raise exception 'child enrollment unavailable' using errcode='42501'; end if;
  if (select count(*) from app_private.children where family_id=p_family_id and state<>'closed')>=12 then raise exception 'child capacity reached' using errcode='54000'; end if;
  perform app_private.account_management_budget(u,'child',24);
  insert into app_private.children(family_id,name) values(p_family_id,btrim(p_name)) returning id into result;
  return result;
end $$;

create or replace function api.request_child_consent(p_child_id uuid,p_notice_version text,p_policy_version text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=app_private.actor(); child app_private.children; result uuid;
begin
  select * into child from app_private.children where id=p_child_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.lock_family(child.family_id);
  if not app_private.is_guardian(child.family_id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from app_private.deployment_policy where singleton and notice_version=p_notice_version
    and consent_policy_version=p_policy_version and nullif(p_notice_version,'') is not null and nullif(p_policy_version,'') is not null) then
    raise exception 'notice unavailable' using errcode='42501'; end if;
  select id into result from app_private.consents where child_id=p_child_id and guardian_user_id=u and status='pending'
    and notice_version=p_notice_version and policy_version=p_policy_version order by created_at desc,id desc limit 1;
  if found then return result; end if;
  perform app_private.account_management_budget(u,'consent',12);
  insert into app_private.consents(child_id,family_id,guardian_user_id,notice_version,policy_version)
    values(p_child_id,child.family_id,u,p_notice_version,p_policy_version) returning id into result;
  return result;
end $$;

create function api.get_privacy_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); result jsonb;
begin
  select jsonb_build_object('userId',user_id,'kind',kind,'state',state) into result from app_private.profiles where user_id=u;
  if result is null then raise exception 'not authorized' using errcode='42501'; end if;
  return result;
end $$;

-- PostgREST validates the bearer signature; the ordinary actor rechecks managed
-- session/current account authority. This narrow projection also pins signed iss.
create function api.get_verified_session() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); claims jsonb:=auth.jwt(); issuer text;
begin
  select auth_issuer into issuer from app_private.account_management_policy where singleton;
  if issuer is null or (claims->>'iss') is distinct from issuer or (claims->>'role') is distinct from 'authenticated' then
    raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('iss',issuer,'sub',u,'session_id',(claims->>'session_id')::uuid,'exp',(claims->>'exp')::numeric,'role','authenticated');
end $$;

create function api.list_own_sessions() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'createdAt',s.created_at,'current',s.id=(auth.jwt()->>'session_id')::uuid,
    'deviceLabel',case when s.id=(auth.jwt()->>'session_id')::uuid then 'Current signed-in session' else 'Other signed-in session' end)
    order by s.created_at desc nulls last,s.id),'[]'::jsonb) into result from
    (select id,created_at from auth.sessions where user_id=u and (not_after is null or not_after>clock_timestamp()) order by created_at desc nulls last,id limit 50) s;
  return result;
end $$;

create function api.list_own_case_statuses() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) into result from (
    select id,created_at,jsonb_build_object('id',id,'kind',kind,'status',status,'response',response,'createdAt',created_at) item from (
      select id,created_at,'report'::text kind,status,response from app_private.safety_reports where reporter_id=u
      union all select id,created_at,'privacy',status,response from app_private.privacy_requests where requester_id=u
      union all select id,created_at,'job',case when status in('ready','partial_ready') and artifact_expires_at<=clock_timestamp() then 'expired' else status end,null::text
        from app_private.privacy_lifecycle_jobs where requester_id=u
    ) own_cases order by created_at desc,id limit 50
  ) bounded;
  return result;
end $$;

create function api.list_own_consent_statuses() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) into result from (
    select c.id,c.created_at,jsonb_build_object('id',c.id,'childId',c.child_id,'status',c.status,'noticeVersion',c.notice_version,
      'policyVersion',c.policy_version,'expiresAt',c.expires_at,'current',coalesce(c.status='verified' and c.expires_at>clock_timestamp(),false)) item
      from app_private.consents c join app_private.children child on child.id=c.child_id
      where child.account_user_id=u or app_private.is_guardian(c.family_id,u)
      order by c.created_at desc,c.id limit 50
  ) bounded;
  return result;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='app_private' and p.proname in('account_management_budget','account_guardian_capacity'))
      or (n.nspname='api' and p.proname in('get_privacy_context','get_verified_session','list_own_sessions','list_own_case_statuses','list_own_consent_statuses','create_family','create_child','request_child_consent')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to authenticated',f.signature); end if;
  end loop;
end $$;
