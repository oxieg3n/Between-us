begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok((select count(*)=2 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relname in('finance_activity','finance_projection_snapshots')),'captured financial tables both require RLS');
select ok(not has_table_privilege('authenticated','app_private.finance_activity','SELECT,INSERT,UPDATE,DELETE'),'client has no raw activity authority');
select ok(not has_table_privilege('service_role','app_private.finance_projection_snapshots','SELECT,INSERT,UPDATE,DELETE'),'service cannot bypass snapshot capture RPC');
select ok(not has_function_privilege('service_role','app_private.finance_commit_archive_core(jsonb,uuid,text,bigint,jsonb,text)','EXECUTE'),'029 inner commit cannot bypass capture wrapper');
select ok(not has_function_privilege('authenticated','api.privacy_finance_sources(uuid,uuid)','EXECUTE'),'child cannot fetch operator-only raw current state');
select ok(not has_function_privilege('authenticated','api.attach_privacy_finance_projection(uuid,uuid,text,jsonb)','EXECUTE'),'client cannot publish its own export projection');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
update app_private.privacy_lifecycle_policy set execution_enabled=true,synthetic_fixture_mode=true,
  reviewed_policy_id='fixture:finance-archive-export',reauth_methods=array['synthetic_fixture'] where singleton;
create function pg_temp.fp_identify(p_user uuid) returns void language plpgsql as $$begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'session_id',p_user,'role','authenticated',
    'exp',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true);
