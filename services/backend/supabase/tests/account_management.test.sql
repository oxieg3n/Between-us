begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
-- A seeded local stack may already have its exact issuer configured; isolate this rollback fixture.
update app_private.account_management_policy set auth_issuer=null where singleton;
select is((select column_default::text from information_schema.columns where table_schema='app_private' and table_name='account_management_policy' and column_name='auth_issuer'),null::text,'issuer column has no automatically trusted default');
select ok(not has_table_privilege('authenticated','app_private.account_management_budgets','SELECT'),'mutation budgets are private');
select ok(not has_function_privilege('authenticated','app_private.account_management_budget(uuid,text,integer)','EXECUTE'),'clients cannot forge budget counters');
select ok(not has_function_privilege('anon','api.get_privacy_context()','EXECUTE'),'privacy context is never anonymous');
select ok(not has_function_privilege('anon','api.list_own_sessions()','EXECUTE'),'sessions are never anonymous');
select ok(not has_function_privilege('anon','api.get_verified_session()','EXECUTE'),'verified JWT projection is never anonymous');
select ok(not has_table_privilege('authenticated','app_private.account_management_policy','UPDATE'),'client cannot configure trusted issuer');
select is((select auth_issuer from app_private.account_management_policy where singleton),null::text,'new verified-session issuer allowlist defaults closed');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.am_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.am_identify(p_user uuid,p_session uuid default null,p_issuer text default 'http://127.0.0.1:54321/auth/v1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'iss',p_issuer,'role','authenticated','session_id',coalesce(p_session,p_user),
    'exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian','staff',true))::text,true);
