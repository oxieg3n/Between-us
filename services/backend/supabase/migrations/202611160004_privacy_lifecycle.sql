-- Privacy identity is deliberately narrower than a family/finance/chat capability.
create table app_private.privacy_lifecycle_policy (
  singleton boolean primary key default true check(singleton),
  execution_enabled boolean not null default false,
  retention_enabled boolean not null default false,
  synthetic_fixture_mode boolean not null default false,
  reviewed_policy_id text,
  reauth_methods text[] not null default '{}',
  artifact_hours int not null default 24 check(artifact_hours between 1 and 24),
  message_days int not null default 90 check(message_days between 1 and 365),
  closed_case_days int not null default 90 check(closed_case_days between 1 and 365),
  notification_days int not null default 7 check(notification_days between 1 and 30)
);
insert into app_private.privacy_lifecycle_policy(singleton) values(true);
create table app_private.privacy_reauthentication (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id uuid not null references auth.sessions(id) on delete cascade,
  method text not null check(method in('managed_password','managed_password_totp','synthetic_fixture')),
  auth_event_ref text not null check(char_length(auth_event_ref) between 1 and 200),
  verified_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '5 minutes'
);
create table app_private.privacy_lifecycle_jobs (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id),
  subject_id uuid not null references auth.users(id),
  client_id uuid not null,
  requested_session uuid,
  reauth_id uuid references app_private.privacy_reauthentication(id) on delete set null,
  kind text not null check(kind in('export','deletion','parental_review')),
  status text not null default 'requested' check(status in('requested','approved','rejected','partial_ready','ready','access_revoked','blocked','expired')),
  review_operator uuid references auth.users(id),
  review_reference text,
  source_request_id uuid,
  public_blockers text[] not null default '{}',
  internal_blockers text[] not null default '{}',
  stages text[] not null default '{}',
  finance_manifest jsonb not null default '[]',
  artifact jsonb,
  artifact_expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  executed_at timestamptz,
  unique(requester_id,client_id),
  check(artifact is null or octet_length(artifact::text)<=8388608)
);
create table app_private.privacy_legal_holds (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references auth.users(id),
  scope text not null check(scope in('account','identity','consent','messages','reports','finance')),
  reference text not null check(char_length(reference) between 1 and 200),
  operator_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  review_due_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table app_private.privacy_retention_runs (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  deleted_counts jsonb not null default '{}',
  blockers text[] not null default '{}'
);

create function app_private.privacy_identity_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid; s uuid; expires numeric;
begin
  begin u:=auth.uid(); s:=(auth.jwt()->>'session_id')::uuid; expires:=(auth.jwt()->>'exp')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if u is null or s is null or expires is null or expires<=extract(epoch from clock_timestamp()) then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from auth.sessions session join auth.users account on account.id=session.user_id
    join app_private.profiles profile on profile.user_id=account.id
    where session.id=s and session.user_id=u and (session.not_after is null or session.not_after>clock_timestamp())
      and account.deleted_at is null and (account.banned_until is null or account.banned_until<=clock_timestamp())
      and profile.kind in('parent','child') and profile.state in('active','closed')
      and (account.email_confirmed_at is not null or (profile.kind='child' and profile.auth_alias)) for share of session;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  return u;
end $$;

create function app_private.privacy_policy_allows(p_user_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.privacy_lifecycle_policy p cross join app_private.deployment_policy d
    join auth.users u on u.id=p_user_id where p.singleton and d.singleton and p.execution_enabled and nullif(p.reviewed_policy_id,'') is not null
      and ((d.local_synthetic and p.synthetic_fixture_mode and lower(u.email) ~ '@[a-z0-9.-]+\.test$')
        or (not d.local_synthetic and d.real_child_data_enabled and nullif(d.legal_review_id,'') is not null and nullif(d.retention_policy_id,'') is not null)))
$$;

create function app_private.privacy_require_reauth() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); r uuid;
begin
  select id into r from app_private.privacy_reauthentication where user_id=u and session_id=(auth.jwt()->>'session_id')::uuid
    and expires_at>clock_timestamp() order by verified_at desc limit 1;
  if r is null then raise exception 'fresh own-account reauthentication required' using errcode='42501'; end if;
  return r;
end $$;

