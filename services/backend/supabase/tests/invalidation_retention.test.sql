begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_table_privilege('authenticated','app_private.invalidation_creation','SELECT'),'private creation order is not client-readable');
select ok(not has_table_privilege('authenticated','app_private.invalidation_creation','INSERT'),'client cannot assign private creation order');
select ok(not has_sequence_privilege('authenticated','app_private.invalidation_creation_ordinal_seq','USAGE'),'private identity sequence is not a client counter');
select ok(not has_function_privilege('authenticated','app_private.invalidate_user(uuid)','EXECUTE'),'client cannot select recipient or ID for raw hints');
select ok(not has_function_privilege('authenticated','app_private.prune_own_invalidation_hints(uuid)','EXECUTE'),'client cannot mutate another user retention');
select ok(not has_function_privilege('service_role','app_private.register_invalidation_creation()','EXECUTE'),'no private trigger helper execution grant added');
select is((select count(*)::int from information_schema.columns where table_schema='api' and table_name='user_invalidations'),2,'public hints remain exactly id/user_id without time/order');
select is((select count(*)::int from pg_publication_tables where pubname='supabase_realtime'),1,'private ordering table is never added to publication');
select ok(not exists(select 1 from pg_publication_tables where schemaname='app_private' and tablename='invalidation_creation'),'no publication exposes private order');
select ok((select pubinsert and not pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname='supabase_realtime'),'publication remains INSERT-only');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.ir_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.ir_identify(p_user uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','session_id',p_user,
    'exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian'))::text,true);