end $$;
do $$ begin for i in 1..6 loop perform pg_temp.am_user(('11000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'account'||i||'@accounts.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active',display_name='Synthetic account' where user_id::text like '11000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='11000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('11100000-0000-0000-0000-000000000001','Synthetic account family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('11200000-0000-0000-0000-000000000001','11100000-0000-0000-0000-000000000001','Synthetic child','11000000-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('11100000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','guardian',null),
  ('11100000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','child','11200000-0000-0000-0000-000000000001');
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
 values('11200000-0000-0000-0000-000000000001','11100000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture','HIDDEN_CONSENT_EVIDENCE','11000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into auth.sessions(id,user_id,created_at,updated_at,user_agent,ip) values
 ('11000000-0000-0000-0000-000000000101','11000000-0000-0000-0000-000000000003',now(),now(),'HIDDEN_DEVICE_UA','192.0.2.5'),
 ('11000000-0000-0000-0000-000000000102','11000000-0000-0000-0000-000000000001',now(),now(),'HIDDEN_GUARDIAN_UA','192.0.2.6');
insert into app_private.safety_reports(id,reporter_id,reported_user_id,description,status,response) values
 ('11300000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','HIDDEN_CHILD_EVIDENCE','open','Own safe response'),
 ('11300000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','HIDDEN_GUARDIAN_EVIDENCE','open',null);
insert into app_private.privacy_requests(id,requester_id,subject_id,kind,description) values
 ('11300000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','own_export','HIDDEN_PRIVACY_EVIDENCE');
insert into app_private.privacy_lifecycle_jobs(id,requester_id,subject_id,client_id,kind) values
 ('11300000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003',gen_random_uuid(),'export');

set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','verified native session stays closed until issuer reviewed');
reset role;
update app_private.account_management_policy set auth_issuer='http://127.0.0.1:54321/auth/v1' where singleton;
set local role authenticated;
select is(api.get_verified_session()->>'sub','11000000-0000-0000-0000-000000000003','ordinary actor binds verified session subject to managed child UID');
select is(api.get_verified_session()->>'session_id','11000000-0000-0000-0000-000000000003','verified projection binds exact current managed session');
select is(api.get_verified_session()->>'iss','http://127.0.0.1:54321/auth/v1','verified projection preserves configured signed issuer');
select is(api.get_verified_session()->>'role','authenticated','verified projection returns only authenticated role');
select is(jsonb_typeof(api.get_verified_session()->'exp'),'number','verified expiry retains numeric JWT representation');
select is((select count(*)::int from jsonb_object_keys(api.get_verified_session())),5,'verified projection contains only the five JWT subset fields');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003',null,'https://other-project.invalid/auth/v1');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','wrong signed issuer cannot choose vault namespace');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','forged session from another real user rejected');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','forged subject cannot reuse child session');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claims',jsonb_set(auth.jwt(),'{exp}',to_jsonb(extract(epoch from now()-interval '1 hour')) )::text,true);
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','expired JWT cannot obtain verified subset');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claims',jsonb_set(auth.jwt(),'{role}','"guardian"'::jsonb)::text,true);
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','invented JWT domain role never becomes authenticated projection');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select is(api.get_privacy_context(),'{"userId":"11000000-0000-0000-0000-000000000003","kind":"child","state":"active"}'::jsonb,'privacy context is only own identity, no family/role overrides');
select is((select count(*)::int from jsonb_object_keys(api.get_privacy_context())),3,'context has exactly three identity keys');
select is(jsonb_array_length(api.list_own_sessions()),2,'only own live sessions are listed');
select is((select count(*)::int from jsonb_array_elements(api.list_own_sessions()) x where (x->>'current')::boolean),1,'exact current managed session identified');
select ok(not(api.list_own_sessions()::text like '%HIDDEN_%' or api.list_own_sessions()::text like '%192.0.2%' or api.list_own_sessions()::text like '%000000000102%'),'no device UA/IP/other user session leak');
select is((select count(*)::int from jsonb_object_keys(api.list_own_sessions()->0)),4,'session projection contains only id/time/current/generic label');
select is(jsonb_array_length(api.list_own_case_statuses()),3,'own report/privacy/job statuses discoverable');
select ok(api.list_own_case_statuses()::text like '%Own safe response%','own operator response retained');
select ok(not(api.list_own_case_statuses()::text like '%HIDDEN_%' or api.list_own_case_statuses()::text like '%000000000002%'),'case list contains no evidence or guardian report');
select is(jsonb_array_length(api.list_own_consent_statuses()),1,'child sees own consent version metadata');
select ok(not(api.list_own_consent_statuses()::text like '%HIDDEN_%' or api.list_own_consent_statuses()::text like '%verified_by%'),'consent list hides evidence and verifier');
select throws_ok($$select api.create_family('Forged guardian','UTC')$$,'42501','not authorized','forged guardian claim never creates family');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(api.list_own_case_statuses()),1,'guardian sees own report only, not reported child case');
select is(jsonb_array_length(api.list_own_consent_statuses()),1,'current guardian sees bounded consent versions');
select lives_ok($$select api.withdraw_consent('11200000-0000-0000-0000-000000000001')$$,'active guardian can withdraw child consent');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select is(api.get_privacy_context()->>'userId','11000000-0000-0000-0000-000000000003','withdrawn child retains narrow own identity portal');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','ordinary verified-session projection cannot bypass withdrawn child authority');
select is(jsonb_array_length(api.list_own_case_statuses()),3,'withdrawn child retains own historical status list');
select is(api.list_own_consent_statuses()->0->>'status','withdrawn','own withdrawn consent metadata remains accessible');
select throws_ok($$select api.get_context()$$,'42501','not authorized','portal does not restore family context');
select throws_ok($$select api.list_contacts()$$,'42501','not authorized','portal does not restore communication');
select throws_ok($$select api.finance_scope('11100000-0000-0000-0000-000000000001','11200000-0000-0000-0000-000000000001')$$,'42501','not authorized','portal does not restore finance');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(api.list_own_consent_statuses()),0,'unrelated parent gets no child consent metadata');
select is(jsonb_array_length(api.list_own_case_statuses()),0,'unrelated parent gets no case IDs or responses');
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001');
select throws_ok($$select api.get_privacy_context()$$,'42501','not authorized','another users real session cannot authorize privacy portal');
reset role;
insert into app_private.privacy_requests(requester_id,subject_id,kind,description,created_at)
 select '11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000003','own_export','HIDDEN_BOUNDED_EVIDENCE',now()+i*interval '1 second' from generate_series(1,55) i;
insert into auth.sessions(id,user_id,created_at,updated_at)
 select gen_random_uuid(),'11000000-0000-0000-0000-000000000003',now()+i*interval '1 second',now() from generate_series(1,55) i;
set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select is(jsonb_array_length(api.list_own_case_statuses()),50,'case status list is bounded to latest fifty');
select is(jsonb_array_length(api.list_own_sessions()),50,'own session list is bounded to latest fifty');
reset role;
update app_private.profiles set state='closed' where user_id='11000000-0000-0000-0000-000000000005';
set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000005');
select is(api.get_privacy_context()->>'state','closed','closed own profile keeps only reviewed narrow privacy identity');
select throws_ok($$select api.get_context()$$,'42501','not authorized','closed profile gets no ordinary family access');
reset role;
update app_private.profiles set state='suspended' where user_id='11000000-0000-0000-0000-000000000005';
set local role authenticated;
select throws_ok($$select api.get_privacy_context()$$,'42501','not authorized','suspended profile is denied even by narrow identity helper');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select api.list_own_sessions()$$,'42501','not authorized','missing nullable identity claims cannot authorize session metadata');
reset role;
update auth.users set email_confirmed_at=null where id='11000000-0000-0000-0000-000000000006';
set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000006');
select throws_ok($$select api.list_own_sessions()$$,'42501','not authorized','unverified adult cannot list managed sessions');
reset role;
delete from auth.sessions where user_id='11000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000003');
select throws_ok($$select api.get_privacy_context()$$,'42501','not authorized','revoked session immediately loses narrow privacy access');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','revoked session cannot obtain JWT subset');
select throws_ok($$select api.list_own_case_statuses()$$,'42501','not authorized','revoked session cannot discover own case statuses');