create function api.record_privacy_reauthentication(p_user_id uuid,p_session_id uuid,p_method text,p_auth_event_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r uuid; expires timestamptz:=clock_timestamp()+interval '5 minutes';
begin
  if not app_private.privacy_policy_allows(p_user_id) then raise exception 'privacy workflow unavailable' using errcode='42501'; end if;
  if not coalesce(p_method in('managed_password','managed_password_totp','synthetic_fixture'),false)
    or coalesce(char_length(p_auth_event_ref),0) not between 1 and 200 or char_length(trim(p_auth_event_ref))=0 then raise exception 'invalid reauthentication evidence' using errcode='22023'; end if;
  if not exists(select 1 from app_private.privacy_lifecycle_policy where singleton and
    (p_method=any(reauth_methods) or (p_method='synthetic_fixture' and synthetic_fixture_mode
      and exists(select 1 from app_private.deployment_policy where singleton and local_synthetic)))) then
    raise exception 'reviewed reauthentication method required' using errcode='42501'; end if;
  perform 1 from auth.sessions s join auth.users u on u.id=s.user_id join app_private.profiles p on p.user_id=u.id
    where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>clock_timestamp())
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and p.kind in('parent','child') and p.state in('active','closed')
      and (u.email_confirmed_at is not null or (p.kind='child' and p.auth_alias)) for share of s;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref,expires_at)
    values(p_user_id,p_session_id,p_method,p_auth_event_ref,expires) returning id into r;
  return jsonb_build_object('id',r,'expiresAt',expires);
end $$;

create function app_private.privacy_request_own_job(p_kind text,p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); r uuid:=app_private.privacy_require_reauth(); j app_private.privacy_lifecycle_jobs;
begin
  if not app_private.privacy_policy_allows(u) then raise exception 'privacy workflow unavailable' using errcode='42501'; end if;
  if p_client_id is null or not coalesce(p_kind in('export','deletion'),false) then raise exception 'invalid privacy command' using errcode='22023'; end if;
  perform app_private.communication_budget(u,'privacy_lifecycle',3);
  insert into app_private.privacy_lifecycle_jobs(requester_id,subject_id,client_id,requested_session,reauth_id,kind)
    values(u,u,p_client_id,(auth.jwt()->>'session_id')::uuid,r,p_kind) on conflict(requester_id,client_id) do nothing;
  select * into j from app_private.privacy_lifecycle_jobs where requester_id=u and client_id=p_client_id;
  if j.kind is distinct from p_kind then raise exception 'idempotency conflict' using errcode='22023'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'executed',j.executed_at is not null,
    'completed',coalesce(j.kind='export' and j.status='ready' and j.artifact_expires_at>clock_timestamp(),false),'journalIncluded',false);
