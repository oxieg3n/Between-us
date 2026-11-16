-- Parent artifacts use reviewed role-safe views, never raw ledger/command payloads.
alter table app_private.privacy_lifecycle_jobs add column parent_finance_initialized boolean not null default false;
alter table app_private.privacy_lifecycle_jobs add column parent_finance_source_hash text;
alter table app_private.privacy_lifecycle_jobs add column parent_finance_server_at timestamptz;

create function app_private.privacy_parent_bundle(p_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare families jsonb; scopes jsonb; needs_review boolean; result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('familyId',a.family_id,'childIds',
    coalesce((select jsonb_agg(c.id order by c.id) from app_private.children c where c.family_id=a.family_id and c.state<>'closed'),'[]'),
    'state',jsonb_set(a.state,'{children}',coalesce(a.state->'children','[]')||coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.id)
      from app_private.children c where c.family_id=a.family_id and c.state<>'closed' and not exists(select 1 from jsonb_array_elements(coalesce(a.state->'children','[]')) old where old->>'id'=c.id::text)),'[]')))
    order by a.family_id),'[]') into families from app_private.finance_aggregates a where app_private.is_guardian(a.family_id,p_subject);
  select coalesce(jsonb_agg(jsonb_build_object('familyId',a.family_id,'childId',c.id) order by a.family_id,c.id),'[]') into scopes
    from app_private.finance_aggregates a join app_private.children c on c.family_id=a.family_id and c.state<>'closed'
    where app_private.is_guardian(a.family_id,p_subject);
  select exists(select 1 from app_private.memberships m join app_private.finance_aggregates a on a.family_id=m.family_id
      where m.user_id=p_subject and m.role='guardian' and not app_private.is_guardian(m.family_id,p_subject))
    or exists(select 1 from app_private.finance_commands cmd where cmd.actor_id=p_subject and not app_private.is_guardian(cmd.family_id,p_subject))
    or exists(select 1 from app_private.finance_aggregates a cross join lateral jsonb_array_elements(coalesce(a.state->'children','[]')) roster
      where app_private.is_guardian(a.family_id,p_subject) and not exists(select 1 from app_private.children c where c.family_id=a.family_id and c.state<>'closed' and c.id::text=roster->>'id'))
    or exists(select 1 from app_private.finance_aggregates a where app_private.is_guardian(a.family_id,p_subject)
      and jsonb_array_length(coalesce(a.state->'events','[]'))>0 and not exists(select 1 from app_private.children c where c.family_id=a.family_id and c.state<>'closed')) into needs_review;
  result:=jsonb_build_object('families',families,'scopes',scopes,'reviewRequired',needs_review);
  if jsonb_array_length(families)>4 or jsonb_array_length(scopes)>48 or octet_length(result::text)>6291456 then
    raise exception 'export capacity review required' using errcode='54000'; end if;
  return result;
end $$;

create function app_private.parent_finance_export_job() returns trigger
language plpgsql security definer set search_path='' as $$
declare bundle jsonb;
begin
  if new.kind='export' and new.subject_id=new.requester_id and new.artifact is not null and not new.parent_finance_initialized
    and exists(select 1 from app_private.profiles where user_id=new.subject_id and kind='parent') then
    new.parent_finance_initialized:=true;
    new.artifact:=jsonb_set(new.artifact,'{finance}','[]');
    begin bundle:=app_private.privacy_parent_bundle(new.subject_id);
    exception when sqlstate '54000' then
      new.status:='blocked'; new.public_blockers:=array['export_capacity_review_required'];
      new.internal_blockers:=array_append(new.internal_blockers,'parent_finance_capacity_review'); return new;
    end;
    new.finance_manifest:=bundle->'scopes';
    if jsonb_array_length(bundle->'scopes')>0 or (bundle->>'reviewRequired')::boolean then
      new.status:='partial_ready'; new.public_blockers:='{}';
      if jsonb_array_length(bundle->'scopes')>0 then new.public_blockers:=array_append(new.public_blockers,'parent_finance_projection_pending'); end if;
      if (bundle->>'reviewRequired')::boolean then new.public_blockers:=array_append(new.public_blockers,'financial_scope_review_required'); end if;
      new.stages:=array_append(new.stages,'parent_finance_scope_manifest_prepared');
    end if;
  end if;
  return new;
end $$;
-- Alphabetically after checkin_privacy_job; preserve its own-author metadata hook.
create trigger parent_finance_export_job before insert or update on app_private.privacy_lifecycle_jobs
  for each row execute function app_private.parent_finance_export_job();

