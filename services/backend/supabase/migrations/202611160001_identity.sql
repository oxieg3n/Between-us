-- Authoritative identity is independent of mobile role controls and user metadata.
create schema if not exists app_private;
create schema if not exists api;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema app_private from public, anon, authenticated;
revoke all on schema api from public, anon;
grant usage on schema api to authenticated, service_role;
grant usage on schema app_private to service_role, supabase_auth_admin;
alter default privileges in schema app_private revoke execute on functions from public;
alter default privileges in schema api revoke execute on functions from public;

create table app_private.deployment_policy (
  singleton boolean primary key default true check (singleton),
  public_enrollment_enabled boolean not null default false,
  real_child_data_enabled boolean not null default false,
  public_reports_enabled boolean not null default false,
  local_synthetic boolean not null default false,
  guardian_managed_children boolean not null default true check (guardian_managed_children),
  jurisdiction_policy_id text,
  age_policy_id text,
  legal_review_id text,
  notice_version text,
  consent_policy_version text,
  consent_verification_method text,
  retention_policy_id text,
  operator_policy_id text,
  child_alias_policy_id text,
  check (not (local_synthetic and (public_enrollment_enabled or real_child_data_enabled)))
);
insert into app_private.deployment_policy(singleton) values (true);

create table app_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  kind text not null check (kind in ('pending','parent','child')),
  auth_alias boolean not null default false,
  state text not null default 'onboarding' check (state in ('onboarding','active','suspended','closed')),
  created_at timestamptz not null default now()
);
create table app_private.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  timezone text not null,
  created_at timestamptz not null default now()
);
create table app_private.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app_private.families(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  account_user_id uuid unique references auth.users(id),
  state text not null default 'pending' check (state in ('pending','active','suspended','closed')),
  unique (id,family_id)
);
create table app_private.memberships (
  family_id uuid not null references app_private.families(id),
  user_id uuid not null references app_private.profiles(user_id),
  role text not null check (role in ('guardian','child')),
  child_id uuid,
  status text not null default 'active' check (status in ('active','revoked')),
  primary key (family_id,user_id),
  foreign key (child_id,family_id) references app_private.children(id,family_id),
  check ((role='guardian' and child_id is null) or (role='child' and child_id is not null))
);
create unique index membership_child_identity on app_private.memberships(child_id) where role='child';
create table app_private.operators (
  user_id uuid not null references app_private.profiles(user_id),
  scope text not null check (scope in ('consent','verification','privacy','safety')),
  active boolean not null default false,
  primary key (user_id,scope)
);
create table app_private.consents (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null,
  family_id uuid not null,
  guardian_user_id uuid not null references app_private.profiles(user_id),
  scope text not null default 'family-communication-finance' check (scope='family-communication-finance'),
  status text not null default 'pending' check (status in ('pending','verified','withdrawn','revoked')),
  notice_version text not null,
  policy_version text not null,
  method text,
  evidence_reference text,
  verified_by uuid references app_private.profiles(user_id),
  verified_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (child_id,family_id) references app_private.children(id,family_id),
  check (status <> 'verified' or (method is not null and evidence_reference is not null and
    verified_by is not null and verified_at is not null and expires_at > verified_at))
);
create table app_private.registration_intents (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('parent','child')),
  email text not null check (email=lower(btrim(email)) and length(email) between 3 and 254),
  auth_alias boolean not null default false,
  child_id uuid references app_private.children(id),
  consent_id uuid references app_private.consents(id),
  issued_by uuid references app_private.profiles(user_id),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  bound_user_id uuid unique,
  consumed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((purpose='parent' and child_id is null and consent_id is null) or
         (purpose='child' and child_id is not null and consent_id is not null and issued_by is not null))
);
create table app_private.guardian_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app_private.families(id),
  email text not null,
  issued_by uuid not null references app_private.profiles(user_id),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references app_private.profiles(user_id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create table app_private.identity_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references app_private.profiles(user_id),
  action text not null,
  subject_id uuid,
  created_at timestamptz not null default now()
);

create function app_private.lock_family(p_family_id uuid) returns void
language sql volatile security definer set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_family_id::text, 1729));
$$;