end $$;
create function api.request_own_export(p_client_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select app_private.privacy_request_own_job('export',p_client_id) $$;
create function api.request_own_deletion(p_client_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select app_private.privacy_request_own_job('deletion',p_client_id) $$;

create function app_private.privacy_operator(p_operator uuid,p_requester uuid,p_subject uuid) returns boolean
language sql security definer set search_path='' as $$
  select coalesce(app_private.independent_case_operator(p_operator,p_requester,p_subject,'privacy') and
    not exists(select 1 from app_private.memberships m where m.user_id=p_subject and app_private.is_guardian(m.family_id,p_operator)),false)
$$;
create function api.review_privacy_job(p_job_id uuid,p_operator_id uuid,p_decision text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
  if not found or not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  if not coalesce(p_decision in('approve','reject'),false) or coalesce(char_length(p_reference),0) not between 1 and 200 then raise exception 'invalid review' using errcode='22023'; end if;
  if j.status<>'requested' or j.kind='parental_review' then raise exception 'job is not reviewable for automatic execution' using errcode='22023'; end if;
  update app_private.privacy_lifecycle_jobs set review_operator=p_operator_id,review_reference=p_reference,
    status=case when p_decision='approve' then 'approved' else 'rejected' end where id=j.id;
  return jsonb_build_object('id',j.id,'status',case when p_decision='approve' then 'approved' else 'rejected' end,'completed',false);
end $$;

create function api.queue_parental_privacy_review(p_request_id uuid,p_operator_id uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.privacy_requests; j uuid;
begin
  select * into r from app_private.privacy_requests where id=p_request_id;
  if not found or not app_private.privacy_operator(p_operator_id,r.requester_id,r.subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  if r.kind not in('parental_review','guardian_dispute') or coalesce(char_length(p_reference),0) not between 1 and 200 then raise exception 'invalid parental review' using errcode='22023'; end if;
  insert into app_private.privacy_lifecycle_jobs(requester_id,subject_id,client_id,kind,review_operator,review_reference,source_request_id,status,public_blockers,internal_blockers)
    values(r.requester_id,r.subject_id,r.id,'parental_review',p_operator_id,p_reference,r.id,'blocked',
      array['independent_legal_review_required'],array['parental_rights_or_guardian_dispute_resolution_required','fresh_requester_reauthentication_required'])
    on conflict(requester_id,client_id) do nothing;
  select id into j from app_private.privacy_lifecycle_jobs where requester_id=r.requester_id and client_id=r.id;
  return jsonb_build_object('id',j,'status','blocked','journalIncluded',false,'completed',false);
end $$;

create function api.get_own_case_status(p_kind text,p_case_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); result jsonb;
begin
  if p_kind='report' then
    select jsonb_build_object('id',id,'kind','report','status',status,'response',response,'createdAt',created_at)
      into result from app_private.safety_reports where id=p_case_id and reporter_id=u;
  elsif p_kind='privacy' then
    select jsonb_build_object('id',id,'kind','privacy','status',status,'response',response,'createdAt',created_at)
      into result from app_private.privacy_requests where id=p_case_id and requester_id=u;
  else raise exception 'invalid case kind' using errcode='22023'; end if;
  if result is null then raise exception 'not authorized' using errcode='42501'; end if;
  return result;
end $$;

create function api.get_own_privacy_job(p_job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); j app_private.privacy_lifecycle_jobs;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id and requester_id=u;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'kind',j.kind,'status',case when j.artifact_expires_at<=clock_timestamp() and j.status in('ready','partial_ready') then 'expired' else j.status end,
    'stages',j.stages,'blockers',j.public_blockers,'createdAt',j.created_at,'executedAt',j.executed_at,
    'exportComplete',coalesce(j.status='ready' and j.artifact_expires_at>clock_timestamp(),false),'deletionComplete',false,'journalIncluded',false);
end $$;

create function app_private.privacy_has_hold(p_user uuid,p_scope text) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.privacy_legal_holds where subject_id=p_user and released_at is null
    and expires_at>clock_timestamp() and scope in('account',p_scope))
$$;
create function api.set_privacy_hold(p_subject_id uuid,p_scope text,p_reference text,p_expires_at timestamptz,p_operator_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
  if not app_private.privacy_operator(p_operator_id,p_subject_id,p_subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  if not coalesce(p_scope in('account','identity','consent','messages','reports','finance'),false)
    or coalesce(char_length(p_reference),0) not between 1 and 200 or p_expires_at is null or p_expires_at<=clock_timestamp()
    or p_expires_at>clock_timestamp()+interval '1 year' then raise exception 'invalid finite hold' using errcode='22023'; end if;
  perform app_private.privacy_lock_families(p_subject_id);
  insert into app_private.privacy_legal_holds(subject_id,scope,reference,operator_id,expires_at,review_due_at)
    values(p_subject_id,p_scope,p_reference,p_operator_id,p_expires_at,least(p_expires_at,clock_timestamp()+interval '30 days')) returning id into h;
  return h;
end $$;
create function api.release_privacy_hold(p_hold_id uuid,p_operator_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h app_private.privacy_legal_holds;
begin
  select * into h from app_private.privacy_legal_holds where id=p_hold_id;
  if not found or not app_private.privacy_operator(p_operator_id,h.subject_id,h.subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  perform app_private.privacy_lock_families(h.subject_id);
  perform 1 from app_private.privacy_legal_holds where id=p_hold_id for update;
  update app_private.privacy_legal_holds set released_at=clock_timestamp() where id=h.id;
end $$;

create function api.privacy_finance_sources(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; c app_private.children; state jsonb; source_hash text; result jsonb;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.privacy_lock_families(j.subject_id);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
  if not found or not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) or j.review_operator is distinct from p_operator_id
    or j.kind<>'export' or j.subject_id<>j.requester_id or j.status<>'partial_ready'
    or not coalesce(j.artifact_expires_at>clock_timestamp(),false) or not app_private.privacy_policy_allows(j.requester_id) then
    raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from app_private.privacy_reauthentication where id=j.reauth_id and user_id=j.requester_id
    and session_id=j.requested_session and expires_at>clock_timestamp()) then raise exception 'fresh own-account reauthentication required' using errcode='42501'; end if;
  select * into c from app_private.children where account_user_id=j.subject_id;
  if not found then raise exception 'child binding review required' using errcode='42501'; end if;
  perform app_private.lock_family(c.family_id);
  select a.state into state from app_private.finance_aggregates a where a.family_id=c.family_id;
  if state is null then state:=jsonb_build_object('timezone',(select timezone from app_private.families where id=c.family_id),'children',jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name)),'events','[]'::jsonb); end if;
  source_hash:=encode(sha256(convert_to(state::text,'UTF8')),'hex');
  update app_private.privacy_lifecycle_jobs set finance_manifest=jsonb_build_array(jsonb_build_object('familyId',c.family_id,'childId',c.id,'sourceHash',source_hash)) where id=j.id;
  result:=jsonb_build_object('childId',c.id,'state',state,'sourceHash',source_hash,'actor',jsonb_build_object('role','child','childId',c.id),
    'serverAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  return result;
end $$;

create function app_private.privacy_projection_safe(p_value jsonb,p_depth int default 0) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare item record; value jsonb;
begin
  if p_value is null or p_depth>12 then return false; end if;
  if jsonb_typeof(p_value)='object' then
    for item in select * from jsonb_each(p_value) loop
      if item.key in('matching','commitments','monthlyCapCents','parentBudgetCents','sourceCents','invalidatedCents','eligibleBaseCents',
        'revision','sequence','events','effects','fingerprint','parentBudgetRemainingCents','usedCents','rule') then return false; end if;
      if not app_private.privacy_projection_safe(item.value,p_depth+1) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for value in select jsonb_array_elements(p_value) loop if not app_private.privacy_projection_safe(value,p_depth+1) then return false; end if; end loop;
  elsif jsonb_typeof(p_value)='number' then
    if p_value::numeric<>trunc(p_value::numeric) or p_value::numeric<0 or p_value::numeric>9007199254740991 then return false; end if;
  end if;
  return true;
end $$;

create function api.attach_privacy_finance_projection(p_job_id uuid,p_operator_id uuid,p_source_hash text,p_projection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; c app_private.children; state jsonb; current_hash text;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.privacy_lock_families(j.subject_id);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
  if not found or not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) or j.review_operator is distinct from p_operator_id
    or j.kind<>'export' or j.subject_id<>j.requester_id or j.status<>'partial_ready' or not coalesce(j.artifact_expires_at>clock_timestamp(),false)
    or not app_private.privacy_policy_allows(j.requester_id) then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from app_private.privacy_reauthentication where id=j.reauth_id and user_id=j.requester_id
    and session_id=j.requested_session and expires_at>clock_timestamp()) then raise exception 'fresh own-account reauthentication required' using errcode='42501'; end if;
  select * into c from app_private.children where account_user_id=j.subject_id;
  if not found then raise exception 'child binding review required' using errcode='42501'; end if;
  perform app_private.lock_family(c.family_id);
  select a.state into state from app_private.finance_aggregates a where a.family_id=c.family_id;
  if state is null then state:=jsonb_build_object('timezone',(select timezone from app_private.families where id=c.family_id),'children',jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name)),'events','[]'::jsonb); end if;
  current_hash:=encode(sha256(convert_to(state::text,'UTF8')),'hex');
  if p_source_hash is distinct from current_hash or j.finance_manifest->0->>'sourceHash' is distinct from p_source_hash then return jsonb_build_object('status','conflict'); end if;
  if p_projection is null or jsonb_typeof(p_projection)<>'object' or octet_length(p_projection::text)>1048576
    or p_projection->>'childId' is distinct from c.id::text or not app_private.privacy_projection_safe(p_projection)
    or p_projection-array['childId','childName','timezone','plan','occurrences','goals','savingsRules','payouts','balances','payout','activity']<>'{}'::jsonb
    or not coalesce(jsonb_typeof(p_projection->'activity')='array',false)
    or not coalesce(jsonb_typeof(p_projection->'goals')='array',false)
    or not coalesce(jsonb_typeof(p_projection->'occurrences')='array',false)
    or not coalesce(jsonb_typeof(p_projection->'payouts')='array',false)
    or not coalesce(jsonb_typeof(p_projection->'savingsRules')='array',false)
    or not coalesce(jsonb_typeof(p_projection->'balances')='object',false)
    or not coalesce(jsonb_typeof(p_projection->'payout')='object',false) then raise exception 'unsafe child finance projection' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(state->'events') event where event->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')
    and nullif(event->>'id','') is not null and strpos(p_projection::text,event->>'id')>0) then raise exception 'unsafe child finance projection' using errcode='22023'; end if;
  update app_private.privacy_lifecycle_jobs set artifact=jsonb_set(artifact,'{finance}',jsonb_build_array(p_projection)),
    status='ready',public_blockers='{}',stages=array_append(stages,'own_child_finance_projection_attached') where id=j.id;
  return jsonb_build_object('id',j.id,'status','ready','journalIncluded',false,'completed',true);
end $$;

create function api.get_own_export(p_job_id uuid,p_allow_partial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); r uuid:=app_private.privacy_require_reauth(); j app_private.privacy_lifecycle_jobs;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id and requester_id=u and subject_id=u and kind='export';
  if not found or not app_private.privacy_policy_allows(u) then raise exception 'not authorized' using errcode='42501'; end if;
  if not coalesce(j.status in('ready','partial_ready','expired'),false) then raise exception 'export not ready' using errcode='42501'; end if;
  if not coalesce(j.artifact_expires_at>clock_timestamp(),false) then
    update app_private.privacy_lifecycle_jobs set artifact=null,status='expired' where id=j.id;
    return jsonb_build_object('id',j.id,'status','expired','data',null,'completed',false);
  end if;
  if not coalesce(j.status='ready' or (j.status='partial_ready' and coalesce(p_allow_partial,false)),false) or j.artifact is null then
    raise exception 'export not ready' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'data',j.artifact,'completed',j.status='ready','blockers',j.public_blockers,'journalIncluded',false);
