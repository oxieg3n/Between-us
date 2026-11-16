-- Owner runs after migration021. Fictional context projections only; entire fixture rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
update app_private.deployment_policy set local_synthetic=true,notice_version='child-context-v1',consent_policy_version='child-context-v1' where singleton;
create function pg_temp.child_context_id(p_group int,p_number int) returns uuid language sql immutable as $$
  select ('b'||p_group::text||'210000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
$$;
create function pg_temp.child_context_identify(p_number int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.child_context_id(1,p_number),'session_id',pg_temp.child_context_id(1,p_number),
  'role','authenticated','exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian','kind','parent'))::text,true);end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..9 loop
    u:=pg_temp.child_context_id(1,i);token:=app_private.issue_parent_registration('childcontext'||i::text||'@fixture.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'childcontext'||i::text||'@fixture.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
update app_private.profiles set kind='parent',state='active',display_name='Fictional parent' where user_id::text like 'b1210000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Fictional child' where user_id in(pg_temp.child_context_id(1,3),pg_temp.child_context_id(1,4),pg_temp.child_context_id(1,5),pg_temp.child_context_id(1,6),pg_temp.child_context_id(1,8));
insert into app_private.families(id,name,timezone) values(pg_temp.child_context_id(2,1),'Fictional eligibility family','UTC'),(pg_temp.child_context_id(2,2),'Fictional outside family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values
  (pg_temp.child_context_id(3,1),pg_temp.child_context_id(2,1),'Pending first',null,'pending'),
  (pg_temp.child_context_id(3,2),pg_temp.child_context_id(2,1),'Ready Alex',pg_temp.child_context_id(1,3),'active'),
  (pg_temp.child_context_id(3,3),pg_temp.child_context_id(2,1),'Missing account',null,'active'),
  (pg_temp.child_context_id(3,4),pg_temp.child_context_id(2,1),'Missing membership',pg_temp.child_context_id(1,5),'active'),
  (pg_temp.child_context_id(3,5),pg_temp.child_context_id(2,1),'Withdrawn consent',pg_temp.child_context_id(1,6),'active'),
  (pg_temp.child_context_id(3,6),pg_temp.child_context_id(2,1),'Pending linked identity',pg_temp.child_context_id(1,4),'pending'),
  (pg_temp.child_context_id(3,7),pg_temp.child_context_id(2,1),'Invalid parent linkage',pg_temp.child_context_id(1,2),'active'),
  (pg_temp.child_context_id(3,8),pg_temp.child_context_id(2,2),'Outside child',pg_temp.child_context_id(1,8),'active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  (pg_temp.child_context_id(2,1),pg_temp.child_context_id(1,1),'guardian',null),
  (pg_temp.child_context_id(2,1),pg_temp.child_context_id(1,2),'guardian',null),
  (pg_temp.child_context_id(2,1),pg_temp.child_context_id(1,3),'child',pg_temp.child_context_id(3,2)),
  (pg_temp.child_context_id(2,1),pg_temp.child_context_id(1,6),'child',pg_temp.child_context_id(3,5)),
  (pg_temp.child_context_id(2,1),pg_temp.child_context_id(1,4),'child',pg_temp.child_context_id(3,6)),
  (pg_temp.child_context_id(2,2),pg_temp.child_context_id(1,9),'guardian',null),
  (pg_temp.child_context_id(2,2),pg_temp.child_context_id(1,8),'child',pg_temp.child_context_id(3,8));
insert into app_private.operators(user_id,scope,active) values(pg_temp.child_context_id(1,7),'consent',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at,withdrawn_at)
  select pg_temp.child_context_id(3,i),case when i=8 then pg_temp.child_context_id(2,2) else pg_temp.child_context_id(2,1) end,
    case when i=8 then pg_temp.child_context_id(1,9) else pg_temp.child_context_id(1,1) end,
    case when i=5 then 'withdrawn' else 'verified' end,'child-context-v1','child-context-v1','synthetic_fixture','fixture:child-context-consent',pg_temp.child_context_id(1,7),now(),now()+interval '1 day',
    case when i=5 then now() else null end from unnest(array[2,3,4,5,6,8]) i;

select ok(has_function_privilege('authenticated','api.get_context()','EXECUTE'),'existing context remains authenticated');
select ok(not has_function_privilege('anon','api.get_context()','EXECUTE'),'new hints do not expose anonymous context');
select ok(not has_table_privilege('authenticated','app_private.children','SELECT'),'raw child access is unchanged');
set local role authenticated;
select pg_temp.child_context_identify(1);
select is(jsonb_array_length(api.get_context()->'children'),7,'guardian keeps pending/unready own-family children for onboarding');
select is(api.get_context()->'children'->0->>'name','Pending first','existing child ordering is preserved rather than hiding pending setup');
select is(api.get_context()->'children'->0->>'state','pending','pending workflow state is explicit');
select is(api.get_context()->'children'->0->'accountReady','false'::jsonb,'pending missing identity has exact boolean false');
select is(api.get_context()->'children'->1->>'state','active','ready child retains active state');
select is(api.get_context()->'children'->1->'accountReady','true'::jsonb,'admitted distinct active child identity with current consent is ready');
select is(api.get_context()->'children'->2->'accountReady','false'::jsonb,'active child without account is not ready');
select is(api.get_context()->'children'->3->'accountReady','false'::jsonb,'active child without admitted membership is not ready');
select is(api.get_context()->'children'->4->'accountReady','false'::jsonb,'withdrawn consent is not ready even when record state still says active');
select is(api.get_context()->'children'->5->'accountReady','false'::jsonb,'linked account and membership cannot bypass pending child state');
select is(api.get_context()->'children'->6->'accountReady','false'::jsonb,'parent identity linkage cannot masquerade as an independent child account');
select is((select string_agg(k,',' order by k) from jsonb_object_keys(api.get_context()->'children'->1) k),
  'accountReady,familyId,id,name,state','child projection adds only state/readiness, no Auth identity or consent evidence');
select is((select count(*)::int from jsonb_array_elements(api.get_context()->'children') child where child->'accountReady'='true'::jsonb),1,'only the ready child is eligible for default feature selection');
select ok(position('Outside child' in api.get_context()::text)=0,'guardian context cannot enumerate another family child');
select pg_temp.child_context_identify(3);
select is(jsonb_array_length(api.get_context()->'children'),1,'child context remains limited to their own subject');
select is(api.get_context()->'children'->0->>'id',pg_temp.child_context_id(3,2)::text,'forged parent metadata cannot expose siblings');
select is(api.get_context()->'children'->0->'accountReady','true'::jsonb,'own child identity remains eligible without requiring a different requesting UID');
select pg_temp.child_context_identify(9);
select is(jsonb_array_length(api.get_context()->'children'),1,'other guardian sees only their own family child');
select is(api.get_context()->'children'->0->>'id',pg_temp.child_context_id(3,8)::text,'cross-family ready state is not projected into a different guardian family');
select pg_temp.child_context_identify(8);
select is(jsonb_array_length(api.get_context()->'children'),1,'outside child sees no eligibility directory for other children');
select pg_temp.child_context_identify(7);
select is(api.get_context()->'children','[]'::jsonb,'independent operator status does not grant a family-child directory');
reset role;
update app_private.consents set verified_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' where child_id=pg_temp.child_context_id(3,2);
set local role authenticated;
select pg_temp.child_context_identify(1);
select is(api.get_context()->'children'->1->'accountReady','false'::jsonb,'expired consent is re-evaluated rather than cached as ready');
reset role;
update app_private.consents set expires_at=now()+interval '1 day' where child_id=pg_temp.child_context_id(3,2);
update app_private.memberships set status='revoked' where user_id=pg_temp.child_context_id(1,3);
set local role authenticated;
select pg_temp.child_context_identify(1);
select is(api.get_context()->'children'->1->'accountReady','false'::jsonb,'revoked child membership immediately clears readiness');
reset role;
update app_private.memberships set status='active' where user_id=pg_temp.child_context_id(1,3);
delete from auth.sessions where id=pg_temp.child_context_id(1,3);
set local role authenticated;
select pg_temp.child_context_identify(1);
select is(api.get_context()->'children'->1->'accountReady','true'::jsonb,'readiness is enrolled eligibility, not a child online-presence signal');
reset role;
insert into auth.sessions(id,user_id,created_at,updated_at) values(pg_temp.child_context_id(1,3),pg_temp.child_context_id(1,3),now(),now());
set local role authenticated;
select pg_temp.child_context_identify(1);
select lives_ok($$select api.withdraw_consent(pg_temp.child_context_id(3,2))$$,'existing withdrawal workflow remains authoritative');
select is(jsonb_array_length(api.get_context()->'children'),7,'guardian still sees withdrawn child for appropriate account setup information');
select is(api.get_context()->'children'->1->>'state','suspended','workflow state updates after actual withdrawal');
select is(api.get_context()->'children'->1->'accountReady','false'::jsonb,'actual withdrawal never leaves a ready selector flag');
select pg_temp.child_context_identify(3);
select throws_ok($$select api.get_context()$$,'42501','not authorized','new readiness metadata cannot restore withdrawn child application access');
reset role;
select * from finish();
rollback;
