begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not(select execution_enabled or retention_enabled or synthetic_fixture_mode from app_private.privacy_lifecycle_policy),'privacy execution and fixtures default closed');
select is((select cardinality(reauth_methods) from app_private.privacy_lifecycle_policy),0,'no unreviewed strong-auth method enabled');
select ok(not has_function_privilege('authenticated','api.record_privacy_reauthentication(uuid,uuid,text,text)','EXECUTE'),'client cannot attest its own reauthentication');
select ok(not has_function_privilege('authenticated','api.execute_privacy_job(uuid,uuid)','EXECUTE'),'client cannot execute deletion/export worker');
select ok(not has_function_privilege('authenticated','api.privacy_finance_sources(uuid,uuid)','EXECUTE'),'child cannot load raw finance source through privacy API');
select ok(not has_table_privilege('authenticated','app_private.privacy_lifecycle_jobs','SELECT'),'raw artifact/review table remains private');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.privacy_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.privacy_identify(p_id uuid,p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',coalesce(p_session,p_id),
    'exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian','reauthenticated',true))::text,true);
end $$;
do $$ declare i int; begin
  for i in 1..5 loop perform pg_temp.privacy_user(('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'privacy'||i::text||'@privacy.test'); end loop;
end $$;
update app_private.profiles set kind='parent',state='active',display_name='Synthetic adult' where user_id::text like '30000000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Synthetic child' where user_id='30000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('31000000-0000-0000-0000-000000000001','Synthetic privacy family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('32000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Synthetic child','30000000-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','guardian',null),
  ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','guardian',null),
  ('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','child','32000000-0000-0000-0000-000000000001');
insert into app_private.operators(user_id,scope,active) values
  ('30000000-0000-0000-0000-000000000004','privacy',true),('30000000-0000-0000-0000-000000000004','safety',true),
  ('30000000-0000-0000-0000-000000000004','verification',true),('30000000-0000-0000-0000-000000000001','privacy',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values('32000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','verified',
    'synthetic-v1','synthetic-v1','synthetic_fixture','fixture:consent','30000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by,verified_by,verified_at,verified_until)
  values('33000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',now(),now(),'30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into app_private.conversations(id,contact_id) values('33000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000001');
insert into app_private.messages(id,conversation_id,sender_id,recipient_id,client_id,body,response,created_at,acknowledged_at) values
  ('34000000-0000-0000-0000-000000000001','33000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',gen_random_uuid(),'VISIBLE_CHILD_RECEIVED','listen',now()-interval '120 days',now()-interval '119 days'),
  ('34000000-0000-0000-0000-000000000002','33000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003',gen_random_uuid(),'HIDDEN_UNDELIVERED','listen',now()-interval '120 days',null),
  ('34000000-0000-0000-0000-000000000003','33000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',gen_random_uuid(),'OWN_UNDELIVERED','reply',now()-interval '120 days',null);
insert into app_private.safety_reports(id,reporter_id,reported_user_id,description,message_id,selected_message_body,status,created_at,updated_at)
  values('36000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','SENSITIVE_CHILD_REPORT',
    '34000000-0000-0000-0000-000000000001','VISIBLE_CHILD_RECEIVED','open',now()-interval '120 days',now()-interval '120 days');
insert into app_private.privacy_requests(id,requester_id,subject_id,kind,description) values
  ('36000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','own_export','OWN_CHILD_PRIVACY_REQUEST'),
  ('36000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','parental_review','Fictional disputed parental request');
insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash) values
  ('37000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','android',
    'fixture-privacy-device-token-0001',sha256(convert_to('fixture-privacy-device-token-0001','UTF8')));
insert into app_private.notification_preferences(user_id,enabled) values('30000000-0000-0000-0000-000000000003',true);
insert into app_private.finance_aggregates(family_id,state) values('31000000-0000-0000-0000-000000000001',
  jsonb_build_object('timezone','UTC','children',jsonb_build_array(jsonb_build_object('id','32000000-0000-0000-0000-000000000001','name','Synthetic child')),
    'events',jsonb_build_array(jsonb_build_object('id','PARENT_HIDDEN_EVENT','childId','32000000-0000-0000-0000-000000000001','kind','configure_matching','rule',jsonb_build_object('surprise',true)))));

set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000001');
select lives_ok($$select api.withdraw_consent('32000000-0000-0000-0000-000000000001')$$,'withdraw consent before checking historical own access');
select throws_ok($$select api.get_own_case_status('report','36000000-0000-0000-0000-000000000001')$$,'42501','not authorized','guardian cannot view child report through privacy identity path');
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_context()$$,'42501','not authorized','withdrawn child still fails ordinary actor');
select throws_ok($$select api.fetch_messages('33000000-0000-0000-0000-000000000002')$$,'42501','not authorized','privacy identity does not restore messaging');
select throws_ok($$select api.finance_scope('31000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001')$$,'42501','not authorized','privacy identity does not restore finance');
select is(api.get_own_case_status('report','36000000-0000-0000-0000-000000000001')->>'status','open','withdrawn child can check own historical report status');
select is(api.get_own_case_status('privacy','36000000-0000-0000-0000-000000000002')->>'status','review_pending','withdrawn child can check own historical privacy request');
select throws_ok($$select api.get_own_case_status('privacy','ffffffff-ffff-ffff-ffff-ffffffffffff')$$,'42501','not authorized','unknown nullable case cannot bypass denial');
select throws_ok($$select api.request_own_export('35000000-0000-0000-0000-000000000001')$$,'42501','fresh own-account reauthentication required','forged reauth metadata cannot replace strong reauthentication');
reset role;
set local role service_role;
select throws_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','managed_password','fixture:managed-event')$$,'42501','privacy workflow unavailable','service cannot bypass closed privacy execution policy');
reset role;
update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,reviewed_policy_id='synthetic-reviewed-v1' where singleton;
set local role service_role;
select throws_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','managed_password','fixture:managed-event')$$,'42501','reviewed reauthentication method required','managed-password method requires explicit policy review');
reset role;
update app_private.privacy_lifecycle_policy set reauth_methods=array['managed_password','managed_password_totp'] where singleton;
set local role service_role;
select throws_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','managed_password','fixture:wrong-session')$$,'42501','not authorized','reauthentication is bound to correct managed session and user');
select lives_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','managed_password','fixture:managed-auth-step-up')$$,'trusted service records managed-Auth step-up after withdrawal');
select lives_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','managed_password_totp','fixture:managed-auth-mfa')$$,'trusted service can record reviewed MFA method');
reset role;
set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select set_config('test.privacy_child_export',api.request_own_export('35000000-0000-0000-0000-000000000001')->>'id',true);
select is(api.request_own_export('35000000-0000-0000-0000-000000000001')->>'id',current_setting('test.privacy_child_export'),'own export request has sender-bound idempotency');
select is(api.get_own_privacy_job(current_setting('test.privacy_child_export')::uuid)->>'exportComplete','false','request is never reported as executed export');
select throws_ok($$select api.get_own_export(current_setting('test.privacy_child_export')::uuid)$$,'42501','export not ready','unexecuted job cannot be downloaded or silently expired');
select throws_ok($$select api.request_own_deletion('35000000-0000-0000-0000-000000000001')$$,'22023','idempotency conflict','changed replay kind is rejected');
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000001');
select set_config('test.privacy_parent_export',api.request_own_export('35000000-0000-0000-0000-000000000003')->>'id',true);
select throws_ok($$select api.get_own_privacy_job(current_setting('test.privacy_child_export')::uuid)$$,'42501','not authorized','guardian cannot inspect child own-data job');
reset role;
set local role service_role;
select throws_ok($$select api.review_privacy_job(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000001','approve','fixture:self')$$,'42501','independent privacy operator required','guardian with privacy scope cannot review child own-data job');
select lives_ok($$select api.review_privacy_job(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004','approve','fixture:independent-review')$$,'independent review approves bounded own export');
select is(api.execute_privacy_job(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004')->>'status','partial_ready','child core export is executed while finance projection explicitly pending');
select lives_ok($$select api.review_privacy_job(current_setting('test.privacy_parent_export')::uuid,'30000000-0000-0000-0000-000000000004','approve','fixture:parent-own')$$,'parent own export also reviewed independently');
select is(api.execute_privacy_job(current_setting('test.privacy_parent_export')::uuid,'30000000-0000-0000-0000-000000000004')->>'status','partial_ready','parent core export remains partial until authorized finance projection is attached');
select set_config('test.privacy_parental_job',api.queue_parental_privacy_review('36000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004','fixture:legal-review')->>'id',true);
select throws_ok($$select api.execute_privacy_job(current_setting('test.privacy_parental_job')::uuid,'30000000-0000-0000-0000-000000000004')$$,'42501','own-data execution unavailable','disputed parental request cannot execute child export/deletion');
select set_config('test.privacy_finance_source',api.privacy_finance_sources(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004')::text,true);
reset role;
set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000001');
select ok(not(api.get_own_export(current_setting('test.privacy_parent_export')::uuid,true)::text like '%SENSITIVE_CHILD_REPORT%'),'alleged guardian partial export never includes child confidential report');
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_own_export(current_setting('test.privacy_child_export')::uuid)$$,'42501','export not ready','partial export is not labeled complete');
select ok(api.get_own_export(current_setting('test.privacy_child_export')::uuid,true)::text like '%VISIBLE_CHILD_RECEIVED%','explicit partial export contains own acknowledged history');
select ok(api.get_own_export(current_setting('test.privacy_child_export')::uuid,true)::text like '%OWN_UNDELIVERED%','own unsent-to-recipient saved message remains own exported data');
select ok(not(api.get_own_export(current_setting('test.privacy_child_export')::uuid,true)::text like '%HIDDEN_UNDELIVERED%'),'withdrawn child export excludes unacknowledged received body');
select ok(not(api.get_own_export(current_setting('test.privacy_child_export')::uuid,true)::text like '%PARENT_HIDDEN_EVENT%'),'child core export contains no raw hidden parent event');
select is(api.get_own_export(current_setting('test.privacy_child_export')::uuid,true)->>'journalIncluded','false','server export contains no local journal');
reset role;
select set_config('test.privacy_projection',jsonb_build_object('childId','32000000-0000-0000-0000-000000000001','childName','Synthetic child','timezone','UTC',
  'occurrences','[]'::jsonb,'goals','[]'::jsonb,'savingsRules','[]'::jsonb,'payouts','[]'::jsonb,'balances','{}'::jsonb,'payout','{}'::jsonb,'activity','[]'::jsonb)::text,true);
set local role service_role;
select is(api.attach_privacy_finance_projection(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004',repeat('0',64),current_setting('test.privacy_projection')::jsonb)->>'status','conflict','stale finance snapshot cannot be attached');
select throws_ok($$select api.attach_privacy_finance_projection(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004',current_setting('test.privacy_finance_source')::jsonb->>'sourceHash',current_setting('test.privacy_projection')::jsonb||'{"matching":{"parentBudgetCents":9999}}')$$,'22023','unsafe child finance projection','raw matching metadata rejected even from service projection');
select throws_ok($$select api.attach_privacy_finance_projection(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004',current_setting('test.privacy_finance_source')::jsonb->>'sourceHash',current_setting('test.privacy_projection')::jsonb||'{"activity":[{"id":"PARENT_HIDDEN_EVENT"}]}')$$,'22023','unsafe child finance projection','hidden parent event IDs cannot enter visible child activity');
select is(api.attach_privacy_finance_projection(current_setting('test.privacy_child_export')::uuid,'30000000-0000-0000-0000-000000000004',current_setting('test.privacy_finance_source')::jsonb->>'sourceHash',current_setting('test.privacy_projection')::jsonb)->>'status','ready','safe own-child projection completes explicit export stages');
reset role;
set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select is(api.get_own_export(current_setting('test.privacy_child_export')::uuid)->>'completed','true','ready means generated artifact actually exists');
select ok(not(api.get_own_export(current_setting('test.privacy_child_export')::uuid)::text ~ 'PARENT_HIDDEN_EVENT|sourceHash|revision|SENSITIVE_OTHER_REPORT'),'completed child export has no hidden finance metadata');
reset role;
update app_private.privacy_lifecycle_jobs set artifact_expires_at=clock_timestamp()-interval '1 second' where id=current_setting('test.privacy_child_export')::uuid;
set local role authenticated;
select is(api.get_own_export(current_setting('test.privacy_child_export')::uuid)->>'status','expired','expired export does not return artifact');
reset role;
select ok((select artifact is null from app_private.privacy_lifecycle_jobs where id=current_setting('test.privacy_child_export')::uuid),'expired artifact bytes are actually erased');
update app_private.privacy_reauthentication set expires_at=clock_timestamp()-interval '1 second' where user_id='30000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select api.request_own_deletion('35000000-0000-0000-0000-000000000002')$$,'42501','fresh own-account reauthentication required','expired step-up cannot authorize deletion');
reset role;
set local role service_role;
select lives_ok($$select api.record_privacy_reauthentication('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','synthetic_fixture','fixture:reauth-deletion')$$,'local-only synthetic reauthentication remains explicit');
select set_config('test.privacy_message_hold',api.set_privacy_hold('30000000-0000-0000-0000-000000000003','messages','fixture:finite-message-hold',clock_timestamp()+interval '1 day','30000000-0000-0000-0000-000000000004')::text,true);
select set_config('test.privacy_report_hold',api.set_privacy_hold('30000000-0000-0000-0000-000000000003','reports','fixture:finite-case-hold',clock_timestamp()+interval '1 day','30000000-0000-0000-0000-000000000004')::text,true);
reset role;
set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select set_config('test.privacy_child_delete',api.request_own_deletion('35000000-0000-0000-0000-000000000002')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.privacy_child_delete')::uuid,'30000000-0000-0000-0000-000000000004','approve','fixture:deletion-review')$$,'own deletion requires independent review');
select is(api.execute_privacy_job(current_setting('test.privacy_child_delete')::uuid,'30000000-0000-0000-0000-000000000004')->>'status','access_revoked','deletion executes access revocation without claiming full purge');
reset role;
select is((select count(*)::int from auth.sessions where user_id='30000000-0000-0000-0000-000000000003'),0,'managed sessions actually revoked');
select is((select count(*)::int from app_private.device_tokens where user_id='30000000-0000-0000-0000-000000000003'),0,'provider device token bytes actually erased');
select is((select count(*)::int from app_private.notification_preferences where user_id='30000000-0000-0000-0000-000000000003'),0,'notification preferences actually erased');
select is((select state from app_private.profiles where user_id='30000000-0000-0000-0000-000000000003'),'closed','account actually closed');
select is((select body from app_private.messages where id='34000000-0000-0000-0000-000000000003'),'OWN_UNDELIVERED','finite legal hold preserves evidence without preserving access');
select is((select kind from app_private.profiles where user_id='30000000-0000-0000-0000-000000000003'),'child','deletion never promotes child identity');
set local role authenticated;
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_own_case_status('report','36000000-0000-0000-0000-000000000001')$$,'42501','not authorized','revoked session denies even narrow historical path');
select pg_temp.privacy_identify('30000000-0000-0000-0000-000000000001');
select set_config('test.privacy_parent_delete',api.request_own_deletion('35000000-0000-0000-0000-000000000004')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.privacy_parent_delete')::uuid,'30000000-0000-0000-0000-000000000004','approve','fixture:parent-deletion')$$,'reported adult own deletion is independently reviewed');
select is(api.execute_privacy_job(current_setting('test.privacy_parent_delete')::uuid,'30000000-0000-0000-0000-000000000004')->>'deletionComplete','false','reported adult cannot turn own deletion into case erasure');
reset role;
select is((select public_blockers from app_private.privacy_lifecycle_jobs where id=current_setting('test.privacy_parent_delete')::uuid),
  (select public_blockers from app_private.privacy_lifecycle_jobs where id=current_setting('test.privacy_child_delete')::uuid),'deletion blockers do not reveal whether another person reported the subject');
select is((select description from app_private.safety_reports where id='36000000-0000-0000-0000-000000000001'),'SENSITIVE_CHILD_REPORT','unsafe guardian deletion preserves restricted report');
update app_private.safety_reports set status='closed',updated_at=clock_timestamp()-interval '120 days' where id='36000000-0000-0000-0000-000000000001';
set local role service_role;
select is(api.run_privacy_retention('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004')->>'status','executed','reviewed bounded retention job executes');
reset role;
select is((select count(*)::int from app_private.messages where id::text like '34000000-%'),3,'message holds stop age-based deletion');
select is((select count(*)::int from app_private.safety_reports where id='36000000-0000-0000-0000-000000000001'),1,'case hold stops retention erasure');
set local role service_role;
select lives_ok($$select api.release_privacy_hold(current_setting('test.privacy_message_hold')::uuid,'30000000-0000-0000-0000-000000000004')$$,'independent reviewer releases finite message hold');
select lives_ok($$select api.release_privacy_hold(current_setting('test.privacy_report_hold')::uuid,'30000000-0000-0000-0000-000000000004')$$,'independent reviewer releases finite case hold');
select is(api.run_privacy_retention('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004')->'deletedCounts'->>'expiredMessages','3','retention actually deletes old unheld message bytes after case release');
reset role;
select is((select count(*)::int from app_private.safety_reports where id='36000000-0000-0000-0000-000000000001'),0,'expired closed own report actually erased after hold release');
select ok(exists(select 1 from app_private.finance_aggregates where family_id='31000000-0000-0000-0000-000000000001'),'retention does not silently rewrite immutable shared ledger');
select ok(not (select public_enrollment_enabled or real_child_data_enabled from app_private.deployment_policy),'no privacy workflow enables public or real-child collection');
select * from finish();
rollback;
