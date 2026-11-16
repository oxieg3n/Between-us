begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_function_privilege('authenticated','api.privacy_parent_finance_sources(uuid,uuid)','EXECUTE'),'parent raw finance sources are service-only');
select ok(not has_function_privilege('authenticated','api.attach_privacy_parent_finance_projections(uuid,uuid,text,jsonb)','EXECUTE'),'clients cannot fabricate parent export views');
select ok(not has_function_privilege('service_role','app_private.privacy_execute_job_core(uuid,uuid)','EXECUTE'),'worker cannot bypass stored-status executor wrapper');
select ok(not has_function_privilege('authenticated','app_private.privacy_get_own_export_core(uuid,boolean)','EXECUTE'),'client cannot bypass current parent scope retrieval checks');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
update app_private.privacy_lifecycle_policy set execution_enabled=true,synthetic_fixture_mode=true,reviewed_policy_id='synthetic-parent-review',reauth_methods=array['managed_password'] where singleton;
create function pg_temp.pf_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.pf_identify(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',p_id,'exp',extract(epoch from now()+interval '1 hour'))::text,true);
end $$;
do $$ begin for i in 1..6 loop perform pg_temp.pf_user(('14000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'parentexport'||i||'@privacy.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like '14000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='14000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) select ('14100000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Finance fixture '||i,'UTC' from generate_series(1,4) i;
insert into app_private.children(id,family_id,name,account_user_id,state) values
 ('14200000-0000-0000-0000-000000000001','14100000-0000-0000-0000-000000000001','First child','14000000-0000-0000-0000-000000000003','active'),
 ('14200000-0000-0000-0000-000000000002','14100000-0000-0000-0000-000000000001','Second child',null,'pending'),
 ('14200000-0000-0000-0000-000000000003','14100000-0000-0000-0000-000000000002','Other current family child',null,'pending'),
 ('14200000-0000-0000-0000-000000000004','14100000-0000-0000-0000-000000000003','UNKNOWN_FAMILY_CHILD',null,'pending'),
 ('14200000-0000-0000-0000-000000000005','14100000-0000-0000-0000-000000000004','FORMER_FAMILY_CHILD',null,'pending');
insert into app_private.memberships(family_id,user_id,role,child_id,status) values
 ('14100000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','guardian',null,'active'),
 ('14100000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000001','guardian',null,'active'),
 ('14100000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000002','guardian',null,'active'),
 ('14100000-0000-0000-0000-000000000004','14000000-0000-0000-0000-000000000006','guardian',null,'revoked'),
 ('14100000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000003','child','14200000-0000-0000-0000-000000000001','active');
insert into app_private.operators(user_id,scope,active) values('14000000-0000-0000-0000-000000000004','privacy',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
 values('14200000-0000-0000-0000-000000000001','14100000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:parent-export','14000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into app_private.finance_aggregates(family_id,state) select f.id,jsonb_build_object('timezone','UTC','children',
  (select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.id) from app_private.children c where c.family_id=f.id),'events','[]'::jsonb) from app_private.families f where f.id::text like '14100000-%';
insert into app_private.safety_reports(reporter_id,reported_user_id,description) values('14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','HIDDEN_CHILD_REPORT');
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by) values('14300000-0000-0000-0000-000000000001','14100000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001');
insert into app_private.checkin_schedules(id,family_id,child_id,creator_id,contact_id,question,weekdays,local_time,timezone)
 values('14300000-0000-0000-0000-000000000002','14100000-0000-0000-0000-000000000001','14200000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','14300000-0000-0000-0000-000000000001','OWN_PARENT_SCHEDULE',array[1],'17:00','UTC');
insert into app_private.checkin_invitations(schedule_id,schedule_revision,family_id,child_id,recipient_id,creator_id,contact_id,question,local_date,due_at,expires_at,disposition)
 values('14300000-0000-0000-0000-000000000002',1,'14100000-0000-0000-0000-000000000001','14200000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','14300000-0000-0000-0000-000000000001','HIDDEN_CHILD_SKIP',current_date,now(),now()+interval '1 day','skipped');

-- Deliberately synthetic server fixtures; not real authentication/VPC evidence.
create function pg_temp.pf_job(p_user uuid) returns uuid language plpgsql as $$
declare r uuid; j uuid;
begin
  insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref) values(p_user,p_user,'managed_password','fixture:parent-step-up') returning id into r;
  insert into app_private.privacy_lifecycle_jobs(requester_id,subject_id,client_id,requested_session,reauth_id,kind,status,review_operator,review_reference)
    values(p_user,p_user,gen_random_uuid(),p_user,r,'export','approved','14000000-0000-0000-0000-000000000004','fixture:independent-approved') returning id into j;
  return j;
end $$;
create function pg_temp.pf_views(p_source jsonb) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('familyId',family->>'familyId','childId',child_id,'view',jsonb_build_object(
   'childId',child_id,'childName','Synthetic projection','timezone','UTC','occurrences','[]'::jsonb,'goals','[]'::jsonb,'savingsRules','[]'::jsonb,
   'payouts','[]'::jsonb,'balances','{}'::jsonb,'payout','{}'::jsonb,'activity','[]'::jsonb,
   'matching',jsonb_build_object('rule',jsonb_build_object('surprise',true),'commitments','[]'::jsonb,'month','2026-11','usedCents',0,'remainingCents',2000,'parentBudgetRemainingCents',2000)))
   order by family->>'familyId',child_id),'[]') from jsonb_array_elements(p_source->'families') family cross join lateral jsonb_array_elements_text(family->'childIds') child_id