create function app_private.account_usable(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from app_private.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_user_id and p.state='active' and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and (u.email_confirmed_at is not null or (p.kind='child' and p.auth_alias))
      and (p.kind='parent' or (p.kind='child' and exists (
        select 1 from app_private.children c
        join app_private.memberships m on m.child_id=c.id and m.family_id=c.family_id
        where c.account_user_id=p.user_id and c.state='active' and m.user_id=p.user_id
          and m.role='child' and m.status='active' and exists (
            select 1 from app_private.consents co
            join app_private.memberships gm on gm.family_id=co.family_id and gm.user_id=co.guardian_user_id
            join app_private.profiles gp on gp.user_id=gm.user_id
            where co.child_id=c.id and co.family_id=c.family_id and co.status='verified'
              and co.withdrawn_at is null and co.revoked_at is null and co.expires_at > now()
              and gm.role='guardian' and gm.status='active' and gp.kind='parent' and gp.state='active'
          )
      )))
  );
$$;
create function app_private.is_member(p_family_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.account_usable(p_user_id) and exists (
    select 1 from app_private.memberships m where m.family_id=p_family_id
      and m.user_id=p_user_id and m.status='active'
  );
$$;
create function app_private.is_guardian(p_family_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.is_member(p_family_id,p_user_id) and exists (
    select 1 from app_private.memberships m join app_private.profiles p on p.user_id=m.user_id
    where m.family_id=p_family_id and m.user_id=p_user_id and m.role='guardian' and p.kind='parent'
  );
$$;
create function app_private.child_for_user(p_family_id uuid,p_user_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select m.child_id from app_private.memberships m where m.family_id=p_family_id
    and m.user_id=p_user_id and m.role='child' and app_private.is_member(p_family_id,p_user_id);
$$;

create function app_private.actor() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid; v_session uuid; v_exp numeric; v_profile app_private.profiles;
begin
  begin
    v_uid := auth.uid();
    v_session := (auth.jwt()->>'session_id')::uuid;
    v_exp := (auth.jwt()->>'exp')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if v_uid is null or v_session is null or v_exp is null or v_exp <= extract(epoch from now()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  -- Serialize against managed session deletion; a previously issued JWT is insufficient.
  perform 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=v_session and s.user_id=v_uid and (s.not_after is null or s.not_after > now())
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now()) for share of s;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  select * into v_profile from app_private.profiles where user_id=v_uid;
  if not found or v_profile.state in ('suspended','closed') or
      not exists(select 1 from auth.users where id=v_uid and (email_confirmed_at is not null or
        (v_profile.kind='child' and v_profile.auth_alias))) or
      (v_profile.state='active' and not app_private.account_usable(v_uid)) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  return v_uid;
end;
$$;

create function app_private.enrollment_allowed(p_email text,p_child boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from app_private.deployment_policy p where p.singleton and
    ((p.local_synthetic and lower(p_email) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.test$') or
     (p.public_enrollment_enabled and (not p_child or p.real_child_data_enabled) and
      nullif(p.jurisdiction_policy_id,'') is not null and nullif(p.age_policy_id,'') is not null and
      nullif(p.legal_review_id,'') is not null and nullif(p.notice_version,'') is not null and
      nullif(p.consent_policy_version,'') is not null and nullif(p.retention_policy_id,'') is not null and
      nullif(p.operator_policy_id,'') is not null)));
$$;

create function app_private.issue_parent_registration(p_email text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_email text := lower(btrim(p_email)); v_token text; v_id uuid;
begin
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode='22023';
  end if;
  if not app_private.enrollment_allowed(v_email,false) then
    raise exception 'enrollment unavailable' using errcode='42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.registration_intents(purpose,email,token_hash,expires_at)
    values ('parent',v_email,extensions.digest(v_token,'sha256'),now()+interval '30 minutes') returning id into v_id;
  return jsonb_build_object('id',v_id,'token',v_token,'expiresAt',now()+interval '30 minutes');
end;
$$;

create function app_private.valid_registration(p_email text,p_token text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_intent app_private.registration_intents; v_child app_private.children;
begin
  if p_token is null or length(p_token)<>64 then return null; end if;
  select * into v_intent from app_private.registration_intents
    where token_hash=extensions.digest(p_token,'sha256');
  if v_intent.purpose='child' then
    select * into v_child from app_private.children where id=v_intent.child_id;
    perform app_private.lock_family(v_child.family_id);
  end if;
  select * into v_intent from app_private.registration_intents where id=v_intent.id for update;
  if not found or v_intent.email<>lower(btrim(p_email)) or v_intent.consumed_at is not null
    or v_intent.expires_at <= now() or not app_private.enrollment_allowed(p_email,v_intent.purpose='child') then
    return null;
  end if;
  if v_intent.purpose='child' then
    select * into v_child from app_private.children where id=v_intent.child_id;
    if not app_private.is_guardian(v_child.family_id,v_intent.issued_by) or v_child.account_user_id is not null
      or v_child.state<>'pending' or not exists (
        select 1 from app_private.consents co where co.id=v_intent.consent_id and co.child_id=v_child.id
          and co.status='verified' and co.withdrawn_at is null and co.revoked_at is null and co.expires_at>now()
      ) then return null; end if;
  end if;
  return v_intent.id;
end;
$$;

create function app_private.before_user_created(event jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if app_private.valid_registration(event->'user'->>'email',event->'user'->'user_metadata'->>'registration_token') is null then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Enrollment is unavailable or invitation is invalid.'));
  end if;
  return '{}'::jsonb;
end;
$$;
create function app_private.on_auth_user_created() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare v_id uuid; v_purpose text;
begin
  -- Repeat the hook check so privileged Auth creation cannot accidentally bypass enrollment.
  v_id := app_private.valid_registration(new.email,new.raw_user_meta_data->>'registration_token');
  if v_id is null then raise exception 'registration intent required' using errcode='42501'; end if;
  update app_private.registration_intents set bound_user_id=new.id,consumed_at=now()
    where id=v_id returning purpose into v_purpose;
  insert into app_private.profiles(user_id,kind,auth_alias)
    select new.id,case when v_purpose='child' then 'child' else 'pending' end,auth_alias
      from app_private.registration_intents where id=v_id;
  -- The Auth user must not retain the bearer enrollment token in its profile metadata.
  update auth.users set raw_user_meta_data=raw_user_meta_data-'registration_token' where id=new.id;
  return new;
end;
$$;
create trigger between_us_auth_profile after insert on auth.users
  for each row execute function app_private.on_auth_user_created();

create function api.issue_parent_registration(p_email text) returns jsonb
language sql volatile security definer set search_path='' as $$
  select app_private.issue_parent_registration(p_email);
$$;

create function api.bootstrap_parent(p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor();
begin
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'invalid display name' using errcode='22023';
  end if;
  perform 1 from app_private.profiles where user_id=v_uid and kind='pending' and state='onboarding' for update;
  if not found or not exists (select 1 from app_private.registration_intents ri join auth.users u on u.id=ri.bound_user_id
    where ri.bound_user_id=v_uid and ri.purpose='parent' and ri.consumed_at is not null and ri.accepted_at is null
      and ri.expires_at>now() and lower(u.email)=ri.email and app_private.enrollment_allowed(ri.email,false)) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update app_private.profiles set kind='parent',state='active',display_name=btrim(p_display_name) where user_id=v_uid;
  update app_private.registration_intents set accepted_at=now() where bound_user_id=v_uid;
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'parent_bootstrapped',v_uid);
  return jsonb_build_object('id',v_uid,'kind','parent');
end;
$$;

create function api.create_family(p_name text,p_timezone text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_id uuid;
begin
  if not exists (select 1 from app_private.profiles where user_id=v_uid and kind='parent' and state='active') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'invalid timezone' using errcode='22023';
  end if;
  insert into app_private.families(name,timezone) values(btrim(p_name),p_timezone) returning id into v_id;
  insert into app_private.memberships(family_id,user_id,role) values(v_id,v_uid,'guardian');
  return v_id;
end;
$$;

create function api.create_child(p_family_id uuid,p_name text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_id uuid; v_email text;
begin
  perform app_private.lock_family(p_family_id);
  if not app_private.is_guardian(p_family_id,v_uid) then raise exception 'not authorized' using errcode='42501'; end if;
  select email into v_email from auth.users where id=v_uid;
  if not app_private.enrollment_allowed(v_email,true) then raise exception 'child enrollment unavailable' using errcode='42501'; end if;
  insert into app_private.children(family_id,name) values(p_family_id,btrim(p_name)) returning id into v_id;
  return v_id;
end;
$$;

create function api.request_child_consent(p_child_id uuid,p_notice_version text,p_policy_version text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_child app_private.children; v_id uuid;
begin
  select * into v_child from app_private.children where id=p_child_id;
  perform app_private.lock_family(v_child.family_id);
  if not app_private.is_guardian(v_child.family_id,v_uid) then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from app_private.deployment_policy where singleton and notice_version=p_notice_version
      and consent_policy_version=p_policy_version and nullif(p_notice_version,'') is not null and nullif(p_policy_version,'') is not null) then
    raise exception 'notice unavailable' using errcode='42501';
  end if;
  insert into app_private.consents(child_id,family_id,guardian_user_id,notice_version,policy_version)
    values(p_child_id,v_child.family_id,v_uid,p_notice_version,p_policy_version) returning id into v_id;
  return v_id;
end;
$$;

create function api.verify_child_consent(p_consent_id uuid,p_method text,p_evidence_reference text,p_expires_at timestamptz) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_consent app_private.consents;
begin
  select * into v_consent from app_private.consents where id=p_consent_id;
  perform app_private.lock_family(v_consent.family_id);
  select * into v_consent from app_private.consents where id=p_consent_id for update;
  if not exists(select 1 from app_private.operators where user_id=v_uid and scope='consent' and active)
    or not app_private.account_usable(v_uid) or v_consent.guardian_user_id=v_uid
    or app_private.is_member(v_consent.family_id,v_uid) or v_consent.status<>'pending'
    or not app_private.is_guardian(v_consent.family_id,v_consent.guardian_user_id) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_method is null or lower(btrim(p_method)) in ('checkbox','email','email_confirmation') or length(p_method) not between 3 and 80
    or p_evidence_reference is null or length(p_evidence_reference) not between 3 and 200
    or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '1 year' then
    raise exception 'invalid verification evidence' using errcode='22023';
  end if;
  if not exists(select 1 from app_private.deployment_policy d where d.singleton and
    ((d.local_synthetic and p_method='synthetic_fixture') or (not d.local_synthetic and d.public_enrollment_enabled
      and d.real_child_data_enabled and p_method=d.consent_verification_method and p_method<>'synthetic_fixture'
      and nullif(d.legal_review_id,'') is not null and nullif(d.operator_policy_id,'') is not null))) then
    raise exception 'reviewed verification method required' using errcode='42501';
  end if;
  update app_private.consents set status='verified',method=p_method,evidence_reference=p_evidence_reference,
    verified_by=v_uid,verified_at=now(),expires_at=p_expires_at where id=p_consent_id;
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'consent_verified',p_consent_id);
end;
$$;

create function api.begin_child_enrollment(p_child_id uuid,p_email text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_child app_private.children; v_consent uuid;
  v_email text := lower(btrim(p_email)); v_token text; v_alias boolean := p_email is null;
begin
  select * into v_child from app_private.children where id=p_child_id;
  perform app_private.lock_family(v_child.family_id);
  select * into v_child from app_private.children where id=p_child_id;
  if v_alias then
    if exists(select 1 from app_private.deployment_policy where singleton and local_synthetic) then
      v_email := 'child-'||gen_random_uuid()::text||'@accounts.test';
    elsif exists(select 1 from app_private.deployment_policy where singleton and nullif(child_alias_policy_id,'') is not null) then
      v_email := 'child-'||gen_random_uuid()::text||'@between-us.invalid';
    else raise exception 'reviewed child alias policy required' using errcode='42501'; end if;
  end if;
  if not app_private.is_guardian(v_child.family_id,v_uid) or v_child.state<>'pending' or v_child.account_user_id is not null
    or v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or not app_private.enrollment_allowed(v_email,true) or exists(select 1 from auth.users where lower(email)=v_email) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select id into v_consent from app_private.consents where child_id=p_child_id and guardian_user_id=v_uid
    and status='verified' and expires_at>now() and withdrawn_at is null and revoked_at is null
    order by verified_at desc limit 1;
  if v_consent is null then raise exception 'verified consent required' using errcode='42501'; end if;
  update app_private.registration_intents set expires_at=now() where child_id=p_child_id and consumed_at is null;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.registration_intents(purpose,email,auth_alias,child_id,consent_id,issued_by,token_hash,expires_at)
    values('child',v_email,v_alias,p_child_id,v_consent,v_uid,extensions.digest(v_token,'sha256'),now()+interval '30 minutes');
  return jsonb_build_object('token',v_token,'email',v_email,'authAlias',v_alias,'expiresAt',now()+interval '30 minutes');
end;
$$;

create function api.accept_child_enrollment(p_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_intent app_private.registration_intents; v_child app_private.children;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'not authorized' using errcode='42501'; end if;
  select * into v_intent from app_private.registration_intents where bound_user_id=v_uid and purpose='child'
    and token_hash=extensions.digest(p_token,'sha256');
  select * into v_child from app_private.children where id=v_intent.child_id;
  perform app_private.lock_family(v_child.family_id);
  select * into v_child from app_private.children where id=v_intent.child_id;
  select * into v_intent from app_private.registration_intents where id=v_intent.id for update;
  if v_intent.id is null or v_intent.accepted_at is not null or v_intent.expires_at<=now()
    or not app_private.is_guardian(v_child.family_id,v_intent.issued_by) or v_child.account_user_id is not null or v_child.state<>'pending'
    or not exists(select 1 from app_private.profiles where user_id=v_uid and kind='child' and state='onboarding')
    or not exists(select 1 from auth.users where id=v_uid and lower(email)=v_intent.email)
    or not app_private.enrollment_allowed(v_intent.email,true)
    or not exists(select 1 from app_private.consents where id=v_intent.consent_id and child_id=v_child.id
      and status='verified' and withdrawn_at is null and revoked_at is null and expires_at>now()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update app_private.children set account_user_id=v_uid,state='active' where id=v_child.id;
  insert into app_private.memberships(family_id,user_id,role,child_id) values(v_child.family_id,v_uid,'child',v_child.id);
  update app_private.profiles set state='active',display_name=v_child.name where user_id=v_uid;
  update app_private.registration_intents set accepted_at=now() where id=v_intent.id;
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'child_enrolled',v_child.id);
  return jsonb_build_object('childId',v_child.id,'familyId',v_child.family_id);
end;
$$;

create function api.invite_guardian(p_family_id uuid,p_email text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_token text; v_email text := lower(btrim(p_email));
begin
  perform app_private.lock_family(p_family_id);
  if not app_private.is_guardian(p_family_id,v_uid) or v_email is null or length(v_email) not between 3 and 254
    or not app_private.enrollment_allowed(v_email,false)
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update app_private.guardian_invites set revoked_at=now() where family_id=p_family_id and email=v_email and accepted_at is null;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.guardian_invites(family_id,email,issued_by,token_hash,expires_at)
    values(p_family_id,v_email,v_uid,extensions.digest(v_token,'sha256'),now()+interval '1 day');
  return jsonb_build_object('token',v_token,'expiresAt',now()+interval '1 day');
end;
$$;

create function api.accept_guardian_invite(p_token text) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_invite app_private.guardian_invites;
begin
  if p_token is null or length(p_token)<>64 then raise exception 'not authorized' using errcode='42501'; end if;
  select * into v_invite from app_private.guardian_invites where token_hash=extensions.digest(p_token,'sha256');
  perform app_private.lock_family(v_invite.family_id);
  select * into v_invite from app_private.guardian_invites where id=v_invite.id for update;
  if v_invite.id is null or v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at<=now()
    or not app_private.is_guardian(v_invite.family_id,v_invite.issued_by)
    or not exists(select 1 from app_private.profiles where user_id=v_uid and kind='parent' and state='active')
    or not exists(select 1 from auth.users where id=v_uid and lower(email)=v_invite.email)
    or exists(select 1 from app_private.memberships where family_id=v_invite.family_id and user_id=v_uid) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  insert into app_private.memberships(family_id,user_id,role) values(v_invite.family_id,v_uid,'guardian');
  update app_private.guardian_invites set accepted_by=v_uid,accepted_at=now() where id=v_invite.id;
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'guardian_invite_accepted',v_invite.family_id);
  return v_invite.family_id;
end;
$$;

create function api.withdraw_consent(p_child_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_child app_private.children;
begin
  select * into v_child from app_private.children where id=p_child_id;
  perform app_private.lock_family(v_child.family_id);
  if not app_private.is_guardian(v_child.family_id,v_uid) and v_child.account_user_id is distinct from v_uid then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update app_private.consents set status='withdrawn',withdrawn_at=now() where child_id=p_child_id and status in ('pending','verified');
  update app_private.children set state='suspended' where id=p_child_id;
  update app_private.memberships set status='revoked' where child_id=p_child_id;
  update app_private.registration_intents set expires_at=now() where child_id=p_child_id and accepted_at is null;
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'consent_withdrawn',p_child_id);
end;
$$;

create function api.revoke_membership(p_family_id uuid,p_user_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_target app_private.memberships;
begin
  perform app_private.lock_family(p_family_id);
  if not app_private.is_guardian(p_family_id,v_uid) then raise exception 'not authorized' using errcode='42501'; end if;
  select * into v_target from app_private.memberships where family_id=p_family_id and user_id=p_user_id and status='active';
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  if v_target.role='guardian' and (select count(*) from app_private.memberships m
    where m.family_id=p_family_id and m.role='guardian' and m.status='active')<=1 then
    raise exception 'last guardian requires reviewed dispute procedure' using errcode='42501';
  end if;
  update app_private.memberships set status='revoked' where family_id=p_family_id and user_id=p_user_id;
  update app_private.guardian_invites set revoked_at=now() where family_id=p_family_id and issued_by=p_user_id and accepted_at is null;
  update app_private.consents set status='revoked',revoked_at=now() where family_id=p_family_id
    and (guardian_user_id=p_user_id or child_id=v_target.child_id) and status in ('pending','verified');
  insert into app_private.identity_audit(actor_id,action,subject_id) values(v_uid,'membership_revoked',p_user_id);
end;
$$;

create function api.get_context() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_result jsonb;
begin
  select jsonb_build_object(
    'user',jsonb_build_object('id',p.user_id,'displayName',p.display_name,'kind',p.kind,'state',p.state),
    'families',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'timezone',f.timezone) order by f.id)
      from app_private.families f where app_private.is_member(f.id,v_uid)),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('familyId',m.family_id,'role',m.role,'childId',m.child_id) order by m.family_id)
      from app_private.memberships m where m.user_id=v_uid and app_private.is_member(m.family_id,v_uid)),'[]'::jsonb),
    'children',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'familyId',c.family_id,'name',c.name) order by c.id)
      from app_private.children c where app_private.is_guardian(c.family_id,v_uid) or
        (c.account_user_id=v_uid and app_private.is_member(c.family_id,v_uid))),'[]'::jsonb),
    'policy',(select jsonb_build_object('publicEnrollmentEnabled',d.public_enrollment_enabled,
      'realChildDataEnabled',d.real_child_data_enabled,'publicReportsEnabled',d.public_reports_enabled,
      'guardianManagedChildren',true,'noticeVersion',d.notice_version,'consentPolicyVersion',d.consent_policy_version)
      from app_private.deployment_policy d where singleton)
  ) into v_result from app_private.profiles p where p.user_id=v_uid;
  return v_result;
end;
$$;

-- No raw-table policies: even a valid authenticated account must use scoped RPCs.
do $$ declare v_table text; begin
  foreach v_table in array array['deployment_policy','profiles','families','children','memberships','operators','consents',
    'registration_intents','guardian_invites','identity_audit'] loop
    execute format('alter table app_private.%I enable row level security',v_table);
  end loop;
end $$;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on all sequences in schema app_private from public,anon,authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on all functions in schema api from public,anon,authenticated;
grant execute on function app_private.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function app_private.issue_parent_registration(text) to service_role;
grant execute on all functions in schema api to authenticated;
revoke execute on function api.issue_parent_registration(text) from authenticated;
grant execute on function api.issue_parent_registration(text) to service_role;