end $$;
do $$ begin for i in 1..3 loop perform pg_temp.ir_user(('20000020-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'retention'||i||'@hints.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like '20000020-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='20000020-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('20100020-0000-0000-0000-000000000001','Fictional hint retention family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('20200020-0000-0000-0000-000000000001','20100020-0000-0000-0000-000000000001','Fictional child','20000020-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
 ('20100020-0000-0000-0000-000000000001','20000020-0000-0000-0000-000000000001','guardian',null),
 ('20100020-0000-0000-0000-000000000001','20000020-0000-0000-0000-000000000003','child','20200020-0000-0000-0000-000000000001');
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
 values('20200020-0000-0000-0000-000000000001','20100020-0000-0000-0000-000000000001','20000020-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:hint-retention','20000020-0000-0000-0000-000000000002',now(),now()+interval '1 day');

-- Sequential correctness is asserted after EVERY insert, not merely final count.
create function pg_temp.ir_emit(p_user uuid,p_count int) returns boolean language plpgsql as $$
declare latest uuid; previous_order bigint:=0; current_order bigint; all_ids uuid[]:='{}';
begin
  for i in 1..p_count loop
    perform app_private.invalidate_user(p_user);
    select id,ordinal into latest,current_order from app_private.invalidation_creation where user_id=p_user order by ordinal desc limit 1;
    if latest is null or current_order<=previous_order or not exists(select 1 from api.user_invalidations where id=latest and user_id=p_user)
      or (select count(*) from api.user_invalidations where user_id=p_user)<>least(i,20)
      or (select count(*) from app_private.invalidation_creation where user_id=p_user)<>least(i,20) then return false; end if;
    previous_order:=current_order; all_ids:=array_append(all_ids,latest);
  end loop;
  perform set_config('test.ir_ids',to_jsonb(all_ids)::text,true);return true;
end $$;
select ok(pg_temp.ir_emit('20000020-0000-0000-0000-000000000003',60),'all sixty random-UUID child emits retain the newly created row and sequential cap after every insert');
select is((select count(*)::int from api.user_invalidations where user_id='20000020-0000-0000-0000-000000000003'),20,'sequential retention keeps exactly twenty own hints');
select ok(not exists(select 1 from jsonb_array_elements_text(current_setting('test.ir_ids')::jsonb) with ordinality inserted(id,n)
  join api.user_invalidations hint on hint.id::text=inserted.id where inserted.n<=40),'first forty actual creation IDs are pruned regardless of UUID sort');
select is((select count(*)::int from jsonb_array_elements_text(current_setting('test.ir_ids')::jsonb) with ordinality inserted(id,n)
  join api.user_invalidations hint on hint.id::text=inserted.id where inserted.n>40),20,'last twenty actual creation IDs all remain');
select ok(app_private.prune_own_invalidation_hints('20000020-0000-0000-0000-000000000003'),'uncontended bounded prune reports execution');
select ok(not app_private.prune_own_invalidation_hints(null),'null private maintenance scope does nothing');

set local role authenticated;
select pg_temp.ir_identify('20000020-0000-0000-0000-000000000003');
select is((select count(*)::int from api.user_invalidations),20,'active child sees only its twenty own opaque hints');
select ok((select bool_and((select count(*)=2 from jsonb_object_keys(to_jsonb(hint)))) from api.user_invalidations hint),'every published/selected hint still has only id/user_id');
select set_config('test.ir_child_snapshot',(select jsonb_agg(to_jsonb(hint) order by id)::text from api.user_invalidations hint),true);
select throws_ok($$insert into api.user_invalidations(id,user_id) values(gen_random_uuid(),'20000020-0000-0000-0000-000000000003')$$,'42501',null,'untrusted client cannot choose hint identity');
select throws_ok($$select ordinal from app_private.invalidation_creation$$,'42501',null,'untrusted client cannot observe global/private ordinal gaps');
select throws_ok($$select nextval('app_private.invalidation_creation_ordinal_seq')$$,'42501',null,'untrusted client cannot advance private ordering');
reset role;
select ok(pg_temp.ir_emit('20000020-0000-0000-0000-000000000001',75),'seventy-five private parent hints also preserve every new row at insertion');
set local role authenticated;
select is((select jsonb_agg(to_jsonb(hint) order by id)::text from api.user_invalidations hint),current_setting('test.ir_child_snapshot'),'parent-only activity/ordinal gaps do not change child-visible hint snapshot');
select is((select count(*)::int from api.user_invalidations),20,'parent activity never adds child-visible rows or matching metadata');
reset role;

-- A newest high UUID deterministically exposes the original ascending-UUID bug.
insert into api.user_invalidations(id,user_id) values('ffffffff-ffff-ffff-ffff-ffffffffffff','20000020-0000-0000-0000-000000000003');
select ok(exists(select 1 from api.user_invalidations where id='ffffffff-ffff-ffff-ffff-ffffffffffff'),'direct server fixture is registered and not immediately pruned by its high UUID');
select is((select count(*)::int from api.user_invalidations where user_id='20000020-0000-0000-0000-000000000003'),20,'all insert paths pass through ordered retention');
select is((select count(*)::int from app_private.invalidation_creation where user_id='20000020-0000-0000-0000-000000000003'),20,'old hint deletion cascades ordering metadata during pruning');
select throws_ok($$update api.user_invalidations set user_id='20000020-0000-0000-0000-000000000001' where id='ffffffff-ffff-ffff-ffff-ffffffffffff'$$,'42501','opaque invalidations are immutable','hint ownership cannot diverge from private creation metadata');
select throws_ok($$insert into app_private.invalidation_creation(id,user_id,ordinal) values(gen_random_uuid(),'20000020-0000-0000-0000-000000000003',1)$$,'428C9',null,'server identity ordinal cannot be a normal insert parameter');
delete from api.user_invalidations where user_id='20000020-0000-0000-0000-000000000003';
select is((select count(*)::int from app_private.invalidation_creation where user_id='20000020-0000-0000-0000-000000000003'),0,'lifecycle own hint erasure cascades all private ordering rows');
select is((select count(*)::int from app_private.invalidation_creation where user_id='20000020-0000-0000-0000-000000000001'),20,'own lifecycle erasure leaves another author metadata untouched');
select ok(not exists(select 1 from app_private.invalidation_creation creation left join api.user_invalidations hint on hint.id=creation.id where hint.id is null),'no retained orphan ordering metadata');
select ok(not(select public_enrollment_enabled or real_child_data_enabled or public_reports_enabled from app_private.deployment_policy),'retention does not enable public enrollment/real-data/report gates');
-- These tests intentionally do not claim a strict concurrent cap. Busy try-lock
-- and simultaneous writer repair require a separately serialized multi-session test.
select * from finish();
rollback;
