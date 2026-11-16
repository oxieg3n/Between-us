begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();

-- Cover new schema objects too; per-function happy-path tests cannot detect an accidental new grant.
select ok(exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relkind in('r','p')), 'private-table catalog positive control');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relkind in('r','p') and not c.relrowsecurity), 'every private table enables RLS');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relkind in('r','p') and
    (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))), 'no direct client grants on any private table');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('app_private','api') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""']::text[],false)),
  'all application SECURITY DEFINER functions pin an empty search_path');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname in('app_private','api') and a.grantee=0 and a.privilege_type='EXECUTE'), 'no application function inherits public execution');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.qs_identify(p_number int,p_exp numeric default null) returns void language plpgsql as $$
declare u uuid:=('a6100000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',u,'role','authenticated',
  'exp',coalesce(p_exp,extract(epoch from clock_timestamp()+interval '1 hour')),
  'user_metadata',jsonb_build_object('role','guardian','operator',true))::text,true); end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..5 loop
    u:=('a6100000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    token:=app_private.issue_parent_registration('qualification'||i||'@fixture.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'qualification'||i||'@fixture.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like 'a6100000-%';
insert into app_private.families(id,name,timezone) values
 ('a6200000-0000-0000-0000-000000000001','Fictional reporter family','UTC'),
 ('a6200000-0000-0000-0000-000000000002','Fictional reported family','UTC');
insert into app_private.memberships(family_id,user_id,role) values
 ('a6200000-0000-0000-0000-000000000001','a6100000-0000-0000-0000-000000000001','guardian'),
 ('a6200000-0000-0000-0000-000000000002','a6100000-0000-0000-0000-000000000002','guardian');
insert into app_private.operators(user_id,scope,active) values('a6100000-0000-0000-0000-000000000003','safety',true);
insert into app_private.safety_reports(id,reporter_id,reported_user_id,description,assigned_operator) values
 ('a6300000-0000-0000-0000-000000000001','a6100000-0000-0000-0000-000000000001',
 'a6100000-0000-0000-0000-000000000002','Fictional dynamic independence drill','a6100000-0000-0000-0000-000000000003');
set local role authenticated;
select pg_temp.qs_identify(3);
select is(api.get_report('a6300000-0000-0000-0000-000000000001')->>'description','Fictional dynamic independence drill','assigned independent reader positive control');
reset role;
insert into app_private.memberships(family_id,user_id,role) values
 ('a6200000-0000-0000-0000-000000000002','a6100000-0000-0000-0000-000000000003','guardian');
set local role authenticated;
select throws_ok($$select api.get_report('a6300000-0000-0000-0000-000000000001')$$,'42501',null,'existing assignment loses read when operator joins reported family');
select throws_ok($$select api.update_report('a6300000-0000-0000-0000-000000000001','closed','')$$,'42501',null,'existing assignment loses update when operator joins reported family');
reset role;
update app_private.memberships set status='revoked' where user_id='a6100000-0000-0000-0000-000000000003';
set local role authenticated;
select lives_ok($$select api.get_report('a6300000-0000-0000-0000-000000000001')$$,'revoked guardian membership no longer constitutes current case conflict');
reset role;
insert into app_private.memberships(family_id,user_id,role) values
 ('a6200000-0000-0000-0000-000000000001','a6100000-0000-0000-0000-000000000003','guardian');
set local role authenticated;
select throws_ok($$select api.get_report('a6300000-0000-0000-0000-000000000001')$$,'42501',null,'operator joining reporter family also loses read');
select throws_ok($$select api.update_report('a6300000-0000-0000-0000-000000000001','closed','')$$,'42501',null,'operator joining reporter family also loses update');
select pg_temp.qs_identify(4);
select throws_ok($$select api.get_report('a6300000-0000-0000-0000-000000000001')$$,'42501',null,'forged staff metadata cannot read assigned case');

-- Existing Journal tests protect this time boundary only for the lease endpoint.
select pg_temp.qs_identify(1,extract(epoch from clock_timestamp())+0.2);
select lives_ok($$select api.get_context()$$,'pre-expiry actor positive control');
select pg_sleep(0.25);
select throws_ok($$select api.get_context()$$,'42501',null,'ordinary actor rejects JWT expiring inside an older transaction');
reset role;
select pg_temp.qs_identify(1);
update auth.sessions set not_after=clock_timestamp()+interval '0.2 seconds' where id='a6100000-0000-0000-0000-000000000001';
select pg_sleep(0.25);
set local role authenticated;
select throws_ok($$select api.get_context()$$,'42501',null,'ordinary actor rejects managed session deadline inside an older transaction');
reset role;
update app_private.profiles set kind='child',auth_alias=true where user_id='a6100000-0000-0000-0000-000000000004';
insert into app_private.children(id,family_id,name,account_user_id,state) values
 ('a6400000-0000-0000-0000-000000000001','a6200000-0000-0000-0000-000000000001',
 'Fictional expiry child','a6100000-0000-0000-0000-000000000004','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
 ('a6200000-0000-0000-0000-000000000001','a6100000-0000-0000-0000-000000000004','child','a6400000-0000-0000-0000-000000000001');
insert into app_private.operators(user_id,scope,active) values('a6100000-0000-0000-0000-000000000005','consent',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,
 method,evidence_reference,verified_by,verified_at,expires_at) values
 ('a6400000-0000-0000-0000-000000000001','a6200000-0000-0000-0000-000000000001',
 'a6100000-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture',
 'fixture:expiry-not-real-consent','a6100000-0000-0000-0000-000000000005',clock_timestamp(),clock_timestamp()+interval '0.2 seconds');
select pg_temp.qs_identify(4);
set local role authenticated;
select is(api.get_context()->'user'->>'kind','child','currently consenting child positive control');
select pg_sleep(0.25);
select throws_ok($$select api.get_context()$$,'42501',null,'consent expiring within an older transaction revokes ordinary child authority');
reset role;
select pg_temp.qs_identify(2);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{exp}','"NaN"'::jsonb)::text,true);
set local role authenticated;
select throws_ok($$select api.get_context()$$,'42501',null,'ordinary actor rejects nonfinite string NumericDate');
select throws_ok($$select api.list_own_sessions()$$,'42501',null,'own-privacy actor rejects nonfinite string NumericDate');
reset role;
select pg_temp.qs_identify(2);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{exp}','"Infinity"'::jsonb)::text,true);
set local role authenticated;
select throws_ok($$select api.get_context()$$,'42501',null,'ordinary actor rejects infinite string NumericDate');
select throws_ok($$select api.list_own_sessions()$$,'42501',null,'own-privacy actor rejects infinite string NumericDate');
reset role;
select pg_temp.qs_identify(1);
update auth.sessions set not_after=null where id='a6100000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('test.qualification_scope',api.finance_scope('a6200000-0000-0000-0000-000000000001','a6400000-0000-0000-0000-000000000001')::text,true);
reset role;
select is(app_private.finance_authorize(current_setting('test.qualification_scope')::jsonb),'parent','valid trusted finance scope positive control');
select throws_ok($$select app_private.finance_authorize(jsonb_set(current_setting('test.qualification_scope')::jsonb,'{expiresAt}','"NaN"'::jsonb))$$,'42501',null,'trusted finance scope rejects NaN string');
select throws_ok($$select app_private.finance_authorize(jsonb_set(current_setting('test.qualification_scope')::jsonb,'{expiresAt}','"Infinity"'::jsonb))$$,'42501',null,'trusted finance scope rejects infinite string');
select throws_ok($$select app_private.finance_authorize(jsonb_set(current_setting('test.qualification_scope')::jsonb,'{expiresAt}',to_jsonb((extract(epoch from clock_timestamp()+interval '1 hour'))::text)))$$,'42501',null,'trusted finance scope requires JSON numeric expiry rather than a coercible string');
select * from finish();
rollback;