end $$;

create function api.get_privacy_job_review(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found or not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) or j.review_operator is distinct from p_operator_id then
    raise exception 'independent assigned privacy operator required' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'kind',j.kind,'stages',j.stages,'blockers',j.internal_blockers,
    'reviewReference',j.review_reference,'executedAt',j.executed_at,'deletionComplete',false);
end $$;

create function api.run_privacy_retention(p_subject_id uuid,p_operator_id uuid,p_limit int default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run uuid; policy app_private.privacy_lifecycle_policy; n int; counts jsonb:='{}'; candidate record;
begin
  if not app_private.privacy_operator(p_operator_id,p_subject_id,p_subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  select * into policy from app_private.privacy_lifecycle_policy where singleton;
  if not app_private.privacy_policy_allows(p_subject_id) or not policy.retention_enabled then raise exception 'retention execution unavailable' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid retention batch size' using errcode='22023'; end if;
  perform app_private.privacy_lock_families(p_subject_id);
  insert into app_private.privacy_retention_runs(operator_id) values(p_operator_id) returning id into run;
  with expired as(select id from app_private.privacy_lifecycle_jobs where subject_id=p_subject_id and artifact is not null and artifact_expires_at<=clock_timestamp() order by id limit p_limit)
    update app_private.privacy_lifecycle_jobs set artifact=null,status='expired' where id in(select id from expired);
  get diagnostics n=row_count; counts:=counts||jsonb_build_object('exportArtifacts',n);
  delete from app_private.privacy_reauthentication where user_id=p_subject_id and expires_at<clock_timestamp()-interval '1 day';
  get diagnostics n=row_count; counts:=counts||jsonb_build_object('reauthenticationReceipts',n);
  delete from app_private.communication_budgets where user_id=p_subject_id and minute<clock_timestamp()-interval '1 day';
  delete from app_private.notification_outbox where id in(select id from app_private.notification_outbox where recipient_id=p_subject_id
    and status in('provider_accepted','suppressed','failed') and created_at<clock_timestamp()-make_interval(days=>policy.notification_days) order by id limit p_limit);
  get diagnostics n=row_count; counts:=counts||jsonb_build_object('notificationRecords',n);
  delete from app_private.safety_reports where id in(select id from app_private.safety_reports where reporter_id=p_subject_id and status='closed'
    and updated_at<clock_timestamp()-make_interval(days=>policy.closed_case_days) and not app_private.privacy_has_hold(p_subject_id,'reports') order by id limit p_limit);
  get diagnostics n=row_count; counts:=counts||jsonb_build_object('ownClosedReports',n);
  delete from app_private.privacy_requests where id in(select id from app_private.privacy_requests where requester_id=p_subject_id and status='closed'
    and updated_at<clock_timestamp()-make_interval(days=>policy.closed_case_days) and not app_private.privacy_has_hold(p_subject_id,'identity') order by id limit p_limit);
  get diagnostics n=row_count; counts:=counts||jsonb_build_object('ownClosedPrivacyRequests',n);
  for candidate in select m.id from app_private.messages m where p_subject_id in(m.sender_id,m.recipient_id)
    and m.created_at<clock_timestamp()-make_interval(days=>policy.message_days)
    and not app_private.privacy_has_hold(m.sender_id,'messages') and not app_private.privacy_has_hold(m.recipient_id,'messages')
    and not exists(select 1 from app_private.safety_reports r where r.message_id=m.id) order by m.id limit p_limit loop
    delete from app_private.notification_outbox where message_id=candidate.id;
    delete from app_private.messages where id=candidate.id;
    counts:=jsonb_set(counts,'{expiredMessages}',to_jsonb(coalesce((counts->>'expiredMessages')::int,0)+1));
  end loop;
  update app_private.privacy_retention_runs set completed_at=clock_timestamp(),deleted_counts=counts,
    blockers=array['immutable_finance_retention_requires_reviewed_purge','identity_consent_and_multiparty_records_not_automatically_deleted','provider_and_backup_retention_not_verified','hold_review_due_dates_require_operator_followthrough'] where id=run;
  return jsonb_build_object('id',run,'status','executed','deletedCounts',counts,'allDataDeleted',false);
end $$;

create function app_private.privacy_lock_families(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f uuid; contact record;
begin
  for f in select family_id from (
    select family_id from app_private.memberships where user_id=p_user
    union select family_id from app_private.children where account_user_id=p_user
    union select family_id from app_private.trusted_contacts where p_user in(a,b)) families order by family_id loop perform app_private.lock_family(f); end loop;
  for contact in select id from app_private.trusted_contacts where p_user in(a,b) order by family_id,a,b loop perform app_private.lock_contact(contact.id); end loop;
end $$;

create function app_private.privacy_export_core(p_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; subject_kind text;
begin
  select kind into subject_kind from app_private.profiles where user_id=p_subject;
  if (select count(*) from app_private.messages where sender_id=p_subject or (recipient_id=p_subject and acknowledged_at is not null))>1000
    or (select count(*) from app_private.safety_reports where reporter_id=p_subject)>100
    or (select count(*) from app_private.privacy_requests where requester_id=p_subject)>100 then
    raise exception 'export capacity review required' using errcode='54000'; end if;
  select jsonb_build_object('format','between-us-own-server-data-v1','generatedAt',clock_timestamp(),'journalIncluded',false,
    'subject',jsonb_build_object('id',p.user_id,'displayName',p.display_name,'kind',p.kind,'state',p.state,'email',case when not p.auth_alias then u.email end),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('familyId',m.family_id,'role',m.role,'childId',m.child_id,'status',m.status)) from app_private.memberships m where m.user_id=p_subject),'[]'),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'familyId',c.family_id,'a',c.a,'b',c.b,'revokedAt',c.revoked_at)) from app_private.trusted_contacts c where p_subject in(c.a,c.b)),'[]'),
    'ownBlocks',coalesce((select jsonb_agg(jsonb_build_object('blockedUserId',blocked,'createdAt',created_at)) from app_private.private_blocks where blocker=p_subject),'[]'),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('childId',co.child_id,'status',co.status,'noticeVersion',co.notice_version,'policyVersion',co.policy_version,'scope',co.scope,'verifiedAt',co.verified_at,'withdrawnAt',co.withdrawn_at,'revokedAt',co.revoked_at))
      from app_private.consents co where co.guardian_user_id=p_subject or exists(select 1 from app_private.children c where c.id=co.child_id and c.account_user_id=p_subject)),'[]'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,'recipientId',m.recipient_id,'body',m.body,'response',m.response,'createdAt',m.created_at) order by m.created_at,m.id)
      from app_private.messages m where m.sender_id=p_subject or (m.recipient_id=p_subject and m.acknowledged_at is not null)),'[]'),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reportedUserId',r.reported_user_id,'description',r.description,'selectedMessageBody',r.selected_message_body,'status',r.status,'response',r.response,'createdAt',r.created_at)) from app_private.safety_reports r where r.reporter_id=p_subject),'[]'),
    'privacyRequests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'subjectId',r.subject_id,'description',r.description,'status',r.status,'response',r.response,'createdAt',r.created_at)) from app_private.privacy_requests r where r.requester_id=p_subject),'[]'),
    'notificationPreferences',coalesce((select jsonb_build_object('enabled',enabled,'timezone',timezone,'quietStart',quiet_start,'quietEnd',quiet_end) from app_private.notification_preferences where user_id=p_subject),'{}'),
    'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'createdAt',created_at,'revokedAt',revoked_at)) from app_private.device_tokens where user_id=p_subject),'[]'),
    'finance',case when subject_kind='child' then '[]'::jsonb else coalesce((select jsonb_agg(e.payload order by c.server_at,c.operation_id) from app_private.finance_commands c
      join app_private.finance_events e on e.family_id=c.family_id and e.sequence=c.event_sequence where c.actor_id=p_subject),'[]'::jsonb) end)
    into result from app_private.profiles p join auth.users u on u.id=p.user_id where p.user_id=p_subject;
  if result is null or octet_length(result::text)>7340032 then raise exception 'export capacity review required' using errcode='54000'; end if;
  return result;
