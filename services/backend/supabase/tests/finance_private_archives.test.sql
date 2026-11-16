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
select ok((select count(*)=3 and bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relname in('finance_private_match_origins','finance_private_match_capsules','finance_private_match_residency')),'private match history and residency have RLS');
select ok(not has_table_privilege('service_role','app_private.finance_private_match_capsules','SELECT,INSERT,UPDATE,DELETE'),'service cannot bypass private archive guards');
select ok(not has_function_privilege('service_role','app_private.finance_commit_checkpoint_core(jsonb,uuid,text,bigint,jsonb,text)','EXECUTE'),'service cannot bypass private archive commit wrapper');
select ok(not has_function_privilege('authenticated','api.finance_private_match_lookup(jsonb,text)','EXECUTE'),'client cannot directly read private match capsule');

create function pg_temp.pm_scope(p_child boolean default false) returns jsonb language plpgsql as $$ begin
  perform pg_temp.cp_identify(case when p_child then '47000000-0000-0000-0000-000000000003'::uuid else '47000000-0000-0000-0000-000000000001'::uuid end);
  return api.finance_scope(current_setting('test.cp.family')::uuid,current_setting('test.cp.child')::uuid);
end $$;
create function pg_temp.pm_append(p_step int,p_action jsonb,p_child boolean default false,p_effects jsonb default '[]') returns jsonb language plpgsql as $$
declare scope jsonb:=pg_temp.pm_scope(p_child);loaded jsonb;event jsonb;operation uuid;result jsonb;begin
  operation:=('49000000-0000-0000-0000-'||lpad(p_step::text,12,'0'))::uuid;loaded:=api.finance_load(scope);
  event:=p_action||jsonb_build_object('id',(scope->>'actorId')||':'||operation::text,'childId',scope->>'childId','at',loaded->>'serverAt',
    'actor',case when p_child then jsonb_build_object('role','child','childId',scope->>'childId') else jsonb_build_object('role','parent') end,'effects',p_effects);
  result:=api.finance_commit(scope,operation,app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',p_action)),
    (loaded->>'revision')::bigint,jsonb_set(loaded->'state','{events}',(loaded->'state'->'events')||jsonb_build_array(event)),loaded->>'serverAt');
  if result->>'status'<>'committed' then raise exception 'private archive fixture append failed';end if;return event;
end $$;
do $$ declare event jsonb;allocation text:='47000000-0000-0000-0000-000000000003:49000000-0000-0000-0000-000000000004';m jsonb;book jsonb;begin
  perform pg_temp.pm_append(1,'{"kind":"create_goal","goalId":"private-archive-goal","title":"Fictional goal","targetCents":1000}',true);
  perform pg_temp.pm_append(2,'{"kind":"assign_chore","choreId":"private-archive-source","title":"Fictional chore","rewardCents":100,"dates":["2026-11-01"]}');
  event:=pg_temp.pm_append(3,'{"kind":"review_chore","occurrenceId":"private-archive-source:2026-11-01","decision":"approved"}');
  perform set_config('test.pm.approved_at',event->>'at',true);
  event:=pg_temp.pm_append(4,'{"kind":"allocate","goalId":"private-archive-goal","amountCents":100}',true,
    jsonb_build_array(jsonb_build_object('kind','match_committed','referenceId',allocation||':match','cents',100)));
  m:=jsonb_build_object('id',allocation||':match','goalId','private-archive-goal','allocationId',allocation,'cents',100,'activeCents',100,'fundedCents',100,
    'parentReportedFundingCents',100,'reconciledCents',0,'reversedCents',0,'correctionDueCents',100,'month',to_char((event->>'at')::timestamptz at time zone 'America/New_York','YYYY-MM'),
    'revealed',false,'createdAt',event->>'at','status','parent_reported_paid','sourceCents','{"private-archive-source:2026-11-01":100}'::jsonb,
    'invalidatedCents','{"private-archive-source:2026-11-01":100}'::jsonb,'eligibleBaseCents',100);
  perform pg_temp.pm_append(5,jsonb_build_object('kind','fund_match','matchId',m->>'id','amountCents',100,'method','cash','paidAt',event->>'at'));
  perform pg_temp.pm_append(6,'{"kind":"reverse_earning","occurrenceId":"private-archive-source:2026-11-01","note":"Fictional correction"}');
  book:=pg_temp.cp_book();book:=jsonb_set(book,'{goals}','[{"id":"private-archive-goal","title":"Fictional goal","targetCents":1000,"status":"active","heldCents":0,"locationLabel":""}]');
  book:=jsonb_set(book,'{occurrences}',jsonb_build_array(jsonb_build_object('id','private-archive-source:2026-11-01','choreId','private-archive-source','title','Fictional chore',
    'instructions','','dueDate','2026-11-01','rewardCents',100,'status','approved','note','','approvedAt',current_setting('test.pm.approved_at'),'reversed',true)));
  perform set_config('test.pm.book',book::text,true);perform set_config('test.pm.capsule',jsonb_build_object('version',1,'childId',current_setting('test.cp.child'),'match',m)::text,true);
