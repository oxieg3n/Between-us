begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_function_privilege('authenticated','api.finance_load(jsonb,uuid,text)','EXECUTE'),'client cannot load private aggregate');
select ok(not has_function_privilege('authenticated','api.finance_commit(jsonb,uuid,text,bigint,jsonb,text)','EXECUTE'),'client cannot commit an invented ledger');
select ok(has_function_privilege('service_role','api.finance_commit(jsonb,uuid,text,bigint,jsonb,text)','EXECUTE'),'trusted server has narrow commit entry point');
select ok(not has_function_privilege('anon','api.finance_scope(uuid,uuid)','EXECUTE'),'anonymous caller cannot obtain financial scope');
select is(app_private.finance_canonical('{"z":[2,true],"a":{"b":1}}'),'{'||'"a":{"b":1},"z":[2,true]}','canonical fingerprint is stable across key order');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create temporary table finance_values(key text primary key,value jsonb);
create function pg_temp.finance_identify(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',p_id,'role','authenticated',
    'exp',extract(epoch from now()+interval '1 hour'))::text,true);
end $$;
do $$ declare v_uid uuid; v_email text; v_token text; v_family uuid; v_child uuid; v_consent uuid; v_material jsonb; begin
  for v_uid,v_email in select * from (values
    ('40000000-0000-0000-0000-000000000001'::uuid,'finance-parent@fixture.test'),
    ('40000000-0000-0000-0000-000000000002'::uuid,'finance-operator@fixture.test')) x(id,email) loop
    v_token:=app_private.issue_parent_registration(v_email)->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(v_uid,v_email,now(),jsonb_build_object('registration_token',v_token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(v_uid,v_uid,now(),now());
    perform pg_temp.finance_identify(v_uid); perform api.bootstrap_parent('Fictional adult');
  end loop;
  insert into app_private.operators(user_id,scope,active) values('40000000-0000-0000-0000-000000000002','consent',true);
  perform pg_temp.finance_identify('40000000-0000-0000-0000-000000000001');
  v_family:=api.create_family('Finance fixture','America/New_York'); v_child:=api.create_child(v_family,'Fictional child');
  v_consent:=api.request_child_consent(v_child,'synthetic-v1','synthetic-v1');
  perform pg_temp.finance_identify('40000000-0000-0000-0000-000000000002');
  perform api.verify_child_consent(v_consent,'synthetic_fixture','fixture:finance',now()+interval '1 day');
  perform pg_temp.finance_identify('40000000-0000-0000-0000-000000000001');
  v_material:=api.begin_child_enrollment(v_child);
  v_uid:='40000000-0000-0000-0000-000000000003';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(v_uid,v_material->>'email',now(),jsonb_build_object('registration_token',v_material->>'token'),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(v_uid,v_uid,now(),now());
  perform pg_temp.finance_identify(v_uid); perform api.accept_child_enrollment(v_material->>'token');
  perform set_config('test.finance_family',v_family::text,true); perform set_config('test.finance_child',v_child::text,true);
  insert into finance_values values('child_scope',api.finance_scope(v_family,v_child));
  perform set_config('test.finance_child_scope',(select value::text from finance_values where key='child_scope'),true);
  perform pg_temp.finance_identify('40000000-0000-0000-0000-000000000001');
  insert into finance_values values('scope',api.finance_scope(v_family,v_child));
  perform set_config('test.finance_scope',(select value::text from finance_values where key='scope'),true);
  insert into finance_values values('initial',api.finance_load((select value from finance_values where key='scope')));
end $$;
select is((select value->'state'->>'timezone' from finance_values where key='initial'),'America/New_York','timezone derives from family record');
select is((select jsonb_array_length(value->'state'->'events') from finance_values where key='initial'),0,'no fictional seed finances are promoted into server ledger');
set local role authenticated;
select throws_ok($$select api.finance_load(current_setting('test.finance_scope')::jsonb)$$,'42501',null,'authenticated RPC cannot return raw events');
select throws_ok($$select api.finance_scope(current_setting('test.finance_family')::uuid,'99999999-0000-0000-0000-000000000001')$$,
  '42501','not authorized','forged child object denied');
reset role;
create function pg_temp.finance_commit_fixture(p_operation uuid,p_budget numeric default 5000,p_at text default null,p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_scope jsonb:=current_setting('test.finance_scope')::jsonb; v_load jsonb; v_action jsonb; v_event jsonb; v_state jsonb; v_at text; v_hash text;
begin
  v_load:=api.finance_load(v_scope); v_at:=coalesce(p_at,v_load->>'serverAt');
  v_action:=jsonb_build_object('kind','configure_plan','plan',jsonb_build_object('budgetCents',p_budget,'period','monthly',
    'anchorDate','2026-11-01','payoutCadence','per_task','minimumPayoutCents',0,'allowGoalRelease',true));
  v_event:=v_action||jsonb_build_object('id',(v_scope->>'actorId')||':'||p_operation::text,'childId',v_scope->>'childId','at',v_at,
    'actor',jsonb_build_object('role','parent'),'effects','[]'::jsonb);
  v_state:=jsonb_set(v_load->'state','{events}',(v_load->'state'->'events')||jsonb_build_array(v_event));
  v_hash:=coalesce(p_hash,encode(extensions.digest(app_private.finance_canonical(jsonb_build_object(
    'familyId',v_scope->>'familyId','childId',v_scope->>'childId','action',v_action)),'sha256'),'hex'));
  return api.finance_commit(v_scope,p_operation,v_hash,(v_load->>'revision')::bigint,v_state,v_at);
end $$;
select is(pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000001')->>'status','committed','trusted validated command appends atomically');
select is((select count(*) from app_private.finance_events where family_id=current_setting('test.finance_family')::uuid),1::bigint,'exactly one audit event appended');
select is((select count(*) from app_private.finance_commands where family_id=current_setting('test.finance_family')::uuid),1::bigint,'operation identity committed with event');
select is(api.finance_commit(current_setting('test.finance_scope')::jsonb,'50000000-0000-0000-0000-000000000099',repeat('a',64),0,'{}','bad')->>'status',
  'conflict','stale revision fails before any candidate mutation');
select is(pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000001')->>'status','replayed','same operation cannot duplicate financial effects');
select throws_ok($$select pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000001',6000)$$,'22023','operation identity conflict','changed-body operation replay denied');
select throws_ok($$select pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000002',1.5)$$,'22023','invalid financial event','database rejects fractional money in trusted commit');
select throws_ok($$select pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000002',5000,'2099-01-01T00:00:00.000Z')$$,
  '22023','invalid financial event','database rejects future event clock');
select throws_ok($$select pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000002',5000,null,repeat('b',64))$$,
  '22023','logical fingerprint mismatch','database binds fingerprint to scoped logical action');
select is((select count(*) from app_private.finance_events where family_id=current_setting('test.finance_family')::uuid),1::bigint,'all failed commits rolled back without partial event/command');
select throws_ok($$update app_private.finance_events set event_id='rewrite' where family_id=current_setting('test.finance_family')::uuid$$,
  '42501','financial history is append-only','historical event cannot be rewritten');
select throws_ok($$delete from app_private.finance_commands where family_id=current_setting('test.finance_family')::uuid$$,
  '42501','financial history is append-only','operation audit cannot be discarded');
do $$ declare v_load jsonb; v_state jsonb; begin
  v_load:=api.finance_load(current_setting('test.finance_scope')::jsonb);
  v_state:=jsonb_set(v_load->'state','{timezone}','"UTC"');
  perform set_config('test.finance_bad_state',v_state::text,true);
  perform set_config('test.finance_revision',v_load->>'revision',true);
  perform set_config('test.finance_at',v_load->>'serverAt',true);
end $$;
select throws_ok($$select api.finance_commit(current_setting('test.finance_scope')::jsonb,'50000000-0000-0000-0000-000000000002',repeat('a',64),
  current_setting('test.finance_revision')::bigint,current_setting('test.finance_bad_state')::jsonb,current_setting('test.finance_at'))$$,
  '22023','invalid financial aggregate','timezone and roster cannot be changed by financial command');
select is(pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000002',6000)->>'status','committed','later legitimate mutation commits');
select is(jsonb_array_length(pg_temp.finance_commit_fixture('50000000-0000-0000-0000-000000000001')->'state'->'events'),2,
  'replay returns current authorized state without rolling back balances');
do $$ declare v_load jsonb; v_new_child uuid; begin
  v_new_child:=api.create_child(current_setting('test.finance_family')::uuid,'New fictional child');
  v_load:=api.finance_load(current_setting('test.finance_scope')::jsonb);
  insert into finance_values values('roster_synced',v_load);
end $$;
select is((select jsonb_array_length(value->'state'->'children') from finance_values where key='roster_synced'),2,'new child roster sync preserves old children');
select is((select jsonb_array_length(value->'state'->'events') from finance_values where key='roster_synced'),2,'roster sync preserves all financial history');
do $$ declare v_load jsonb; v_events jsonb; begin
  v_load:=api.finance_load(current_setting('test.finance_scope')::jsonb);
  v_events:=jsonb_set(v_load->'state'->'events','{0,plan,budgetCents}','1');
  v_events:=v_events||jsonb_build_array(v_events->0);
  perform set_config('test.finance_bad_prefix',jsonb_set(v_load->'state','{events}',v_events)::text,true);
  perform set_config('test.finance_revision',v_load->>'revision',true);
  perform set_config('test.finance_at',v_load->>'serverAt',true);
end $$;
select throws_ok($$select api.finance_commit(current_setting('test.finance_scope')::jsonb,'50000000-0000-0000-0000-000000000003',repeat('a',64),
  current_setting('test.finance_revision')::bigint,current_setting('test.finance_bad_prefix')::jsonb,current_setting('test.finance_at'))$$,
  '22023','event prefix is immutable','candidate cannot rewrite previous event while appending a new one');
select throws_ok($$select api.finance_load(jsonb_set(current_setting('test.finance_scope')::jsonb,'{expiresAt}','0'))$$,
  '42501','not authorized','trusted API rechecks token expiry');
select lives_ok($$select api.withdraw_consent(current_setting('test.finance_child')::uuid)$$,'consent withdrawal is independent of financial history');
select throws_ok($$select api.finance_load(current_setting('test.finance_child_scope')::jsonb)$$,'42501','not authorized','previously valid child scope fails after consent withdrawal');
delete from auth.sessions where id='40000000-0000-0000-0000-000000000001';
select throws_ok($$select api.finance_load(current_setting('test.finance_scope')::jsonb)$$,'42501','not authorized','previously derived server scope fails after managed sign-out');
select * from finish();
rollback;
