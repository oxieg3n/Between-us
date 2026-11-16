begin;

-- Reuse the existing session-before-family lock order. Time is sampled after the row lock is acquired.
create function app_private.assert_live_session(p_user uuid,p_session uuid,p_expires numeric default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare deadline timestamptz; checked_at timestamptz;
begin
  if p_user is null or p_session is null or (p_expires is not null and
    (p_expires::text in('NaN','Infinity','-Infinity') or p_expires<=extract(epoch from clock_timestamp()))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  select s.not_after into deadline from auth.sessions s where s.id=p_session and s.user_id=p_user for share;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  checked_at:=clock_timestamp();
  if (p_expires is not null and p_expires<=extract(epoch from checked_at)) or
    (deadline is not null and (not isfinite(deadline) or deadline<=checked_at)) then
    raise exception 'not authorized' using errcode='42501'; end if;
end $$;
revoke all on function app_private.assert_live_session(uuid,uuid,numeric) from public,anon,authenticated,service_role;

create or replace function app_private.account_usable(p_user_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists (
    select 1 from app_private.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_user_id and p.state='active' and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=clock_timestamp())
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
              and co.withdrawn_at is null and co.revoked_at is null and co.expires_at>clock_timestamp()
              and gm.role='guardian' and gm.status='active' and gp.kind='parent' and gp.state='active'
          )
      )))
  );
$$;

create or replace function app_private.actor() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid; v_session uuid; v_exp numeric; v_profile app_private.profiles;
begin
  begin
    v_uid:=auth.uid(); v_session:=(auth.jwt()->>'session_id')::uuid;
    if jsonb_typeof(auth.jwt()->'exp') is distinct from 'number' or length(auth.jwt()->>'exp')>24 then
      raise exception 'not authorized' using errcode='42501'; end if;
    v_exp:=(auth.jwt()->>'exp')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if v_exp is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.assert_live_session(v_uid,v_session,v_exp);
  select * into v_profile from app_private.profiles where user_id=v_uid;
  if not found or v_profile.state in('suspended','closed') or not exists(
      select 1 from auth.users u where u.id=v_uid and u.deleted_at is null
        and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and (u.email_confirmed_at is not null or (v_profile.kind='child' and v_profile.auth_alias)))
    or (v_profile.state='active' and not app_private.account_usable(v_uid)) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return v_uid;
end $$;

create or replace function app_private.finance_authorize(p_scope jsonb) returns text
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid; v_sid uuid; v_family uuid; v_child uuid; v_exp numeric; v_role text;
begin
  begin
    v_uid:=(p_scope->>'actorId')::uuid; v_sid:=(p_scope->>'sessionId')::uuid;
    v_family:=(p_scope->>'familyId')::uuid; v_child:=(p_scope->>'childId')::uuid;
    if jsonb_typeof(p_scope->'expiresAt') is distinct from 'number' or length(p_scope->>'expiresAt')>24 then
      raise exception 'not authorized' using errcode='42501'; end if;
    v_exp:=(p_scope->>'expiresAt')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if v_exp is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.assert_live_session(v_uid,v_sid,v_exp);
  perform app_private.lock_family(v_family);
  -- This is the same session row already held above, not a new session-after-family lock order.
  perform app_private.assert_live_session(v_uid,v_sid,v_exp);
  if not app_private.account_usable(v_uid) then raise exception 'not authorized' using errcode='42501'; end if;
  if app_private.is_guardian(v_family,v_uid) then v_role:='parent';
  elsif app_private.child_for_user(v_family,v_uid)=v_child then v_role:='child';
  else raise exception 'not authorized' using errcode='42501'; end if;
  if v_role is distinct from p_scope->>'role' or not exists(select 1 from app_private.children c
    where c.id=v_child and c.family_id=v_family and c.state<>'closed') then
    raise exception 'not authorized' using errcode='42501'; end if;
  return v_role;
end $$;