-- Administrative resource limits preserve original API signatures and server roles.
select pg_temp.am_identify('11000000-0000-0000-0000-000000000001');
select lives_ok($$select api.create_family('Created one','UTC')$$,'guardian creates first attributed family');
select lives_ok($$select api.create_family('Created two','UTC')$$,'guardian creates second attributed family');
select lives_ok($$select api.create_family('Created three','UTC')$$,'guardian fills fourth active administration slot');
select throws_ok($$select api.create_family('Fifth active admin','UTC')$$,'54000','family administration limit reached','four active administration slots cap creation');
reset role;
select is((select count(*)::int from app_private.families where created_by='11000000-0000-0000-0000-000000000001'),3,'server records actual family creator');
select is((select created_by from app_private.families where id='11100000-0000-0000-0000-000000000001'),null::uuid,'historical creator not inferred from present membership');
update app_private.memberships set status='revoked' where user_id='11000000-0000-0000-0000-000000000001' and family_id<>'11100000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select api.create_family('Created four','UTC')$$,'fourth created family fits when active slots are free');
select throws_ok($$select api.create_family('Created five','UTC')$$,'54000','family administration limit reached','created-family lifetime cap survives revoked admin slots');
select throws_ok($$select api.create_child('ffffffff-ffff-ffff-ffff-ffffffffffff','Forged')$$,'42501','not authorized','cross-family child creation still denied');
select lives_ok($$select api.create_child('11100000-0000-0000-0000-000000000001','Synthetic child '||i) from generate_series(1,11) i$$,'twelve nonclosed children including withdrawn child fit');
select throws_ok($$select api.create_child('11100000-0000-0000-0000-000000000001','Thirteenth')$$,'54000','child capacity reached','pending/suspended children also consume twelve slots');
select set_config('test.am_pending',api.request_child_consent('11200000-0000-0000-0000-000000000001','synthetic-v1','synthetic-v1')::text,true);
select is(api.request_child_consent('11200000-0000-0000-0000-000000000001','synthetic-v1','synthetic-v1')::text,current_setting('test.am_pending'),'same guardian/version pending consent reused instead of unbounded inserts');
select throws_ok($$select api.request_child_consent('11200000-0000-0000-0000-000000000001','forged','synthetic-v1')$$,'42501','notice unavailable','pending reuse does not bypass current approved notice');
reset role;
select is((select used from app_private.account_management_budgets where user_id='11000000-0000-0000-0000-000000000001' and operation='consent'),1,'reused pending consent consumes no extra budget');
update app_private.consents set status='revoked' where id=current_setting('test.am_pending')::uuid;
update app_private.account_management_budgets set used=12 where user_id='11000000-0000-0000-0000-000000000001' and operation='consent';
set local role authenticated;
select throws_ok($$select api.request_child_consent('11200000-0000-0000-0000-000000000001','synthetic-v1','synthetic-v1')$$,'54000','account operation limit reached','new consent requests enforce per-actor hourly budget');
reset role;
update app_private.account_management_budgets set window_at=now()-interval '2 hours' where user_id='11000000-0000-0000-0000-000000000001' and operation='consent';
set local role authenticated;
select lives_ok($$select api.request_child_consent('11200000-0000-0000-0000-000000000001','synthetic-v1','synthetic-v1')$$,'server clock resets expired consent budget');
reset role;
update app_private.children set state='closed' where family_id='11100000-0000-0000-0000-000000000001' and account_user_id is null;
update app_private.account_management_budgets set used=24 where user_id='11000000-0000-0000-0000-000000000001' and operation='child';
set local role authenticated;
select throws_ok($$select api.create_child('11100000-0000-0000-0000-000000000001','Over hourly budget')$$,'54000','account operation limit reached','closed children free capacity but not hourly creation budget');
reset role;
update app_private.account_management_budgets set window_at=now()-interval '2 hours' where user_id='11000000-0000-0000-0000-000000000001' and operation='child';
set local role authenticated;
select lives_ok($$select api.create_child('11100000-0000-0000-0000-000000000001','After server window')$$,'server clock resets child budget without client clock');
reset role;

-- Admission through a different invitation path must share the admin cap.
delete from auth.sessions where user_id='11000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.am_identify('11000000-0000-0000-0000-000000000002');
select throws_ok($$select api.get_verified_session()$$,'42501','not authorized','active consenting adult also loses verified subset immediately after session revocation');
reset role;
insert into app_private.families(id,name,timezone) select ('11400000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Admission fixture '||i,'UTC' from generate_series(1,5) i;
insert into app_private.memberships(family_id,user_id,role) select ('11400000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'11000000-0000-0000-0000-000000000002','guardian' from generate_series(1,4) i;
select throws_ok($$insert into app_private.memberships(family_id,user_id,role) values('11400000-0000-0000-0000-000000000005','11000000-0000-0000-0000-000000000002','guardian')$$,'54000','family administration limit reached','all guardian admission paths enforce cap, not only create_family UI');
select ok(not(select public_enrollment_enabled or real_child_data_enabled or public_reports_enabled from app_private.deployment_policy),'resource caps do not open public gates');
select * from finish();
rollback;