end $$;
do $$declare v_user uuid;v_email text;token text;family uuid;child uuid;consent uuid;material jsonb;begin
  for v_user,v_email in select * from(values
    ('79000000-0000-0000-0000-000000000001'::uuid,'archive-export-parent@fixture.test'),
    ('79000000-0000-0000-0000-000000000003'::uuid,'archive-export-operator@fixture.test'),
    ('79000000-0000-0000-0000-000000000004'::uuid,'archive-export-unassigned@fixture.test')) people(id,email) loop
    token:=app_private.issue_parent_registration(v_email)->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(v_user,v_email,clock_timestamp(),jsonb_build_object('registration_token',token),clock_timestamp(),clock_timestamp());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(v_user,v_user,clock_timestamp(),clock_timestamp());
    perform pg_temp.fp_identify(v_user);perform api.bootstrap_parent('Fictional export adult');
  end loop;
  insert into app_private.operators(user_id,scope,active) values
    ('79000000-0000-0000-0000-000000000003','consent',true),('79000000-0000-0000-0000-000000000003','privacy',true),
    ('79000000-0000-0000-0000-000000000004','privacy',true),('79000000-0000-0000-0000-000000000001','privacy',true);
  perform pg_temp.fp_identify('79000000-0000-0000-0000-000000000001');
  family:=api.create_family('Fictional export family','UTC');child:=api.create_child(family,'Fictional export child');
  consent:=api.request_child_consent(child,'synthetic-v1','synthetic-v1');
  perform pg_temp.fp_identify('79000000-0000-0000-0000-000000000003');
  perform api.verify_child_consent(consent,'synthetic_fixture','fixture:independent-consent',clock_timestamp()+interval '1 day');
  perform pg_temp.fp_identify('79000000-0000-0000-0000-000000000001');
  material:=api.begin_child_enrollment(child);v_user:='79000000-0000-0000-0000-000000000002';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(v_user,material->>'email',clock_timestamp(),jsonb_build_object('registration_token',material->>'token'),clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(v_user,v_user,clock_timestamp(),clock_timestamp());
  perform pg_temp.fp_identify(v_user);perform api.accept_child_enrollment(material->>'token');
  perform set_config('test.fp.family',family::text,true);perform set_config('test.fp.child',child::text,true);
  perform set_config('test.fp.day',to_char((clock_timestamp() at time zone 'UTC')+interval '1 day','YYYY-MM-DD'),true);
  perform pg_temp.fp_identify('79000000-0000-0000-0000-000000000001');
  perform set_config('test.fp.scope',api.finance_scope(family,child)::text,true);
end $$;

-- Tiny trusted-engine fixture: plan -> assignment -> cancellation/archive, then hidden
-- rule and visible plan commands. Arithmetic tests belong to the independent pure suite.
create function pg_temp.fp_commit(p_step integer,p_capture boolean default true,p_bad boolean default false,p_stale boolean default false) returns jsonb
language plpgsql as $$
declare scope jsonb:=current_setting('test.fp.scope')::jsonb;loaded jsonb;action jsonb;event jsonb;entry jsonb;
  plan jsonb;rule jsonb;book jsonb;occ jsonb;state jsonb;view jsonb;parent_view jsonb;visible jsonb;all_activity jsonb;capsules jsonb:='[]';
  envelope jsonb;operation uuid;at text;day text;child text:=current_setting('test.fp.child');assigned jsonb;occurrences jsonb;dates jsonb;batch integer;
  books jsonb;caches jsonb;roster_child jsonb;begin
  loaded:=api.finance_load(scope);at:=loaded->>'serverAt';day:=current_setting('test.fp.day');
  operation:=('7a000000-0000-0000-0000-'||lpad(p_step::text,12,'0'))::uuid;
  plan:=jsonb_build_object('budgetCents',5000,'period','monthly','anchorDate','2026-11-01','payoutCadence','per_task','minimumPayoutCents',0,'allowGoalRelease',true);
  rule:=coalesce(loaded->'state'->'checkpoint'->'books'->child->'matchingRule',jsonb_build_object('enabled',false,'percent',100,'monthlyCapCents',2000,'parentBudgetCents',2000,'surprise',true));
  if p_step=4 then rule:=jsonb_set(rule,'{enabled}','true');end if;
  batch:=case p_step when 2 then 0 when 6 then 25 when 7 then 50 when 8 then 75 else null end;
  if batch is not null then select jsonb_agg((day::date+n)::text order by n) into dates from generate_series(batch,batch+24) n;end if;
  action:=case when batch is not null then jsonb_build_object('kind','assign_chore','choreId','fixture-task-'||batch,'title','Fictional task','rewardCents',100,'dates',dates)
    when p_step=3 then jsonb_build_object('kind','close_chore','occurrenceId','fixture-task-0:'||day,'status','cancelled','note','Fictional closure')
    when p_step=4 then jsonb_build_object('kind','configure_matching','rule',rule) else jsonb_build_object('kind','configure_plan','plan',plan) end;
  event:=action||jsonb_build_object('id',(scope->>'actorId')||':'||operation::text,'childId',child,'at',at,'actor',jsonb_build_object('role','parent'),'effects','[]'::jsonb);
  entry:=jsonb_build_object('id',event->>'id','at',at,'actorRole','parent','referenceId',case when batch is not null then 'fixture-task-'||batch when p_step=3 then 'fixture-task-0:'||day else child end,
    'label',case when batch is not null then 'Chore assigned' when p_step=3 then 'Chore closed' when p_step=4 then 'Prospective matching rule updated' else 'Allowance plan updated' end);
  if batch is not null then entry:=entry||jsonb_build_object('amountCents',100);elsif p_step=3 then entry:=entry||jsonb_build_object('note','Fictional closure');
  elsif p_step<>4 then entry:=entry||jsonb_build_object('amountCents',5000);end if;
  if p_bad then entry:=jsonb_set(entry,'{label}','"Wrong accepted-event label"');end if;
  select coalesce(jsonb_agg(activity order by sequence),'[]') into all_activity from(select activity,sequence from app_private.finance_activity where family_id=(scope->>'familyId')::uuid and child_id=child::uuid order by sequence desc limit 99) recent;
  all_activity:=all_activity||jsonb_build_array(entry);
  select coalesce(jsonb_agg(activity order by sequence),'[]') into visible from(select activity,sequence from app_private.finance_activity where family_id=(scope->>'familyId')::uuid and child_id=child::uuid
    and kind not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match') order by sequence desc limit case when p_step=4 then 100 else 99 end) recent;
  if p_step<>4 then visible:=visible||jsonb_build_array(entry);end if;
  occurrences:=coalesce(loaded->'state'->'checkpoint'->'books'->child->'occurrences','[]');
  if batch is not null then
    select jsonb_agg(jsonb_build_object('id','fixture-task-'||batch||':'||d,'choreId','fixture-task-'||batch,'title','Fictional task','instructions','',
      'dueDate',d,'rewardCents',100,'status','not_started','note','','recurrence','once','evidenceRequired',false) order by d) into assigned from jsonb_array_elements_text(dates) d;
    occurrences:=occurrences||assigned;
  elsif p_step=3 then
    select o||jsonb_build_object('status','cancelled','note','Fictional closure') into occ from jsonb_array_elements(occurrences) o where o->>'id'='fixture-task-0:'||day;
    select coalesce(jsonb_agg(o order by ord),'[]') into occurrences from jsonb_array_elements(occurrences) with ordinality items(o,ord) where o->>'id'<>'fixture-task-0:'||day;
  end if;
  book:=jsonb_build_object('plan',plan,'occurrences',occurrences,'goals','[]'::jsonb,
    'free','[]'::jsonb,'allocations','[]'::jsonb,'payouts','[]'::jsonb,'matches','[]'::jsonb,'savingsRules','[]'::jsonb,
    'matchingRule',rule,'earnedCents',0,'correctionDueCents',0,'archivedPaidCents',0);
  if p_step=3 or(loaded->'state'->'checkpoint'->'books'->child)?'archivedBudget' then
    book:=book||jsonb_build_object('archivedBudget',jsonb_build_object('period','monthly','anchorDate','2026-11-01','maximumCents',0,
      'byPeriod',coalesce((select jsonb_object_agg(period_key,0) from(select distinct substr(o->>'dueDate',1,7) as period_key from jsonb_array_elements(occurrences) o) periods),'{}'),
      'excludedOccurrenceIds','[]'::jsonb));end if;
  if p_step=3 then capsules:=jsonb_build_array(jsonb_build_object('version',1,'childId',child,'occurrences',jsonb_build_array(occ),'payouts','[]'::jsonb,'allocations','[]'::jsonb,'paidCents',0));end if;
  books:=coalesce(loaded->'state'->'checkpoint'->'books','{}')||jsonb_build_object(child,book);
  caches:=coalesce(loaded->'state'->'checkpoint'->'activity','{}')||jsonb_build_object(child,jsonb_build_object('visible',visible,'parent',all_activity));
  for roster_child in select * from jsonb_array_elements(loaded->'state'->'children') loop
    if not(books ? (roster_child->>'id')) then
      books:=books||jsonb_build_object(roster_child->>'id',jsonb_build_object('occurrences','[]'::jsonb,'goals','[]'::jsonb,'free','[]'::jsonb,
        'allocations','[]'::jsonb,'payouts','[]'::jsonb,'matches','[]'::jsonb,'savingsRules','[]'::jsonb,
        'matchingRule',jsonb_build_object('enabled',false,'percent',100,'monthlyCapCents',2000,'parentBudgetCents',2000,'surprise',true),
        'earnedCents',0,'correctionDueCents',0,'archivedPaidCents',0));
    end if;
    if not(caches ? (roster_child->>'id')) then caches:=caches||jsonb_build_object(roster_child->>'id',jsonb_build_object('visible','[]'::jsonb,'parent','[]'::jsonb));end if;
  end loop;
  state:=jsonb_build_object('timezone','UTC','children',loaded->'state'->'children','events','[]'::jsonb,
    'checkpoint',jsonb_build_object('version',1,'lastEventAt',at,'books',books,'activity',caches));
  view:=jsonb_build_object('childId',child,'childName','Fictional export child','timezone','UTC','plan',plan,'occurrences',book->'occurrences','goals','[]'::jsonb,
    'savingsRules','[]'::jsonb,'payouts','[]'::jsonb,'activity',visible,'balances',jsonb_build_object('plannedCents',coalesce((select sum((o->>'rewardCents')::integer) from jsonb_array_elements(occurrences) o where o->>'status' in('not_started','needs_retry')),0),
      'pendingCents',0,'earnedCents',0,'availableCents',0,'earmarkedCents',0,'heldPayoutCents',0,'paidCents',0,'unpaidCents',0,'correctionDueCents',0),
    'payout',jsonb_build_object('due',false,'eligibleCents',0,'periodKey','per_task','label','Manual execution only; schedules are payment reminders.'));
  parent_view:=jsonb_set(view,'{activity}',all_activity)||jsonb_build_object('matching',jsonb_build_object('rule',rule,'commitments','[]'::jsonb,
    'month',substr(at,1,7),'usedCents',0,'remainingCents',2000,'parentBudgetRemainingCents',2000));
  envelope:=jsonb_build_object('state',state,'event',event,'previousStateHash',loaded->>'stateHash','capsules',capsules,'hydratedCapsules','[]'::jsonb,
    'privateCapsules','[]'::jsonb,'hydratedPrivateCapsules','[]'::jsonb);
  if p_capture then envelope:=envelope||jsonb_build_object('eventActivity',entry,'coveredActivity','[]'::jsonb,'childProjection',view,'parentProjection',parent_view);end if;
  return api.finance_commit(scope,operation,app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',child,'action',action)),
    (loaded->>'revision')::bigint-case when p_stale then 1 else 0 end,envelope,at);
end $$;
create function pg_temp.fp_job(p_user uuid,p_nonce integer) returns uuid language plpgsql as $$declare job uuid;begin
  perform pg_temp.fp_identify(p_user);perform api.record_privacy_reauthentication(p_user,p_user,'synthetic_fixture','fixture:own-step-up');
  job:=(api.request_own_export(('7b000000-0000-0000-0000-'||lpad(p_nonce::text,12,'0'))::uuid)->>'id')::uuid;
  perform api.review_privacy_job(job,'79000000-0000-0000-0000-000000000003','approve','fixture:independent-review');
  perform api.execute_privacy_job(job,'79000000-0000-0000-0000-000000000003');return job;
end $$;
create function pg_temp.fp_merge(p_source jsonb) returns jsonb language sql as $$
  select jsonb_set(jsonb_set(jsonb_set(p_source->'projection','{occurrences}',
    (select coalesce(jsonb_agg(o order by o->>'id' collate "C"),'[]') from jsonb_array_elements((p_source->'projection'->'occurrences')||(p_source->'archivedOccurrences')) o)),
    '{payouts}',(select coalesce(jsonb_agg(p order by p->>'id' collate "C"),'[]') from jsonb_array_elements((p_source->'projection'->'payouts')||(p_source->'archivedPayouts')) p)),
    '{activity}',p_source->'activity')
$$;

select is(pg_temp.fp_commit(1)->>'status','committed','capture wrapper accepts exact trusted plan activity and snapshots');
select is(pg_temp.fp_commit(2)->>'status','committed','exact assignment activity is captured before hot retirement');
select is(pg_temp.fp_commit(6)->>'status','committed','second assignment adds25 valid future occurrences');
select is(pg_temp.fp_commit(7)->>'status','committed','third assignment remains within31-date action bound');
select is(pg_temp.fp_commit(8)->>'status','committed','fourth assignment reaches real100-occurrence archive threshold');
select is(pg_temp.fp_commit(3)->>'status','committed','cancellation and visible archive publish atomically with complete activity');
select is((select count(*)::int from app_private.finance_activity where family_id=current_setting('test.fp.family')::uuid),6,'all original activity rows retained after checkpoint clears the tail');
select is((select count(*)::int from app_private.finance_archive_capsules where family_id=current_setting('test.fp.family')::uuid),1,'real source-bound cancelled occurrence capsule positive control');
select ok(not app_private.finance_export_legacy('79000000-0000-0000-0000-000000000002'),'checkpoint/archive forbids hot-only legacy fallback');
select throws_ok($$select pg_temp.fp_commit(4,true,true)$$,'22023','activity does not bind its accepted event','bad activity rolls back original event/checkpoint write');
select is((select count(*)::int from app_private.finance_events where family_id=current_setting('test.fp.family')::uuid),6,'failed capture leaves no accepted command/event');
select is(pg_temp.fp_commit(4,true,false,true)->>'status','conflict','stale CAS returns before capture writes');
select is((select count(*)::int from app_private.finance_activity where family_id=current_setting('test.fp.family')::uuid),6,'CAS conflict adds no audit row');
do $$declare job uuid;begin
  job:=pg_temp.fp_job('79000000-0000-0000-0000-000000000002',1);perform set_config('test.fp.child_job',job::text,true);
  perform set_config('test.fp.source_before',api.privacy_finance_sources(job,'79000000-0000-0000-0000-000000000003')::text,true);
end $$;
select is(current_setting('test.fp.source_before')::jsonb->>'status','partial_ready','captured child source remains partial until explicit safe attachment');
select is(jsonb_array_length(current_setting('test.fp.source_before')::jsonb->'archivedOccurrences'),1,'child source includes retired visible occurrence');
select is(jsonb_array_length(current_setting('test.fp.source_before')::jsonb->'activity'),6,'complete visible activity is not the bounded hot tail/cache');
select throws_ok($$select api.privacy_finance_sources(current_setting('test.fp.child_job')::uuid,'79000000-0000-0000-0000-000000000004')$$,'42501','not authorized','unassigned independent operator cannot obtain source');
select throws_ok($$select api.privacy_finance_sources(current_setting('test.fp.child_job')::uuid,'79000000-0000-0000-0000-000000000001')$$,'42501','not authorized','guardian operator never inherits child own-export authority');
select is(pg_temp.fp_commit(4)->>'status','committed','private-only rule update captured in same transaction');
select is(pg_temp.fp_commit(4)->>'status','replayed','same original command replay cannot rewrite capture');
select is((select count(*)::int from app_private.finance_activity where family_id=current_setting('test.fp.family')::uuid),7,'private command replay remains one immutable activity row');
do $$begin perform set_config('test.fp.source_after',api.privacy_finance_sources(current_setting('test.fp.child_job')::uuid,'79000000-0000-0000-0000-000000000003')::text,true);end $$;
select is(current_setting('test.fp.source_after')::jsonb->>'sourceHash',current_setting('test.fp.source_before')::jsonb->>'sourceHash','child logical stamp ignores properly captured hidden revision/rule/global sequence');
select is(current_setting('test.fp.source_after')::jsonb->>'serverAt',current_setting('test.fp.source_before')::jsonb->>'serverAt','unchanged child logical source retains its recorded temporal projection time');
select is(jsonb_array_length(current_setting('test.fp.source_after')::jsonb->'activity'),6,'hidden activity filtered before child source counts');
select ok(app_private.finance_export_safe(pg_temp.fp_merge(current_setting('test.fp.source_after')::jsonb)),'merged child artifact has no source lots/effects/hashes/private matching');
select is(api.attach_privacy_finance_projection(current_setting('test.fp.child_job')::uuid,'79000000-0000-0000-0000-000000000003',
  current_setting('test.fp.source_before')::jsonb->>'sourceHash',pg_temp.fp_merge(current_setting('test.fp.source_after')::jsonb))->>'status','ready','old unchanged visible stamp attaches complete archive after private-only update');
set local role authenticated;
select pg_temp.fp_identify('79000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(api.get_own_export(current_setting('test.fp.child_job')::uuid)->'data'->'finance'->0->'occurrences'),100,'own artifact contains all99 hot and1 archived occurrence');
select pg_temp.fp_identify('79000000-0000-0000-0000-000000000001');
select throws_ok($$select api.get_own_export(current_setting('test.fp.child_job')::uuid)$$,'42501','not authorized','guardian cannot fetch another author own-privacy artifact');
reset role;

create temporary table fp_snapshot_saved as select * from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid;
update app_private.finance_projection_snapshots set child_projection=jsonb_set(child_projection,'{balances,paidCents}','1') where family_id=current_setting('test.fp.family')::uuid;
select throws_ok($$select app_private.finance_export_scope(current_setting('test.fp.family')::uuid,current_setting('test.fp.child')::uuid,false)$$,
  'XX001','financial snapshot unavailable','safe-shaped but wrong-hash balance does not become a new trusted source');
update app_private.finance_projection_snapshots s set child_projection=old.child_projection from fp_snapshot_saved old where s.family_id=old.family_id and s.child_id=old.child_id;
update app_private.finance_projection_snapshots set parent_projection_hash=repeat('0',64) where family_id=current_setting('test.fp.family')::uuid;
select lives_ok($$select app_private.finance_export_scope(current_setting('test.fp.family')::uuid,current_setting('test.fp.child')::uuid,false)$$,'parent-only snapshot corruption does not invalidate child logical stamp');
select throws_ok($$select app_private.finance_export_scope(current_setting('test.fp.family')::uuid,current_setting('test.fp.child')::uuid,true)$$,
  'XX001','financial snapshot unavailable','parent snapshot checks its own trusted hash');
update app_private.finance_projection_snapshots s set parent_projection_hash=old.parent_projection_hash from fp_snapshot_saved old where s.family_id=old.family_id and s.child_id=old.child_id;
select lives_ok($$select app_private.finance_export_scope(current_setting('test.fp.family')::uuid,current_setting('test.fp.child')::uuid,true)$$,'parent typed scope source positive control before job attachment');
select lives_ok($$select app_private.finance_export_parent_bundle('79000000-0000-0000-0000-000000000001')$$,'parent logical bundle positive control before job attachment');
do $$declare job uuid;source jsonb;begin
  job:=pg_temp.fp_job('79000000-0000-0000-0000-000000000001',2);perform set_config('test.fp.parent_job',job::text,true);
  source:=api.privacy_parent_finance_sources(job,'79000000-0000-0000-0000-000000000003');perform set_config('test.fp.parent_source',source::text,true);
end $$;
select is(current_setting('test.fp.parent_source')::jsonb->>'status','partial_ready','parent source remains eligible for explicit attachment');
select is(jsonb_array_length(current_setting('test.fp.parent_source')::jsonb->'scopes'->0->'activity'),7,'authorized parent source includes full private and visible activity');
select ok(not((current_setting('test.fp.parent_source')::jsonb->'scopes'->0)?'logicalProjection'),'operator DTO does not confuse internal logical stamp payload with artifact');
select lives_ok($$select api.attach_privacy_parent_finance_projections(current_setting('test.fp.parent_job')::uuid,'79000000-0000-0000-0000-000000000003',
  current_setting('test.fp.parent_source')::jsonb->>'sourceHash',jsonb_build_array(jsonb_build_object('familyId',current_setting('test.fp.family'),
    'childId',current_setting('test.fp.child'),'view',pg_temp.fp_merge(current_setting('test.fp.parent_source')::jsonb->'scopes'->0))))$$,'authorized parent complete archive attachment stays role-safe');
select is((select status from app_private.privacy_lifecycle_jobs where id=current_setting('test.fp.parent_job')::uuid),'ready','parent attachment actually reaches ready');
do $$declare child uuid;begin
  perform pg_temp.fp_identify('79000000-0000-0000-0000-000000000001');
  child:=api.create_child(current_setting('test.fp.family')::uuid,'Fictional later child');perform set_config('test.fp.later_child',child::text,true);
  perform set_config('test.fp.state_before_roster_source',(select state::text from app_private.finance_aggregates where family_id=current_setting('test.fp.family')::uuid),true);
end $$;
select is(jsonb_array_length(app_private.finance_export_current_state(current_setting('test.fp.family')::uuid)->'children'),2,'server-only source includes the newly authorized child in its local roster');
select is((select state from app_private.finance_aggregates where family_id=current_setting('test.fp.family')::uuid),current_setting('test.fp.state_before_roster_source')::jsonb,'privacy source roster projection does not write or reindex the financial aggregate');
select lives_ok($$select app_private.finance_export_parent_bundle('79000000-0000-0000-0000-000000000001')$$,'empty newly authorized child can be projected beside an older checkpoint subset');
-- Simulate a pre-029 sibling with complete immutable audit but no derived snapshot.
-- Removing this mutable cache never removes a financial event, command or checkpoint.
create temporary table fp_legacy_saved as select * from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid;
delete from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid;
do $$declare loaded jsonb;begin
  loaded:=api.finance_load(current_setting('test.fp.scope')::jsonb);perform set_config('test.fp.legacy_load',loaded::text,true);
  perform set_config('test.fp.legacy_counts',jsonb_build_object('events',(select count(*) from app_private.finance_events where family_id=current_setting('test.fp.family')::uuid),
    'commands',(select count(*) from app_private.finance_commands where family_id=current_setting('test.fp.family')::uuid),
    'checkpoints',(select count(*) from app_private.finance_checkpoints where family_id=current_setting('test.fp.family')::uuid),
    'revision',loaded->'revision','stateHash',loaded->>'stateHash')::text,true);
end $$;
create function pg_temp.fp_warm(p_revision_offset integer default 0,p_wrong_child boolean default false,p_own_child boolean default false) returns jsonb language sql as $$
  select api.finance_capture_legacy_snapshot(case when p_own_child then current_setting('test.fp.scope')::jsonb||jsonb_build_object('role','child','actorId','79000000-0000-0000-0000-000000000002','sessionId','79000000-0000-0000-0000-000000000002') else current_setting('test.fp.scope')::jsonb end,
    (current_setting('test.fp.legacy_load')::jsonb->>'revision')::bigint+p_revision_offset,current_setting('test.fp.legacy_load')::jsonb->>'stateHash',
    case when p_wrong_child then jsonb_set(child_projection,'{childId}',to_jsonb(current_setting('test.fp.later_child'))) else child_projection end,parent_projection) from fp_legacy_saved
$$;
select ok((current_setting('test.fp.legacy_load')::jsonb->>'legacyProjectionMissing')::boolean,'authorized load flags absent snapshot using bounded metadata probes');
select is(pg_temp.fp_warm(1)->>'status','conflict','snapshot warm requires current aggregate revision and hash');
select is((select api.finance_capture_legacy_snapshot(current_setting('test.fp.scope')::jsonb,(current_setting('test.fp.legacy_load')::jsonb->>'revision')::bigint,repeat('0',64),child_projection,parent_projection)->>'status' from fp_legacy_saved),'conflict','correct revision with wrong source hash cannot warm a snapshot');
select throws_ok($$select pg_temp.fp_warm(0,true)$$,'22023','complete safe financial projection capture required','snapshot warm rejects a projection for another child');
select throws_ok($$select api.finance_capture_legacy_snapshot(current_setting('test.fp.scope')::jsonb||jsonb_build_object('role','child','actorId','79000000-0000-0000-0000-000000000002','sessionId','79000000-0000-0000-0000-000000000002','childId',current_setting('test.fp.later_child')),
  0,repeat('0',64),'{}','{}')$$,'42501','not authorized','own child scope cannot capture a sibling snapshot');
select is(pg_temp.fp_warm(0,false,true)->>'status','captured','own-child authorized scope permits trusted derived-only warming with complete bounded legacy audit');
select is(jsonb_build_object('events',(select count(*) from app_private.finance_events where family_id=current_setting('test.fp.family')::uuid),
  'commands',(select count(*) from app_private.finance_commands where family_id=current_setting('test.fp.family')::uuid),
  'checkpoints',(select count(*) from app_private.finance_checkpoints where family_id=current_setting('test.fp.family')::uuid),
  'revision',(select to_jsonb(revision) from app_private.finance_aggregates where family_id=current_setting('test.fp.family')::uuid),
  'stateHash',(select app_private.finance_state_hash(state) from app_private.finance_aggregates where family_id=current_setting('test.fp.family')::uuid)),current_setting('test.fp.legacy_counts')::jsonb,'warming changes no financial event, command, checkpoint, revision or aggregate content');
select ok(not(api.finance_load(current_setting('test.fp.scope')::jsonb)->>'legacyProjectionMissing')::boolean,'authorized subsequent load sees the derived cache');
select lives_ok($$select app_private.finance_export_parent_bundle('79000000-0000-0000-0000-000000000001')$$,'warmed historical child is available to complete parent export sources');
select is(pg_temp.fp_warm()->>'status','present','duplicate warm cannot overwrite an existing snapshot');
select is((select api.finance_capture_legacy_snapshot(current_setting('test.fp.scope')::jsonb,
  (current_setting('test.fp.legacy_load')::jsonb->>'revision')::bigint,current_setting('test.fp.legacy_load')::jsonb->>'stateHash',
  jsonb_set(child_projection,'{balances,paidCents}','1'),parent_projection)->>'status' from fp_legacy_saved),'present','changed candidate cannot replace a present derived snapshot');
select is((select child_projection_hash from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid),
  (select child_projection_hash from fp_legacy_saved),'present snapshot retains its original captured contents');
select is(pg_temp.fp_warm()-'status','{}'::jsonb,'capture returns status only, never the server-computed parent projection');
update app_private.finance_projection_snapshots set child_projection_hash=repeat('0',64) where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid;
select throws_ok($$select pg_temp.fp_warm()$$,'XX001','financial snapshot unavailable','cache warm never repairs or overwrites a corrupt existing snapshot');
update app_private.finance_projection_snapshots s set child_projection_hash=old.child_projection_hash from fp_legacy_saved old where s.family_id=old.family_id and s.child_id=old.child_id;
select ok(not has_function_privilege('authenticated','api.finance_capture_legacy_snapshot(jsonb,bigint,text,jsonb,jsonb)','EXECUTE'),'ordinary child cannot obtain or submit parent DTO through capture RPC');
select ok(not has_table_privilege('authenticated','app_private.finance_projection_snapshots','SELECT'),'ordinary child cannot read cached parent projections directly');
select ok(not has_function_privilege('service_role','app_private.finance_load_archive_core(jsonb,uuid,text)','EXECUTE'),'old load alias remains private behind authorized metadata wrapper');
do $$declare job uuid;source jsonb;begin
  job:=pg_temp.fp_job('79000000-0000-0000-0000-000000000002',3);source:=api.privacy_finance_sources(job,'79000000-0000-0000-0000-000000000003');
  update app_private.privacy_lifecycle_jobs set artifact=jsonb_set(artifact,'{messages}',jsonb_build_array(jsonb_build_object('fictional',repeat('x',1048576)))) where id=job;
  perform set_config('test.fp.capacity_result',api.attach_privacy_finance_projection(job,'79000000-0000-0000-0000-000000000003',source->>'sourceHash',pg_temp.fp_merge(source))::text,true);
end $$;
select is(current_setting('test.fp.capacity_result')::jsonb->>'status','blocked','whole child artifact above1MiB requires review, never ready');
select is(pg_temp.fp_commit(5,false)->>'status','committed','legacy SQL write without capture remains accepted for core finance tests');
do $$declare job uuid;begin
  job:=pg_temp.fp_job('79000000-0000-0000-0000-000000000002',4);
  perform set_config('test.fp.missing_result',api.privacy_finance_sources(job,'79000000-0000-0000-0000-000000000003')::text,true);
end $$;
select is(current_setting('test.fp.missing_result')::jsonb->>'status','blocked','missing capture after checkpoint cannot fall back to a falsely ready hot-only export');
delete from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid;
do $$begin perform set_config('test.fp.legacy_load',api.finance_load(current_setting('test.fp.scope')::jsonb)::text,true);end $$;
select is(pg_temp.fp_warm()->>'status','review','missing immutable activity prevents cache warming and keeps export review closed');
-- Real accepted commands cross the legacy eligibility bound; current hot state remains bounded.
do $$declare n integer;begin
  perform app_private.finance_activity_capture(current_setting('test.fp.family')::uuid,jsonb_build_object('id',e.event_id,'at',e.payload->>'at','actorRole','parent','referenceId',e.child_id,'label','Allowance plan updated','amountCents',5000))
    from app_private.finance_events e where e.family_id=current_setting('test.fp.family')::uuid and e.event_id=(current_setting('test.fp.scope')::jsonb->>'actorId')||':7a000000-0000-0000-0000-000000000005';
  for n in 1000..1152 loop perform pg_temp.fp_commit(n);end loop;
  delete from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid;
  perform set_config('test.fp.legacy_load',api.finance_load(current_setting('test.fp.scope')::jsonb)::text,true);
end $$;
select ok((select count(*)>160 from app_private.finance_events where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid),'over-bound warm negative control has more than160 real accepted events');
select ok(not exists(select 1 from app_private.finance_events e left join app_private.finance_activity a on a.family_id=e.family_id and a.sequence=e.sequence
  where e.family_id=current_setting('test.fp.family')::uuid and e.child_id=current_setting('test.fp.child')::uuid and a.sequence is null),'over-bound negative control has complete audit coverage rather than an earlier missing row');
select is(pg_temp.fp_warm()->>'status','review','over160 historical events require review without full replay or snapshot insertion');
select ok(not exists(select 1 from app_private.finance_projection_snapshots where family_id=current_setting('test.fp.family')::uuid and child_id=current_setting('test.fp.child')::uuid),'failed legacy eligibility never publishes a snapshot');
select throws_ok($$update app_private.finance_activity set activity=jsonb_set(activity,'{label}','"rewrite"') where family_id=current_setting('test.fp.family')::uuid$$,
  '42501','financial history is append-only','captured financial audit cannot be rewritten');
select throws_ok($$delete from app_private.finance_activity where family_id=current_setting('test.fp.family')::uuid$$,
  '42501','financial history is append-only','no retention shortcut deletes captured shared finance');
select * from finish();
rollback;
