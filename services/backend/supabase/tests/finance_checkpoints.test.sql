begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok((select count(*)=9 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relname in('finance_checkpoints','finance_entity_ids','finance_archive_capsules','finance_archive_residency',
    'finance_archive_entity_keys','finance_archived_occurrences','finance_archive_budget_heads','finance_archive_budget_periods','finance_archive_current_entities')),'every checkpoint/archive/cache table has RLS');
select ok(not has_function_privilege('authenticated','api.finance_archive_lookup(jsonb,text,text)','EXECUTE'),'client cannot load raw archive/source lots');
select ok(not has_function_privilege('authenticated','api.finance_archive_page(jsonb,uuid,integer)','EXECUTE'),'client cannot page raw archive');
select ok(not has_function_privilege('anon','api.finance_archive_budget(jsonb,text,text,text[],text[])','EXECUTE'),'anonymous cannot read financial budget basis');
select ok(has_function_privilege('service_role','api.finance_archive_page(jsonb,uuid,integer)','EXECUTE'),'trusted service projects authorized archive page');
select ok(not has_table_privilege('service_role','app_private.finance_archive_capsules','SELECT,INSERT,UPDATE,DELETE'),'service cannot bypass capsule RPC guards');
select ok(not has_function_privilege('service_role','app_private.finance_archive_store(uuid,uuid,integer,uuid,text,jsonb,jsonb)','EXECUTE'),'service cannot bypass transactional capsule publication');
select is(app_private.finance_budget_period('2026-10-31','weekly','2026-11-01'),'2026-11-01/7/-1','weekly archived budget uses floor before anchor');
select is(app_private.finance_budget_period('2026-10-17','biweekly','2026-11-01'),'2026-11-01/14/-2','biweekly archived budget uses floor before anchor');
select is(app_private.finance_budget_period('2026-10-31','monthly','2026-11-01'),'2026-10','monthly archived budget is calendar month');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.cp_identify(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',p_id,'role','authenticated',
    'exp',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true);