create function app_private.privacy_parent_lock(p_job_id uuid,p_operator_id uuid) returns app_private.privacy_lifecycle_jobs
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; before_families uuid[];
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform 1 from auth.sessions s where s.id=j.requested_session and s.user_id=j.requester_id and (s.not_after is null or s.not_after>clock_timestamp()) for share;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  select coalesce(array_agg(family_id order by family_id),'{}'::uuid[]) into before_families from app_private.memberships where user_id=j.subject_id;
  perform app_private.privacy_lock_families(j.subject_id);
  -- Same admission lock as 011, taken after the family/relationship locks.
  -- Never acquire a newly discovered lower family after a pair lock: retry instead.
  perform pg_advisory_xact_lock(hashtextextended('account-admin:'||j.subject_id::text,0));
  if before_families is distinct from (select coalesce(array_agg(family_id order by family_id),'{}'::uuid[]) from app_private.memberships where user_id=j.subject_id) then
    raise exception 'financial scope changed; retry' using errcode='40001'; end if;
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id for update;
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

create function api.privacy_parent_finance_sources(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; bundle jsonb; hash text; at timestamptz:=clock_timestamp();
begin
  j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  if j.status not in('partial_ready','ready') then raise exception 'export execution required' using errcode='42501'; end if;
  if j.status='ready' then return jsonb_build_object('id',j.id,'status','ready','completed',true); end if;
  begin bundle:=app_private.privacy_parent_bundle(j.subject_id);
  exception when sqlstate '54000' then
    update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['export_capacity_review_required'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','blocked','completed',false);
  end;
  hash:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');
  update app_private.privacy_lifecycle_jobs set finance_manifest=bundle->'scopes',parent_finance_source_hash=hash,parent_finance_server_at=at where id=j.id;
  return jsonb_build_object('id',j.id,'status','partial_ready','actor',jsonb_build_object('role','parent'),
    'families',bundle->'families','sourceHash',hash,'serverAt',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;

create function app_private.privacy_parent_projection_safe(p_value jsonb,p_depth int default 0) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare item record; value jsonb;
begin
  if p_value is null or p_depth>16 then return false; end if;
  if jsonb_typeof(p_value)='object' then
    for item in select * from jsonb_each(p_value) loop
      if item.key in('events','effects','fingerprint','revision','sequence','sourceHash','state','journal','reports','checkins')
        or not app_private.privacy_parent_projection_safe(item.value,p_depth+1) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for value in select jsonb_array_elements(p_value) loop if not app_private.privacy_parent_projection_safe(value,p_depth+1) then return false; end if; end loop;
  elsif jsonb_typeof(p_value)='number' then
    if p_value::numeric<>trunc(p_value::numeric) or abs(p_value::numeric)>9007199254740991 then return false; end if;
  end if;
  return true;
end $$;

create function api.attach_privacy_parent_finance_projections(p_job_id uuid,p_operator_id uuid,p_source_hash text,p_projections jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs; bundle jsonb; hash text; item jsonb; view jsonb; candidate jsonb; final_status text; blockers text[]:='{}';
begin
  j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  if j.status not in('partial_ready','ready') then raise exception 'export execution required' using errcode='42501'; end if;
  if j.status='ready' then
    if j.parent_finance_source_hash is not distinct from p_source_hash and j.artifact->'finance' is not distinct from p_projections then
      return jsonb_build_object('id',j.id,'status','ready','completed',true,'journalIncluded',false);
    end if;
    raise exception 'idempotency conflict' using errcode='22023';
  end if;
  begin bundle:=app_private.privacy_parent_bundle(j.subject_id);
  exception when sqlstate '54000' then
    update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array['export_capacity_review_required'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','blocked','completed',false);
  end;
  hash:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');
  if p_source_hash is distinct from hash or j.parent_finance_source_hash is distinct from hash or j.finance_manifest is distinct from bundle->'scopes' then return jsonb_build_object('status','conflict'); end if;
  if p_projections is null or jsonb_typeof(p_projections)<>'array' or jsonb_array_length(p_projections)<>jsonb_array_length(bundle->'scopes') then
    raise exception 'all authorized finance scopes required' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_projections) loop
    view:=item->'view';
    if jsonb_typeof(item)<>'object' or item-array['familyId','childId','view']<>'{}'::jsonb
      or not exists(select 1 from jsonb_array_elements(bundle->'scopes') scope where scope->>'familyId'=item->>'familyId' and scope->>'childId'=item->>'childId')
      or (select count(*) from jsonb_array_elements(p_projections) duplicate where duplicate->>'familyId'=item->>'familyId' and duplicate->>'childId'=item->>'childId')<>1
      or view is null or jsonb_typeof(view)<>'object' or view->>'childId' is distinct from item->>'childId' or not app_private.privacy_parent_projection_safe(view)
      or view-array['childId','childName','timezone','plan','occurrences','goals','savingsRules','payouts','balances','payout','activity','matching']<>'{}'::jsonb
      or not coalesce(jsonb_typeof(view->'activity')='array',false) or not coalesce(jsonb_typeof(view->'goals')='array',false)
      or not coalesce(jsonb_typeof(view->'occurrences')='array',false) or not coalesce(jsonb_typeof(view->'payouts')='array',false)
      or not coalesce(jsonb_typeof(view->'savingsRules')='array',false) or not coalesce(jsonb_typeof(view->'balances')='object',false)
      or not coalesce(jsonb_typeof(view->'payout')='object',false)
      or (view?'matching' and jsonb_typeof(view->'matching')<>'object') then raise exception 'unsafe parent finance projection' using errcode='22023'; end if;
  end loop;
  candidate:=jsonb_set(jsonb_set(j.artifact,'{finance}',p_projections),'{checkins}',app_private.checkin_own_export(j.subject_id));
  if octet_length(candidate::text)>8388608 then
    update app_private.privacy_lifecycle_jobs set status='partial_ready',public_blockers=array['export_capacity_review_required'] where id=j.id;
    return jsonb_build_object('id',j.id,'status','partial_ready','completed',false,'journalIncluded',false);
  end if;
  if (bundle->>'reviewRequired')::boolean then blockers:=array['financial_scope_review_required']; end if;
  final_status:=case when cardinality(blockers)=0 then 'ready' else 'partial_ready' end;
  update app_private.privacy_lifecycle_jobs set artifact=candidate,status=final_status,public_blockers=blockers,
    stages=case when 'own_parent_finance_projections_attached'=any(stages) then stages else array_append(stages,'own_parent_finance_projections_attached') end where id=j.id;
  return jsonb_build_object('id',j.id,'status',final_status,'completed',final_status='ready','journalIncluded',false);
end $$;

-- Keep the mature deletion/child executor intact, but report the actual row after
-- BEFORE triggers rather than its former pre-trigger computed parent status.
alter function api.execute_privacy_job(uuid,uuid) set schema app_private;
alter function app_private.execute_privacy_job(uuid,uuid) rename to privacy_execute_job_core;
revoke all on function app_private.privacy_execute_job_core(uuid,uuid) from public,anon,authenticated,service_role;
create function api.execute_privacy_job(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; j app_private.privacy_lifecycle_jobs; kind text;
begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if found and j.kind='export' and exists(select 1 from app_private.profiles where user_id=j.subject_id and kind='parent')
    and j.status in('approved','partial_ready','ready') then
    j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  end if;
  result:=app_private.privacy_execute_job_core(p_job_id,p_operator_id);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  select p.kind into kind from app_private.profiles p where user_id=j.subject_id;
  return result||jsonb_build_object('status',j.status,'completed',coalesce(j.kind='export' and j.status='ready' and j.artifact_expires_at>clock_timestamp(),false),
    'projectionKind',case when j.kind='export' and j.status='partial_ready' then kind end);
end $$;

alter function api.get_own_export(uuid,boolean) set schema app_private;
alter function app_private.get_own_export(uuid,boolean) rename to privacy_get_own_export_core;
revoke all on function app_private.privacy_get_own_export_core(uuid,boolean) from public,anon,authenticated,service_role;
create function api.get_own_export(p_job_id uuid,p_allow_partial boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.privacy_identity_actor(); j app_private.privacy_lifecycle_jobs;
begin
  perform app_private.privacy_lock_families(u);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id and requester_id=u and subject_id=u and kind='export';
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  if exists(select 1 from app_private.profiles where user_id=u and kind='parent') and jsonb_array_length(coalesce(j.artifact->'finance','[]'))>0 then
    if not app_private.account_usable(u) or exists(select 1 from jsonb_array_elements(j.finance_manifest) scope
      where not app_private.is_guardian((scope->>'familyId')::uuid,u) or not exists(select 1 from app_private.children c
        where c.id::text=scope->>'childId' and c.family_id::text=scope->>'familyId' and c.state<>'closed')) then raise exception 'not authorized' using errcode='42501'; end if;
  end if;
  return app_private.privacy_get_own_export_core(p_job_id,p_allow_partial);
end $$;

-- Already-built parent artifacts cannot retain the earlier incomplete/raw format.
update app_private.privacy_lifecycle_jobs set parent_finance_initialized=false
  where kind='export' and artifact is not null and exists(select 1 from app_private.profiles p where p.user_id=subject_id and p.kind='parent');

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('privacy_parent_bundle','parent_finance_export_job','privacy_parent_lock','privacy_parent_projection_safe'))
    or (n.nspname='api' and p.proname in('privacy_parent_finance_sources','attach_privacy_parent_finance_projections','execute_privacy_job','get_own_export')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to %I',f.signature,case when f.proname='get_own_export' then 'authenticated' else 'service_role' end); end if;
  end loop;
end $$;