end $$;
create function pg_temp.pm_checkpoint(p_step int,p_book jsonb,p_caps jsonb default '[]',p_hydrated jsonb default '[]') returns jsonb language plpgsql as $$
declare scope jsonb:=pg_temp.pm_scope();loaded jsonb;event jsonb;action jsonb;state jsonb;operation uuid;begin
  operation:=('49000000-0000-0000-0000-'||lpad(p_step::text,12,'0'))::uuid;loaded:=api.finance_load(scope);
  action:='{"kind":"configure_matching","rule":{"enabled":true,"percent":100,"monthlyCapCents":2000,"parentBudgetCents":2000,"surprise":true}}';
  event:=action||jsonb_build_object('id',(scope->>'actorId')||':'||operation::text,'childId',scope->>'childId','at',loaded->>'serverAt','actor','{"role":"parent"}'::jsonb,'effects','[]'::jsonb);
  state:=jsonb_set(loaded->'state','{events}','[]');state:=jsonb_set(state,'{checkpoint}',jsonb_build_object('version',1,'lastEventAt',event->>'at',
    'books',jsonb_build_object(scope->>'childId',p_book),'activity',jsonb_build_object(scope->>'childId',jsonb_build_object('visible','[]'::jsonb,'parent','[]'::jsonb))));
  return api.finance_commit(scope,operation,app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',action)),
    (loaded->>'revision')::bigint,jsonb_build_object('state',state,'event',event,'previousStateHash',loaded->>'stateHash','privateCapsules',p_caps,'hydratedPrivateCapsules',p_hydrated),event->>'at');
end $$;
create function pg_temp.pm_basis(p_amount int,p_revealed int default 0) returns jsonb language sql as $$
  select jsonb_build_object('month',current_setting('test.pm.capsule')::jsonb->'match'->>'month','usedCents',p_amount,'byGoal',case when p_amount=0 then '{}'::jsonb
    else jsonb_build_object('private-archive-goal',jsonb_build_object('activeCents',p_amount,'fundedCents',p_amount,'revealedFundedCents',p_revealed)) end)
$$;
select ok(app_private.finance_private_capsule_safe(current_setting('test.pm.capsule')::jsonb,current_setting('test.cp.child')::uuid),'fully invalidated funded match is eligible');
select ok(not app_private.finance_private_capsule_safe(jsonb_set(current_setting('test.pm.capsule')::jsonb,'{match,invalidatedCents}','{}'),current_setting('test.cp.child')::uuid),'partly invalidated source cannot retire');
select ok(not app_private.finance_private_capsule_safe(jsonb_set(current_setting('test.pm.capsule')::jsonb,'{match,correctionDueCents}','0'),current_setting('test.cp.child')::uuid),'unsettled funded correction cannot retire');
select throws_ok($$select pg_temp.pm_checkpoint(7,current_setting('test.pm.book')::jsonb,jsonb_build_array(current_setting('test.pm.capsule')::jsonb))$$,
  '22023','private archive basis required','cannot publish archive without exact folded summary');
select is(pg_temp.pm_checkpoint(7,jsonb_set(current_setting('test.pm.book')::jsonb,'{archivedMatches}',pg_temp.pm_basis(100)),jsonb_build_array(current_setting('test.pm.capsule')::jsonb))->>'status','committed','parent atomically publishes immutable private capsule and exact folded basis');
select is((select count(*)::int from app_private.finance_private_match_capsules where family_id=current_setting('test.cp.family')::uuid),1,'one immutable capsule version persisted');
select is(jsonb_array_length(api.finance_archive_page(pg_temp.pm_scope())->'items'),0,'hidden-only checkpoint leaves visible archive stream empty');
select is(jsonb_array_length(api.finance_private_match_page(pg_temp.pm_scope())->'items'),1,'parent private page contains active capsule');
select set_config('test.pm.lookup',api.finance_private_match_lookup(pg_temp.pm_scope(),current_setting('test.pm.capsule')::jsonb->'match'->>'id')::text,true);
select is(current_setting('test.pm.lookup')::jsonb->'capsule',current_setting('test.pm.capsule')::jsonb,'private lookup returns exact current payload');
select throws_ok($$select api.finance_private_match_page(pg_temp.pm_scope(true))$$,'42501','not authorized','child cannot list private matches');
select throws_ok($$select api.finance_private_match_lookup(pg_temp.pm_scope(true),'unknown')$$,'42501','not authorized','child cannot distinguish unknown private match');
select throws_ok($$select api.finance_private_match_page(pg_temp.pm_scope(),null,51)$$,'22023','invalid private archive page','private page is bounded');
select throws_ok($$select api.finance_private_match_page(pg_temp.pm_scope(),'ffffffff-ffff-ffff-ffff-ffffffffffff')$$,'22023','invalid private archive page','private page anchor is scoped');
select throws_ok($$select pg_temp.pm_checkpoint(8,jsonb_set(current_setting('test.pm.book')::jsonb,'{archivedMatches}',pg_temp.pm_basis(0)),
  '[]',jsonb_build_array(jsonb_build_object('id',current_setting('test.pm.lookup')::jsonb->>'id','hash',repeat('0',64))))$$,'22023','private archive hydration conflict','wrong hash cannot consume active version');