end $$;

create function api.execute_privacy_job(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; payload jsonb; manifest jsonb; subject_kind text; contact record; affected int; internal text[]:='{}';
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found or not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) then raise exception 'independent privacy operator required' using errcode='42501'; end if;
  if not app_private.privacy_policy_allows(j.requester_id) or j.subject_id<>j.requester_id or j.kind='parental_review' then raise exception 'own-data execution unavailable' using errcode='42501'; end if;
  -- Match identity's session-before-family order before deleting managed sessions.
  if j.kind='deletion' then perform 1 from auth.sessions where user_id=j.subject_id order by id for update;
  else perform 1 from auth.sessions where id=j.requested_session and user_id=j.requester_id for share; end if;
  perform app_private.privacy_lock_families(j.subject_id);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
  if j.status in('ready','partial_ready','access_revoked') then return jsonb_build_object('id',j.id,'status',j.status,'deletionComplete',false); end if;
  if j.status<>'approved' or j.review_operator is distinct from p_operator_id then raise exception 'approved assigned execution required' using errcode='42501'; end if;
  if not exists(select 1 from app_private.privacy_reauthentication where id=j.reauth_id and user_id=j.requester_id
    and session_id=j.requested_session and expires_at>clock_timestamp()) then
    update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['fresh_reauthentication_required'],internal_blockers=array['fresh_reauthentication_required'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','blocked','completed',false);
  end if;
  select kind into subject_kind from app_private.profiles where user_id=j.subject_id;
  if j.kind='export' then
    begin payload:=app_private.privacy_export_core(j.subject_id);
    exception when sqlstate '54000' then
      update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['export_capacity_review_required'],internal_blockers=array['export_capacity_review_required'] where id=j.id;
      return jsonb_build_object('id',j.id,'status','blocked','completed',false);
    end;
    select coalesce(jsonb_agg(jsonb_build_object('familyId',c.family_id,'childId',c.id)),'[]'::jsonb) into manifest from app_private.children c where c.account_user_id=j.subject_id;
    update app_private.privacy_lifecycle_jobs set artifact=payload,finance_manifest=case when subject_kind='child' then manifest else '[]'::jsonb end,
      status=case when subject_kind='child' then 'partial_ready' else 'ready' end,
      public_blockers=case when subject_kind='child' then array['finance_projection_pending'] else '{}'::text[] end,
      stages=array['own_server_records_exported'],artifact_expires_at=clock_timestamp()+make_interval(hours=>(select artifact_hours from app_private.privacy_lifecycle_policy where singleton)),executed_at=clock_timestamp() where id=j.id;
    return jsonb_build_object('id',j.id,'status',case when subject_kind='child' then 'partial_ready' else 'ready' end,'journalIncluded',false,'completed',subject_kind<>'child');
  end if;
  if exists(select 1 from app_private.memberships m where m.user_id=j.subject_id and m.role='guardian' and m.status='active'
    and exists(select 1 from app_private.children c where c.family_id=m.family_id and c.state='active' and c.account_user_id is distinct from j.subject_id)
    and not exists(select 1 from app_private.memberships other where other.family_id=m.family_id and other.user_id<>j.subject_id and app_private.is_guardian(m.family_id,other.user_id))) then
    update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['guardian_handoff_review_required'],internal_blockers=array['last_guardian_with_active_child'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','blocked','completed',false);
  end if;
  update app_private.trusted_contacts set revoked_at=coalesce(revoked_at,clock_timestamp()) where j.subject_id in(a,b);
  update app_private.memberships set status='revoked' where user_id=j.subject_id;
  update app_private.consents set status='revoked',revoked_at=coalesce(revoked_at,clock_timestamp()) where guardian_user_id=j.subject_id
    or child_id in(select id from app_private.children where account_user_id=j.subject_id);
  delete from app_private.notification_outbox where recipient_id=j.subject_id or message_id in(select id from app_private.messages where sender_id=j.subject_id);
  delete from app_private.device_tokens where user_id=j.subject_id;
  delete from auth.sessions where user_id=j.subject_id;
  delete from app_private.notification_preferences where user_id=j.subject_id;
  delete from api.user_invalidations where user_id=j.subject_id;
  delete from app_private.communication_budgets where user_id=j.subject_id;
  update app_private.registration_intents set expires_at=clock_timestamp() where issued_by=j.subject_id or bound_user_id=j.subject_id;
  update app_private.guardian_invites set revoked_at=coalesce(revoked_at,clock_timestamp()) where issued_by=j.subject_id or accepted_by=j.subject_id;
  if not app_private.privacy_has_hold(j.subject_id,'identity') then
    update app_private.profiles set state='closed',display_name='Deleted account' where user_id=j.subject_id;
    update app_private.children set state='closed',name='Deleted account' where account_user_id=j.subject_id;
  else update app_private.profiles set state='closed' where user_id=j.subject_id; internal:=array_append(internal,'identity_hold'); end if;
  delete from app_private.notification_outbox where message_id in(select m.id from app_private.messages m where m.sender_id=j.subject_id and m.acknowledged_at is null
    and not app_private.privacy_has_hold(m.sender_id,'messages') and not app_private.privacy_has_hold(m.recipient_id,'messages') and not exists(select 1 from app_private.safety_reports r where r.message_id=m.id));
  delete from app_private.messages m where m.sender_id=j.subject_id and m.acknowledged_at is null
    and not app_private.privacy_has_hold(m.sender_id,'messages') and not app_private.privacy_has_hold(m.recipient_id,'messages') and not exists(select 1 from app_private.safety_reports r where r.message_id=m.id);
  delete from app_private.safety_reports where reporter_id=j.subject_id and status='closed' and not app_private.privacy_has_hold(j.subject_id,'reports');
  update app_private.privacy_lifecycle_jobs set artifact=null,artifact_expires_at=null,status='expired' where subject_id=j.subject_id and kind='export';
  -- Stable public blockers do not reveal whether somebody else reported this subject.
  update app_private.privacy_lifecycle_jobs set status='access_revoked',executed_at=clock_timestamp(),
    stages=array['account_access_revoked','managed_sessions_revoked','device_tokens_erased','notification_preferences_erased','unshared_unheld_sent_messages_erased','own_export_artifacts_erased'],
    public_blockers=array['shared_record_review','restricted_records_review','retention_review_required','auth_identity_purge_pending','provider_deletion_confirmation_pending','backup_expiry_confirmation_pending','local_device_erase_not_confirmed'],
    internal_blockers=internal||array['immutable_finance_and_multiparty_records_need_reviewed_purge','restricted_cases_preserved_without_subject_disclosure','auth_user_and_foreign_key_references_remain','external_provider_and_backup_evidence_required','device_only_vault_not_remotely_erased'] where id=j.id;
  return jsonb_build_object('id',j.id,'status','access_revoked','stagesExecuted',true,'deletionComplete',false,'journalIncluded',false);
end $$;

do $$ declare table_name text; function_row record; begin
  foreach table_name in array array['privacy_lifecycle_policy','privacy_reauthentication','privacy_lifecycle_jobs','privacy_legal_holds','privacy_retention_runs'] loop
    execute format('alter table app_private.%I enable row level security',table_name);
    execute format('revoke all on app_private.%I from public,anon,authenticated',table_name);
  end loop;
  for function_row in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='app_private' and p.proname in('privacy_identity_actor','privacy_policy_allows','privacy_require_reauth','privacy_request_own_job',
      'privacy_operator','privacy_has_hold','privacy_lock_families','privacy_export_core','privacy_projection_safe'))
      or (n.nspname='api' and p.proname in('record_privacy_reauthentication','request_own_export','request_own_deletion','review_privacy_job','queue_parental_privacy_review',
        'get_own_case_status','get_own_privacy_job','set_privacy_hold','release_privacy_hold','execute_privacy_job','privacy_finance_sources',
        'attach_privacy_finance_projection','get_own_export','get_privacy_job_review','run_privacy_retention')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',function_row.signature);
    if function_row.nspname='api' then
      if function_row.proname in('request_own_export','request_own_deletion','get_own_case_status','get_own_privacy_job','get_own_export') then
        execute format('grant execute on function %s to authenticated',function_row.signature);
      else execute format('grant execute on function %s to service_role',function_row.signature); end if;
    end if;
  end loop;
end $$;