create or replace function app_private.privacy_identity_actor() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare u uuid; s uuid; expires numeric;
begin
  begin
    u:=auth.uid(); s:=(auth.jwt()->>'session_id')::uuid;
    if jsonb_typeof(auth.jwt()->'exp') is distinct from 'number' or length(auth.jwt()->>'exp')>24 then
      raise exception 'not authorized' using errcode='42501'; end if;
    expires:=(auth.jwt()->>'exp')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if expires is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.assert_live_session(u,s,expires);
  if not exists(select 1 from auth.users account join app_private.profiles profile on profile.user_id=account.id
    where account.id=u and account.deleted_at is null
      and (account.banned_until is null or account.banned_until<=clock_timestamp())
      and profile.kind in('parent','child') and profile.state in('active','closed')
      and (account.email_confirmed_at is not null or (profile.kind='child' and profile.auth_alias))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return u;
end $$;

create or replace function api.record_privacy_reauthentication(p_user_id uuid,p_session_id uuid,p_method text,p_auth_event_ref text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r uuid; expires timestamptz:=clock_timestamp()+interval '5 minutes';
begin
  if not app_private.privacy_policy_allows(p_user_id) then raise exception 'privacy workflow unavailable' using errcode='42501'; end if;
  if not coalesce(p_method in('managed_password','managed_password_totp','synthetic_fixture'),false)
    or coalesce(char_length(p_auth_event_ref),0) not between 1 and 200 or char_length(trim(p_auth_event_ref))=0 then
    raise exception 'invalid reauthentication evidence' using errcode='22023'; end if;
  if not exists(select 1 from app_private.privacy_lifecycle_policy where singleton and
    (p_method=any(reauth_methods) or (p_method='synthetic_fixture' and synthetic_fixture_mode
      and exists(select 1 from app_private.deployment_policy where singleton and local_synthetic)))) then
    raise exception 'reviewed reauthentication method required' using errcode='42501'; end if;
  perform app_private.assert_live_session(p_user_id,p_session_id);
  if not exists(select 1 from auth.users u join app_private.profiles p on p.user_id=u.id
    where u.id=p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and p.kind in('parent','child') and p.state in('active','closed')
      and (u.email_confirmed_at is not null or (p.kind='child' and p.auth_alias))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  -- A wait consumes the original evidence interval; it never renews an old password proof.
  if expires<=clock_timestamp() then raise exception 'fresh own-account reauthentication required' using errcode='42501'; end if;
  insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref,expires_at)
    values(p_user_id,p_session_id,p_method,p_auth_event_ref,expires) returning id into r;
  return jsonb_build_object('id',r,'expiresAt',expires);
end $$;

create or replace function app_private.privacy_parent_lock(p_job_id uuid,p_operator_id uuid) returns app_private.privacy_lifecycle_jobs
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; before_families uuid[]; original_session uuid; original_requester uuid;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  original_session:=j.requested_session; original_requester:=j.requester_id;
  perform app_private.assert_live_session(original_requester,original_session);
  select coalesce(array_agg(family_id order by family_id),'{}'::uuid[]) into before_families from app_private.memberships where user_id=j.subject_id;
  perform app_private.privacy_lock_families(j.subject_id);
  perform pg_advisory_xact_lock(hashtextextended('account-admin:'||j.subject_id::text,0));
  if before_families is distinct from (select coalesce(array_agg(family_id order by family_id),'{}'::uuid[])
    from app_private.memberships where user_id=j.subject_id) then
    raise exception 'financial scope changed; retry' using errcode='40001'; end if;
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
  if not found or j.requested_session is distinct from original_session or j.requester_id is distinct from original_requester then
    raise exception 'financial scope changed; retry' using errcode='40001'; end if;
  perform app_private.assert_live_session(original_requester,original_session);
  if not app_private.privacy_operator(p_operator_id,j.requester_id,j.subject_id) or j.review_operator is distinct from p_operator_id
    or j.kind<>'export' or j.requester_id is distinct from j.subject_id or j.status not in('approved','partial_ready','ready')
    or (j.status<>'approved' and not coalesce(j.artifact_expires_at>clock_timestamp(),false)) or not app_private.privacy_policy_allows(j.subject_id)
    or not exists(select 1 from app_private.profiles where user_id=j.subject_id and kind='parent' and state='active')
    or not app_private.account_usable(j.subject_id) then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from app_private.privacy_reauthentication r where r.id=j.reauth_id and r.user_id=j.requester_id
    and r.session_id=j.requested_session and r.expires_at>clock_timestamp()) then
    raise exception 'fresh own-account reauthentication required' using errcode='42501'; end if;
  if j.status='ready' and exists(select 1 from jsonb_array_elements(j.finance_manifest) scope where
    not app_private.is_guardian((scope->>'familyId')::uuid,j.subject_id) or not exists(select 1 from app_private.children c
      where c.id::text=scope->>'childId' and c.family_id::text=scope->>'familyId' and c.state<>'closed')) then
    update app_private.privacy_lifecycle_jobs set artifact=jsonb_set(artifact,'{finance}','[]'),status='partial_ready',
      public_blockers=array['financial_scope_review_required'],parent_finance_source_hash=null where id=j.id returning * into j;
  end if;
  return j;
end $$;

create or replace function api.privacy_parent_finance_sources(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; bundle jsonb; hash text; at timestamptz;
begin
  j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  if j.status not in('partial_ready','ready') then raise exception 'export execution required' using errcode='42501'; end if;
  if j.status='ready' then return jsonb_build_object('id',j.id,'status','ready','completed',true); end if;
  begin bundle:=app_private.privacy_parent_bundle(j.subject_id);
  exception when sqlstate '54000' then
    update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['export_capacity_review_required'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','blocked','completed',false);
  end;
  at:=clock_timestamp();
  hash:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');
  update app_private.privacy_lifecycle_jobs set finance_manifest=bundle->'scopes',parent_finance_source_hash=hash,parent_finance_server_at=at where id=j.id;
  return jsonb_build_object('id',j.id,'status','partial_ready','actor',jsonb_build_object('role','parent'),
    'families',bundle->'families','sourceHash',hash,'serverAt',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;

commit;