do $$ declare b jsonb;refs jsonb;begin
  b:=jsonb_set(current_setting('test.pm.book')::jsonb,'{archivedMatches}',pg_temp.pm_basis(0));b:=jsonb_set(b,'{matches}',jsonb_build_array(current_setting('test.pm.capsule')::jsonb->'match'));
  refs:=jsonb_build_array(current_setting('test.pm.lookup')::jsonb-array['capsule','revision','stateHash']);
  perform set_config('test.pm.refs',refs::text,true);perform set_config('test.pm.hydrated_book',b::text,true);
end $$;
select is(pg_temp.pm_checkpoint(8,current_setting('test.pm.hydrated_book')::jsonb,'[]',current_setting('test.pm.refs')::jsonb)->>'status','committed','hydration consumes exact active version and subtracts summary once');
select is(api.finance_private_match_lookup(pg_temp.pm_scope(),current_setting('test.pm.capsule')::jsonb->'match'->>'id'),null::jsonb,'inactive version is not returned as current');
select is(jsonb_array_length(api.finance_private_match_page(pg_temp.pm_scope())->'items'),0,'hydrated version disappears from current page');
select throws_ok($$select pg_temp.pm_checkpoint(9,current_setting('test.pm.hydrated_book')::jsonb,'[]',current_setting('test.pm.refs')::jsonb)$$,'22023','private archive hydration conflict','duplicate hydration cannot subtract twice');
select is(pg_temp.pm_checkpoint(9,jsonb_set(current_setting('test.pm.book')::jsonb,'{archivedMatches}',pg_temp.pm_basis(100)),jsonb_build_array(current_setting('test.pm.capsule')::jsonb))->>'status','committed','rearchive appends another immutable version');
select is((select count(*)::int from app_private.finance_private_match_capsules where family_id=current_setting('test.cp.family')::uuid),2,'both historical private versions retained');
select is((select count(*)::int from app_private.finance_private_match_capsules c join app_private.finance_private_match_residency r on r.capsule_id=c.id and r.active where c.family_id=current_setting('test.cp.family')::uuid),1,'exactly one current private version');
select throws_ok($$delete from app_private.finance_private_match_capsules where family_id=current_setting('test.cp.family')::uuid$$,'42501','financial history is append-only','private payload history cannot be deleted');
select throws_ok($$delete from app_private.finance_private_match_origins where family_id=current_setting('test.cp.family')::uuid$$,'42501','financial history is append-only','private used identity survives forever');
create function pg_temp.pm_corrupt_read(p_page boolean) returns jsonb language plpgsql as $$ begin
  -- Test-only mutation is confined to this transaction's fictional family and rolls back on the expected exception.
  alter table app_private.finance_private_match_capsules disable trigger immutable_history;
  update app_private.finance_private_match_capsules set hash=repeat('0',64) where family_id=current_setting('test.cp.family')::uuid;
  if p_page then return api.finance_private_match_page(pg_temp.pm_scope());end if;
  return api.finance_private_match_lookup(pg_temp.pm_scope(),current_setting('test.pm.capsule')::jsonb->'match'->>'id');
end $$;
select throws_ok($$select pg_temp.pm_corrupt_read(true)$$,'XX001','financial data unavailable','private page fails closed on corrupt stored payload hash');
select throws_ok($$select pg_temp.pm_corrupt_read(false)$$,'XX001','financial data unavailable','private lookup fails closed on corrupt stored payload hash');
delete from auth.sessions where id='47000000-0000-0000-0000-000000000001';
select throws_ok($$select api.finance_private_match_page(current_setting('test.cp.scope')::jsonb)$$,'42501','not authorized','private archive page rechecks revoked session');
select * from finish();
rollback;