$$;
select set_config('test.pf_job',pg_temp.pf_job('14000000-0000-0000-0000-000000000001')::text,true);
set local role service_role;
select is(api.execute_privacy_job(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')->>'status','partial_ready','executor returns actual trigger-modified parent incomplete status');
select is(api.execute_privacy_job(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')->>'projectionKind','parent','service receives explicit parent projector kind');
select is(api.execute_privacy_job(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')->>'completed','false','metadata-only intermediate artifact never claims complete financial export');
select throws_ok($$select api.privacy_parent_finance_sources(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000001')$$,'42501','not authorized','parent cannot self-review financial export');
select set_config('test.pf_source',api.privacy_parent_finance_sources(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')::text,true);
select is(jsonb_array_length(current_setting('test.pf_source')::jsonb->'families'),2,'source includes both current authorized families');
select ok(not(current_setting('test.pf_source') like '%UNKNOWN_FAMILY_CHILD%' or current_setting('test.pf_source') like '%FORMER_FAMILY_CHILD%'),'source contains no unknown/former family financial data');
select is(jsonb_array_length(pg_temp.pf_views(current_setting('test.pf_source')::jsonb)),3,'every eligible child in both current families requires a view');
select set_config('test.pf_views',pg_temp.pf_views(current_setting('test.pf_source')::jsonb)::text,true);
select throws_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',(current_setting('test.pf_views')::jsonb)-0)$$,'22023','all authorized finance scopes required','omitting one scope cannot mark export complete');
select throws_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',jsonb_set(current_setting('test.pf_views')::jsonb,'{0,familyId}','"14100000-0000-0000-0000-000000000003"'))$$,'22023','unsafe parent finance projection','unknown family projection cannot be attached');
select throws_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',jsonb_set(current_setting('test.pf_views')::jsonb,'{1}',current_setting('test.pf_views')::jsonb->0))$$,'22023','unsafe parent finance projection','duplicate scope cannot substitute for another child');
select throws_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',jsonb_set(current_setting('test.pf_views')::jsonb,'{0,view,matching,events}','["RAW_LEDGER"]'))$$,'22023','unsafe parent finance projection','nested raw events cannot masquerade as a parent view');
reset role;
update app_private.finance_aggregates set state=jsonb_set(state,'{timezone}','"America/New_York"') where family_id='14100000-0000-0000-0000-000000000001';
set local role service_role;
select is(api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',current_setting('test.pf_views')::jsonb)->>'status','conflict','stale family state hash rejects whole projection batch');
select set_config('test.pf_source',api.privacy_parent_finance_sources(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')::text,true);
select set_config('test.pf_views',pg_temp.pf_views(current_setting('test.pf_source')::jsonb)::text,true);
select is(api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',jsonb_set(current_setting('test.pf_views')::jsonb,'{0,view,childName}',to_jsonb(repeat('X',8388608))))->>'status','partial_ready','oversize assembled artifact stays explicitly partial instead of silently truncating');
reset role;
select is(jsonb_array_length((select artifact->'finance' from app_private.privacy_lifecycle_jobs where id=current_setting('test.pf_job')::uuid)),0,'capacity failure attaches no truncated finance views');
select ok((select 'export_capacity_review_required'=any(public_blockers) from app_private.privacy_lifecycle_jobs where id=current_setting('test.pf_job')::uuid),'assembled capacity failure records explicit blocker');
set local role service_role;
select is(api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',current_setting('test.pf_views')::jsonb)->>'status','ready','all authorized current scopes attach atomically before ready');
select is(api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',current_setting('test.pf_views')::jsonb)->>'status','ready','exact attach replay is idempotent');
select throws_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash','[]')$$,'22023','idempotency conflict','changed ready replay is rejected');
reset role;
set local role authenticated;
select pg_temp.pf_identify('14000000-0000-0000-0000-000000000001');
select is(api.get_own_export(current_setting('test.pf_job')::uuid)->>'completed','true','authorized parent retrieves actually completed artifact');
select is(jsonb_array_length(api.get_own_export(current_setting('test.pf_job')::uuid)->'data'->'finance'),3,'actual export contains all three parent views');
select ok(api.get_own_export(current_setting('test.pf_job')::uuid)::text like '%matching%','authorized parent matching view is included');
select ok(api.get_own_export(current_setting('test.pf_job')::uuid)::text like '%OWN_PARENT_SCHEDULE%','010 own authored schedule export hook survives');
select ok(not(api.get_own_export(current_setting('test.pf_job')::uuid)::text like '%HIDDEN_CHILD_REPORT%' or api.get_own_export(current_setting('test.pf_job')::uuid)::text like '%HIDDEN_CHILD_SKIP%' or api.get_own_export(current_setting('test.pf_job')::uuid)::text like '%UNKNOWN_FAMILY_CHILD%'),'parent export never receives child report/skip or unknown family');
reset role;
update app_private.memberships set status='revoked' where user_id='14000000-0000-0000-0000-000000000001' and family_id='14100000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select api.get_own_export(current_setting('test.pf_job')::uuid)$$,'42501','not authorized','later guardian revocation denies previously ready financial artifact');
reset role;
set local role service_role;
select is(api.execute_privacy_job(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')->>'status','partial_ready','execution replay revokes stale attached family views rather than returning ready');
select set_config('test.pf_source',api.privacy_parent_finance_sources(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')::text,true);
select is(jsonb_array_length(current_setting('test.pf_source')::jsonb->'families'),1,'former family removed from refreshed source');
select is(api.attach_privacy_parent_finance_projections(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004',current_setting('test.pf_source')::jsonb->>'sourceHash',pg_temp.pf_views(current_setting('test.pf_source')::jsonb))->>'completed','false','former family scope needs independent disposition, not a truncated complete claim');
reset role;
select ok((select 'financial_scope_review_required'=any(public_blockers) from app_private.privacy_lifecycle_jobs where id=current_setting('test.pf_job')::uuid),'review blocker is explicit and generic');
select set_config('test.pf_empty',pg_temp.pf_job('14000000-0000-0000-0000-000000000005')::text,true);
select set_config('test.pf_former',pg_temp.pf_job('14000000-0000-0000-0000-000000000006')::text,true);
select set_config('test.pf_child',pg_temp.pf_job('14000000-0000-0000-0000-000000000003')::text,true);
set local role service_role;
select is(api.execute_privacy_job(current_setting('test.pf_child')::uuid,'14000000-0000-0000-0000-000000000004')->>'projectionKind','child','015 runtime regression: child executor plans qualified profile-kind branch and retains child projector');
select is(api.execute_privacy_job(current_setting('test.pf_empty')::uuid,'14000000-0000-0000-0000-000000000004')->>'status','ready','metadata-only parent with no finance can complete');
select is(api.execute_privacy_job(current_setting('test.pf_former')::uuid,'14000000-0000-0000-0000-000000000004')->>'status','partial_ready','former-only guardian cannot auto-export old household data');
select set_config('test.pf_former_source',api.privacy_parent_finance_sources(current_setting('test.pf_former')::uuid,'14000000-0000-0000-0000-000000000004')::text,true);
select is(jsonb_array_length(current_setting('test.pf_former_source')::jsonb->'families'),0,'former-only source returns no old family body');
reset role;
update app_private.privacy_reauthentication set expires_at=now()-interval '1 second' where user_id='14000000-0000-0000-0000-000000000006';
set local role service_role;
select throws_ok($$select api.privacy_parent_finance_sources(current_setting('test.pf_former')::uuid,'14000000-0000-0000-0000-000000000004')$$,'42501','fresh own-account reauthentication required','expired original proof cannot load parent sources');
reset role;
select set_config('test.pf_capacity',pg_temp.pf_job('14000000-0000-0000-0000-000000000002')::text,true);
update app_private.finance_aggregates set state=jsonb_set(state,'{children,0,name}',to_jsonb(repeat('Y',7340032))) where family_id='14100000-0000-0000-0000-000000000003';
set local role service_role;
select set_config('test.pf_capacity_result',api.execute_privacy_job(current_setting('test.pf_capacity')::uuid,'14000000-0000-0000-0000-000000000004')::text,true);
select is(current_setting('test.pf_capacity_result')::jsonb->>'status','blocked','oversize raw parent source blocks before source transport');
select is(current_setting('test.pf_capacity_result')::jsonb->>'completed','false','blocked capacity execution cannot return pre-trigger complete');
reset role;
delete from auth.sessions where user_id='14000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select api.privacy_parent_finance_sources(current_setting('test.pf_job')::uuid,'14000000-0000-0000-0000-000000000004')$$,'42501','not authorized','removed managed session denies parent raw sources immediately');
reset role;
select ok(not(select public_enrollment_enabled or real_child_data_enabled or public_reports_enabled from app_private.deployment_policy),'financial export does not enable public/real-data gates');
select * from finish();
rollback;
