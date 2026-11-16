begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(has_function_privilege('authenticated','api.can_read_own_invalidation(uuid)','EXECUTE'),'authenticated can call only narrow own boolean');
select ok(not has_function_privilege('anon','api.can_read_own_invalidation(uuid)','EXECUTE'),'anonymous cannot call own boolean');
select ok(not has_schema_privilege('authenticated','app_private','USAGE'),'no private-schema access added for Realtime');
select ok(not has_table_privilege('authenticated','auth.sessions','SELECT'),'no managed session table exposure');
select ok(not has_table_privilege('authenticated','app_private.profiles','SELECT'),'no profile table exposure');
select ok(not has_table_privilege('authenticated','api.user_invalidations','INSERT'),'clients cannot publish invalidation hints');
select ok(not has_table_privilege('authenticated','api.user_invalidations','UPDATE'),'clients cannot mutate invalidation hints');
select ok(not has_table_privilege('authenticated','api.user_invalidations','DELETE'),'clients cannot delete invalidation hints');
select ok(not has_table_privilege('anon','api.user_invalidations','SELECT'),'anonymous has no hint table access');
select ok((select p.pubinsert and not p.pubupdate and not p.pubdelete and not p.pubtruncate and not p.puballtables from pg_publication p where p.pubname='supabase_realtime'),'publication publishes INSERT only, including for hostile wildcard subscribers');
select is((select count(*)::int from pg_publication_tables where pubname='supabase_realtime'),1,'publication contains only the reviewed hint table');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='api' and tablename='user_invalidations'),'reviewed hint table remains published');
select is((select count(*)::int from information_schema.columns where table_schema='api' and table_name='user_invalidations'),2,'hint table still has only opaque row ID and own UID');
select ok((select p.prosecdef and p.provolatile='v' and p.proconfig @> array['search_path=""']::text[] from pg_proc p where p.oid='api.can_read_own_invalidation(uuid)'::regprocedure),'boolean helper pins search path and remains volatile security definer');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.ia_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.ia_identify(p_user uuid,p_session uuid default null,p_exp numeric default null,p_role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role,'session_id',coalesce(p_session,p_user),
    'exp',coalesce(p_exp,extract(epoch from clock_timestamp()+interval '1 hour')),
    'user_metadata',jsonb_build_object('role','guardian','kind','parent','staff',true))::text,true);
end $$;
do $$ begin for i in 1..4 loop perform pg_temp.ia_user(('17000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'invalidation'||i||'@authorization.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like '17000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='17000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('17100000-0000-0000-0000-000000000001','Synthetic invalidation family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('17200000-0000-0000-0000-000000000001','17100000-0000-0000-0000-000000000001','Synthetic child','17000000-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
 ('17100000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','guardian',null),
 ('17100000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000003','child','17200000-0000-0000-0000-000000000001');
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
 values('17200000-0000-0000-0000-000000000001','17100000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:not-real-vpc','17000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into api.user_invalidations(id,user_id) values
 ('17300000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001'),
 ('17300000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000002'),
 ('17300000-0000-0000-0000-000000000003','17000000-0000-0000-0000-000000000003');

set local role authenticated;
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001');
select is((select count(*)::int from api.user_invalidations),1,'active parent sees only own hint rows');
select is((select user_id from api.user_invalidations limit 1),'17000000-0000-0000-0000-000000000001'::uuid,'row ownership comes from managed UID');
select ok(api.can_read_own_invalidation('17000000-0000-0000-0000-000000000001'),'own boolean succeeds for current usable managed session');
select ok(not api.can_read_own_invalidation('17000000-0000-0000-0000-000000000002'),'boolean cannot probe another existing user');
select ok(not api.can_read_own_invalidation('ffffffff-ffff-ffff-ffff-ffffffffffff'),'unknown user returns same false as other user');
select ok(not api.can_read_own_invalidation(null),'nullable target never authorizes');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000003');
select is((select count(*)::int from api.user_invalidations),1,'verified child sees own hints while current consent remains usable');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000002');
select is((select count(*)::int from api.user_invalidations),0,'forged session from another actual user yields no hints');
select ok(not api.can_read_own_invalidation('17000000-0000-0000-0000-000000000001'),'forged managed-session binding returns false, not internal exception');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001',null,extract(epoch from clock_timestamp()-interval '1 second'));
select is((select count(*)::int from api.user_invalidations),0,'expired JWT cannot retain hint reads');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001',null,null,'service_role');
select is((select count(*)::int from api.user_invalidations),0,'forged JWT role metadata cannot downgrade role requirement');
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::int from api.user_invalidations),0,'missing identity claims fail closed through RLS without throwing');
select set_config('request.jwt.claims','{"sub":"malformed","role":"authenticated","session_id":"malformed","exp":"malformed"}',true);
select is((select count(*)::int from api.user_invalidations),0,'malformed claims fail closed without breaking the authorization query');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001');
select is((select count(*)::int from api.user_invalidations),1,'restoring valid claims restores only own hints');
reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='17000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from api.user_invalidations),0,'managed account ban suppresses hints immediately');
reset role;
update auth.users set banned_until=null where id='17000000-0000-0000-0000-000000000001';
update app_private.profiles set state='onboarding' where user_id='17000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from api.user_invalidations),0,'actor onboarding allowance is insufficient for hints');
reset role;
update app_private.profiles set state='active' where user_id='17000000-0000-0000-0000-000000000001';
update auth.sessions set not_after=now()-interval '1 second' where id='17000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from api.user_invalidations),0,'expired managed session suppresses hints even with unexpired JWT');
reset role;
delete from auth.sessions where id='17000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from api.user_invalidations),0,'removed session cannot retain opaque own hints');
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at) values('17000000-0000-0000-0000-000000000101','17000000-0000-0000-0000-000000000001',now(),now());
set local role authenticated;
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000101');
select is((select count(*)::int from api.user_invalidations),1,'new valid managed session restores own hints without a role toggle');
select lives_ok($$select api.withdraw_consent('17200000-0000-0000-0000-000000000001')$$,'current guardian withdraws child consent');
select pg_temp.ia_identify('17000000-0000-0000-0000-000000000003');
select is((select count(*)::int from api.user_invalidations),0,'withdrawn child cannot retain hint access through stale subscription claims');
select ok(not api.can_read_own_invalidation('17000000-0000-0000-0000-000000000003'),'historical privacy identity does not restore invalidation authorization');
select is(api.get_privacy_context()->>'userId','17000000-0000-0000-0000-000000000003','withdrawn child retains separate own privacy portal');
reset role;
update app_private.consents set status='verified',withdrawn_at=null where child_id='17200000-0000-0000-0000-000000000001';
update app_private.children set state='active' where id='17200000-0000-0000-0000-000000000001';
update app_private.memberships set status='active' where child_id='17200000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*)::int from api.user_invalidations),1,'restored server consent/membership restores only own hint authorization');
reset role;
set local role anon;
select throws_ok($$select count(*) from api.user_invalidations$$,'42501',null,'anonymous cannot query hints regardless of forged claims');
select throws_ok($$select api.can_read_own_invalidation('17000000-0000-0000-0000-000000000003')$$,'42501',null,'anonymous cannot call the helper even with saved authenticated JWT claims');
reset role;
select ok(not(select public_enrollment_enabled or real_child_data_enabled or public_reports_enabled from app_private.deployment_policy),'hint authorization does not open public policy gates');
select * from finish();
rollback;