end $$;
do $$ declare id uuid;email text;token text;family uuid;child uuid;consent uuid;material jsonb;begin
  for id,email in select * from(values
    ('47000000-0000-0000-0000-000000000001'::uuid,'checkpoint-parent@fixture.test'),
    ('47000000-0000-0000-0000-000000000002'::uuid,'checkpoint-independent@fixture.test')) identities(id,email) loop
    token:=app_private.issue_parent_registration(email)->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(id,email,clock_timestamp(),jsonb_build_object('registration_token',token),clock_timestamp(),clock_timestamp());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(id,id,clock_timestamp(),clock_timestamp());
    perform pg_temp.cp_identify(id);perform api.bootstrap_parent('Fictional checkpoint adult');
  end loop;
  insert into app_private.operators(user_id,scope,active) values('47000000-0000-0000-0000-000000000002','consent',true);
  perform pg_temp.cp_identify('47000000-0000-0000-0000-000000000001');
  family:=api.create_family('Fictional checkpoint family','America/New_York');child:=api.create_child(family,'Fictional checkpoint child');
  consent:=api.request_child_consent(child,'synthetic-v1','synthetic-v1');
  perform pg_temp.cp_identify('47000000-0000-0000-0000-000000000002');
  perform api.verify_child_consent(consent,'synthetic_fixture','fixture:checkpoint',clock_timestamp()+interval '1 day');
  perform pg_temp.cp_identify('47000000-0000-0000-0000-000000000001');material:=api.begin_child_enrollment(child);
  id:='47000000-0000-0000-0000-000000000003';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(id,material->>'email',clock_timestamp(),jsonb_build_object('registration_token',material->>'token'),clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(id,id,clock_timestamp(),clock_timestamp());
  perform pg_temp.cp_identify(id);perform api.accept_child_enrollment(material->>'token');
  perform set_config('test.cp.family',family::text,true);perform set_config('test.cp.child',child::text,true);
  perform pg_temp.cp_identify('47000000-0000-0000-0000-000000000001');
  perform set_config('test.cp.scope',api.finance_scope(family,child)::text,true);
end $$;
create function pg_temp.cp_book(p_plan jsonb default null) returns jsonb language sql as $$
  select jsonb_build_object('occurrences','[]'::jsonb,'goals','[]'::jsonb,'free','[]'::jsonb,'allocations','[]'::jsonb,'payouts','[]'::jsonb,
    'matches','[]'::jsonb,'savingsRules','[]'::jsonb,'matchingRule',jsonb_build_object('enabled',false,'percent',100,'monthlyCapCents',2000,
      'parentBudgetCents',2000,'surprise',true),'earnedCents',0,'correctionDueCents',0,'archivedPaidCents',0)
    ||case when p_plan is null then '{}'::jsonb else jsonb_build_object('plan',p_plan) end
$$;
create function pg_temp.cp_envelope(p_step int,p_roll text default 'none') returns jsonb language plpgsql as $$
declare scope jsonb:=current_setting('test.cp.scope')::jsonb;loaded jsonb;action jsonb;event jsonb;state jsonb;book jsonb;at text;last_at text;operation uuid;
begin
  operation:=('48000000-0000-0000-0000-'||lpad(p_step::text,12,'0'))::uuid;
  loaded:=api.finance_load(scope);at:=loaded->>'serverAt';
  action:=jsonb_build_object('kind','configure_plan','plan',jsonb_build_object('budgetCents',5000+p_step,'period','monthly','anchorDate','2026-11-01',
    'payoutCadence','per_task','minimumPayoutCents',0,'allowGoalRelease',true));
  event:=action||jsonb_build_object('id',(scope->>'actorId')||':'||operation::text,'childId',scope->>'childId','at',at,'actor',jsonb_build_object('role','parent'),'effects','[]'::jsonb);
  state:=jsonb_set(loaded->'state','{events}',(loaded->'state'->'events')||jsonb_build_array(event));
  if p_roll in('before','after') then
    book:=pg_temp.cp_book(case when p_roll='after' then action->'plan' else coalesce(loaded->'state'->'events'->-1->'plan',loaded->'state'->'checkpoint'->'books'->(scope->>'childId')->'plan') end);
    last_at:=case when p_roll='after' then at else coalesce(loaded->'state'->'events'->-1->>'at',loaded->'state'->'checkpoint'->>'lastEventAt') end;
    state:=jsonb_set(state,'{checkpoint}',jsonb_build_object('version',1,'lastEventAt',last_at,'books',jsonb_build_object(scope->>'childId',book),
      'activity',jsonb_build_object(scope->>'childId',jsonb_build_object('visible','[]'::jsonb,'parent','[]'::jsonb))));
    state:=jsonb_set(state,'{events}',case when p_roll='after' then '[]'::jsonb else jsonb_build_array(event) end);
  end if;
  return jsonb_build_object('state',state,'event',event,'previousStateHash',loaded->>'stateHash','loaded',loaded,'operation',operation,
    'fingerprint',app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',action)));
end $$;
create function pg_temp.cp_apply(p_step int,p_roll text default 'none',p_change jsonb default '{}') returns jsonb language plpgsql as $$
declare request jsonb:=pg_temp.cp_envelope(p_step,p_roll);envelope jsonb;begin
  envelope:=(request-array['loaded','operation','fingerprint'])||p_change;
  return api.finance_commit(current_setting('test.cp.scope')::jsonb,(request->>'operation')::uuid,request->>'fingerprint',
    (request->'loaded'->>'revision')::bigint,envelope,request->'event'->>'at');
end $$;
select is(pg_temp.cp_apply(1,'before')->>'status','committed','first empty checkpoint binds boundary0 while keeping new event as tail');
select is((select through_sequence from app_private.finance_checkpoints where family_id=current_setting('test.cp.family')::uuid),0,'empty checkpoint boundary is not guessed from new tail length');
select is(pg_temp.cp_apply(2,'after')->>'status','committed','checkpoint can fold old tail and the new event');
select is((api.finance_load(current_setting('test.cp.scope')::jsonb)->>'throughSequence')::int,2,'load watermark follows immutable ledger, not cleared event array');
select is(jsonb_array_length(api.finance_load(current_setting('test.cp.scope')::jsonb)->'state'->'events'),0,'after-apply checkpoint clears hot tail');
select throws_ok($$select pg_temp.cp_apply(3,'none',jsonb_build_object('previousStateHash',repeat('0',64)))$$,'22023','financial source binding mismatch','wrong canonical source hash denies without a ledger append');
select throws_ok($$select pg_temp.cp_apply(3,'after',jsonb_build_object('state',jsonb_set(pg_temp.cp_envelope(3,'after')->'state','{checkpoint,lastEventAt}','"2099-01-01T00:00:00.000Z"')))$$,
  '22023','checkpoint time binding mismatch','checkpoint cannot claim a different covered source time');
do $$ begin for step in 3..300 loop perform pg_temp.cp_apply(step,case when step%64=0 then 'after' when step%32=0 then 'before' else 'none' end);end loop;end $$;
select is((select count(*)::int from app_private.finance_events where family_id=current_setting('test.cp.family')::uuid),300,'300 visible actions survive checkpoints without the old lifetime128 stop');
select is((select count(*)::int from app_private.finance_commands where family_id=current_setting('test.cp.family')::uuid),300,'every historical command identity remains');
select is((select max(sequence) from app_private.finance_events where family_id=current_setting('test.cp.family')::uuid),300,'ledger sequence never resets at a checkpoint');
select ok(jsonb_array_length(api.finance_load(current_setting('test.cp.scope')::jsonb)->'state'->'events')<32,'hot tail remains bounded after many immutable appends');
select ok((select count(*)>5 from app_private.finance_checkpoints where family_id=current_setting('test.cp.family')::uuid),'rollover appends historical checkpoints');
select is(api.finance_commit(current_setting('test.cp.scope')::jsonb,'48000000-0000-0000-0000-000000000001',pg_temp.cp_envelope(1)->>'fingerprint',
  0,'{}','2000-01-01T00:00:00.000Z')->>'status','replayed','old UUID replays current authorized state across many checkpoints');
select throws_ok($$select api.finance_commit(current_setting('test.cp.scope')::jsonb,'48000000-0000-0000-0000-000000000001',repeat('0',64),0,'{}',null)$$,
  '22023','operation identity conflict','historical UUID cannot acquire a different logical body');
select throws_ok($$update app_private.finance_checkpoints set checkpoint='{}' where family_id=current_setting('test.cp.family')::uuid$$,
  '42501','financial history is append-only','historical checkpoint is append-only');
select throws_ok($$delete from app_private.finance_commands where family_id=current_setting('test.cp.family')::uuid$$,
  '42501','financial history is append-only','checkpoint cannot make historical command IDs deletable');
select is(api.finance_commit(current_setting('test.cp.scope')::jsonb,gen_random_uuid(),repeat('0',64),0,'{}',null)->>'status','conflict','stale CAS is rejected before candidate mutation');
select throws_ok($$select api.finance_commit(current_setting('test.cp.scope')::jsonb,gen_random_uuid(),repeat('0',64),300,'{}',null)$$,
  '22023','checkpoint envelope required','legacy bare-state write cannot overwrite checkpoint storage');
create function pg_temp.cp_assign(p_step int) returns jsonb language plpgsql as $$
declare request jsonb:=pg_temp.cp_envelope(p_step,'before');scope jsonb:=current_setting('test.cp.scope')::jsonb;action jsonb;event jsonb;state jsonb;begin
  action:=jsonb_build_object('kind','assign_chore','choreId','checkpoint-permanent-id','title','Fictional checkpoint chore','rewardCents',100,'dates',jsonb_build_array('2099-01-01'));
  event:=action||((request->'event')-array['kind','plan']);state:=jsonb_set(request->'state','{events}',jsonb_build_array(event));
  return api.finance_commit(scope,(request->>'operation')::uuid,
    app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',action)),
    (request->'loaded'->>'revision')::bigint,jsonb_build_object('state',state,'event',event,'previousStateHash',request->'loaded'->>'stateHash'),event->>'at');
end $$;
select is(pg_temp.cp_assign(301)->>'status','committed','before-apply rollover does not require a new tail entity inside the prior-boundary book');
select ok(exists(select 1 from app_private.finance_entity_ids where family_id=current_setting('test.cp.family')::uuid and kind='chore' and entity_id='checkpoint-permanent-id'),'accepted chore identity is permanently indexed');
select throws_ok($$select pg_temp.cp_assign(302)$$,'22023','financial entity identity already used','new operation cannot reuse an already registered chore identity');
select is(api.finance_archive_lookup(current_setting('test.cp.scope')::jsonb,'payment','not-an-existing-payment'),null::jsonb,'unknown active archive lookup is null');
select is(api.finance_archive_page(current_setting('test.cp.scope')::jsonb)->'items','[]'::jsonb,'empty visible archive is a bounded page');
select throws_ok($$select api.finance_archive_page(current_setting('test.cp.scope')::jsonb,null,51)$$,'22023','invalid archive page','archive page limit is bounded');
select throws_ok($$select api.finance_archive_page(current_setting('test.cp.scope')::jsonb,'ffffffff-ffff-ffff-ffff-ffffffffffff')$$,'22023','invalid archive page','unknown/foreign page anchor cannot enumerate another child');
select is(api.finance_archive_budget(current_setting('test.cp.scope')::jsonb,'monthly','2026-11-01',array['2026-11'])->'byPeriod','{"2026-11":0}'::jsonb,'empty permanent budget index returns explicit zero for requested period');
select is(api.finance_archive_budget(current_setting('test.cp.scope')::jsonb,'monthly','2026-11-01',array['2026-11'])->'excludedOccurrenceIds','[]'::jsonb,'only actually indexed hot occurrences may be excluded');
select throws_ok($$select api.finance_archive_budget(current_setting('test.cp.scope')::jsonb,'daily','2026-11-01',array['2026-11'])$$,
  '22023','invalid budget basis','unsupported budget cadence denies');
set local role authenticated;
select throws_ok($$select api.finance_archive_lookup(current_setting('test.cp.scope')::jsonb,'payment','id')$$,'42501',null,'authenticated client cannot retrieve private capsule structure');
reset role;
create function pg_temp.cp_corrupt_read(p_mode text) returns jsonb language plpgsql as $$
declare v_cap uuid;v_checkpoint app_private.finance_checkpoints;begin
  if p_mode='aggregate' then
    update app_private.finance_aggregates set state=jsonb_set(state,array['checkpoint','books',current_setting('test.cp.child'),'earnedCents'],'999999')
      where family_id=current_setting('test.cp.family')::uuid;
    return api.finance_load(current_setting('test.cp.scope')::jsonb);
  elsif p_mode='checkpoint' then
    alter table app_private.finance_checkpoints disable trigger immutable_history;
    update app_private.finance_checkpoints set state_hash=repeat('0',64) where id=(select id from app_private.finance_checkpoints
      where family_id=current_setting('test.cp.family')::uuid order by aggregate_revision desc limit 1);
    return api.finance_load(current_setting('test.cp.scope')::jsonb);
  elsif p_mode='tail' then
    update app_private.finance_aggregates set state=jsonb_set(state,'{events}','[]') where family_id=current_setting('test.cp.family')::uuid;
    return api.finance_load(current_setting('test.cp.scope')::jsonb);
  end if;
  select * into v_checkpoint from app_private.finance_checkpoints where family_id=current_setting('test.cp.family')::uuid order by aggregate_revision desc limit 1;
  insert into app_private.finance_archive_capsules(family_id,child_id,source_sequence,checkpoint_id,previous_state_hash,hash,payload)
    values(current_setting('test.cp.family')::uuid,current_setting('test.cp.child')::uuid,1,v_checkpoint.id,repeat('0',64),repeat('0',64),'{}') returning id into v_cap;
  insert into app_private.finance_archive_residency(capsule_id,family_id,child_id) values(v_cap,current_setting('test.cp.family')::uuid,current_setting('test.cp.child')::uuid);
  return api.finance_archive_page(current_setting('test.cp.scope')::jsonb);
end $$;
select throws_ok($$select pg_temp.cp_corrupt_read('aggregate')$$,'XX001','financial data unavailable','load rejects a changed checkpoint book before serving balances');
select throws_ok($$select pg_temp.cp_corrupt_read('checkpoint')$$,'XX001','financial data unavailable','load verifies immutable checkpoint stored canonical hash');
select throws_ok($$select pg_temp.cp_corrupt_read('tail')$$,'XX001','financial data unavailable','load rejects missing tail without lifetime replay fallback');
select throws_ok($$select pg_temp.cp_corrupt_read('capsule')$$,'XX001','financial data unavailable','visible page rejects corrupt capsule before projection');
create function pg_temp.cp_allocation_prune(p_where text) returns boolean language plpgsql as $$
declare child text:=current_setting('test.cp.child');old_state jsonb;new_state jsonb;book jsonb:=pg_temp.cp_book();lot jsonb;begin
  old_state:=jsonb_build_object('children',jsonb_build_array(jsonb_build_object('id',child)),'events','[]'::jsonb,
    'checkpoint',jsonb_build_object('books',jsonb_build_object(child,jsonb_set(book,'{allocations}','[{"id":"zero-origin","lots":[]}]'))));
  lot:='{"earningId":"source","cents":1,"eligible":true,"earnedAt":"2026-11-01T00:00:00.000Z","matchAllocationId":"zero-origin"}';
  if p_where='free' then book:=jsonb_set(book,'{free}',jsonb_build_array(lot));
  elsif p_where='payment' then book:=jsonb_set(book,'{payouts}',jsonb_build_array(jsonb_build_object('id','payout','lots','[]'::jsonb,'payments',jsonb_build_array(jsonb_build_object('lots',jsonb_build_array(lot))))));
  elsif p_where='hidden' then book:=jsonb_set(book,'{matches}','[{"id":"private-provenance","allocationId":"zero-origin"}]');end if;
  new_state:=jsonb_build_object('events','[{}]'::jsonb,'checkpoint',jsonb_build_object('books',jsonb_build_object(child,book)));
  return app_private.finance_preserve_checkpoint_entities(old_state,new_state,'{}','[]','[]');
end $$;
select ok(pg_temp.cp_allocation_prune('empty'),'zero original allocation may prune while permanent identity and ledger remain');
select ok(pg_temp.cp_allocation_prune('hidden'),'hidden match provenance does not veto zero public allocation pruning');
select ok(not pg_temp.cp_allocation_prune('free'),'positive free-lot allocation reference prevents pruning');
select ok(not pg_temp.cp_allocation_prune('payment'),'positive paid-lot allocation reference prevents pruning');
select set_config('test.cp.old_fingerprint',pg_temp.cp_envelope(1)->>'fingerprint',true);
delete from auth.sessions where id='47000000-0000-0000-0000-000000000001';
select throws_ok($$select api.finance_archive_page(current_setting('test.cp.scope')::jsonb)$$,'42501','not authorized','archive page rechecks a revoked managed session');
select throws_ok($$select api.finance_commit(current_setting('test.cp.scope')::jsonb,'48000000-0000-0000-0000-000000000001',current_setting('test.cp.old_fingerprint'),0,'{}',null)$$,
  '42501','not authorized','historical replay never bypasses current session authority');
select * from finish();
rollback;
