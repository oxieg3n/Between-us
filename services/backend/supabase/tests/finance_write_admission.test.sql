begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_function_privilege('service_role','app_private.finance_write_admit(uuid,uuid,uuid,integer)','EXECUTE'),'service cannot bypass the atomic admission wrapper');
select ok(not has_function_privilege('authenticated','app_private.finance_commit_projection_core(jsonb,uuid,text,bigint,jsonb,text)','EXECUTE'),'client cannot bypass write admission');
select ok((select count(*)=2 from pg_indexes where schemaname='app_private' and indexname in('finance_events_admission_minute','finance_events_admission_day')),'minute and UTC day equality prefixes have dedicated indexes');

update app_private.deployment_policy set local_synthetic=true where singleton;
do $$ declare actor uuid:='6a000000-0000-0000-0000-000000000001';token text;family uuid;children jsonb:='[]';child uuid;begin
  token:=app_private.issue_parent_registration('finance-admission-parent@fixture.test')->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(actor,'finance-admission-parent@fixture.test',clock_timestamp(),jsonb_build_object('registration_token',token),clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(actor,actor,clock_timestamp(),clock_timestamp());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',actor,'role','authenticated','exp',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true);
  perform api.bootstrap_parent('Fictional admission parent');
  for n in 1..2 loop
    family:=api.create_family('Fictional admission family','UTC');
    for m in 1..2 loop child:=api.create_child(family,'Fictional admission child');children:=children||jsonb_build_array(jsonb_build_object('family',family,'child',child));end loop;
  end loop;
  perform set_config('test.fa.children',children::text,true);perform set_config('test.fa.actor',actor::text,true);
  perform set_config('test.fa.scope',api.finance_scope((children->0->>'family')::uuid,(children->0->>'child')::uuid)::text,true);
  perform set_config('test.fa.at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),true);
end $$;
select api.record_resource_sample(jsonb_build_object('plan','free','projectAvailable',true,'collectedAtMs',floor(extract(epoch from clock_timestamp())*1000),
  'metrics','{"databaseBytes":0,"uncachedEgressBytes":0,"cachedEgressBytes":0,"storageBytes":0,"monthlyActiveUsers":0,"edgeInvocations":0,"realtimeMessages":0,"peakRealtimeConnections":0,"realtimeMessagesPerSecond":0,"channelJoinsPerSecond":0}'::jsonb));
update app_private.deployment_policy set local_synthetic=false where singleton;
select is(app_private.resource_band(),0,'actual admissions run with local bypass off and a validated fresh measured resource sample');

create function pg_temp.fa_apply(p_step integer,p_hidden boolean default false,p_roll boolean default false,p_index integer default 0) returns jsonb language plpgsql as $$
declare ids jsonb:=current_setting('test.fa.children')::jsonb->p_index;scope jsonb;loaded jsonb;action jsonb;event jsonb;state jsonb;item jsonb;books jsonb:='{}';activity jsonb:='{}';book jsonb;
  operation uuid:=('6b000000-0000-0000-0000-'||lpad(p_step::text,12,'0'))::uuid;at text:=current_setting('test.fa.at');view jsonb;event_activity jsonb;begin
  scope:=api.finance_scope((ids->>'family')::uuid,(ids->>'child')::uuid);loaded:=api.finance_load(scope);
  action:=case when p_hidden then '{"kind":"configure_matching","rule":{"enabled":false,"percent":100,"monthlyCapCents":2000,"parentBudgetCents":2000,"surprise":true}}'::jsonb
    else '{"kind":"configure_plan","plan":{"budgetCents":5000,"period":"monthly","anchorDate":"2026-01-01","payoutCadence":"per_task","minimumPayoutCents":0,"allowGoalRelease":true}}'::jsonb end;
  event:=action||jsonb_build_object('id',(scope->>'actorId')||':'||operation,'childId',scope->>'childId','at',at,'actor','{"role":"parent"}'::jsonb,'effects','[]'::jsonb);
  state:=jsonb_set(loaded->'state','{events}',(loaded->'state'->'events')||jsonb_build_array(event));
  if p_roll then
    book:='{"occurrences":[],"goals":[],"free":[],"allocations":[],"payouts":[],"matches":[],"savingsRules":[],"matchingRule":{"enabled":false,"percent":100,"monthlyCapCents":2000,"parentBudgetCents":2000,"surprise":true},"earnedCents":0,"correctionDueCents":0,"archivedPaidCents":0}';
    for item in select * from jsonb_array_elements(state->'children') loop
      books:=books||jsonb_build_object(item->>'id',book||case when item->>'id'=scope->>'childId' then jsonb_build_object('plan',action->'plan') else '{}'::jsonb end);
      activity:=activity||jsonb_build_object(item->>'id','{"visible":[],"parent":[]}'::jsonb);
    end loop;
    state:=jsonb_set(jsonb_set(state,'{events}','[]'),'{checkpoint}',jsonb_build_object('version',1,'lastEventAt',at,'books',books,'activity',activity));
  end if;
  event_activity:=jsonb_build_object('id',event->>'id','at',at,'label',case when p_hidden then 'Prospective matching rule updated' else 'Allowance plan updated' end,
    'actorRole','parent','referenceId',scope->>'childId')||case when p_hidden then '{}'::jsonb else '{"amountCents":5000}'::jsonb end;
  view:=jsonb_build_object('childId',scope->>'childId','childName','Fictional admission child','timezone','UTC','occurrences','[]'::jsonb,'goals','[]'::jsonb,
    'savingsRules','[]'::jsonb,'payouts','[]'::jsonb,'activity',jsonb_build_array(event_activity),'balances','{}'::jsonb,'payout','{}'::jsonb);
  return api.finance_commit(scope,operation,app_private.finance_state_hash(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',action)),
    (loaded->>'revision')::bigint,jsonb_build_object('state',state,'event',event,'previousStateHash',loaded->>'stateHash','eventActivity',event_activity,
      'coveredActivity','[]'::jsonb,'childProjection',view-'activity'||jsonb_build_object('activity',case when p_hidden then '[]'::jsonb else jsonb_build_array(event_activity) end),
      'parentProjection',view||'{"matching":{}}'::jsonb),at);
end $$;
select set_config('test.fa.first',pg_temp.fa_apply(1)::text,true);
select is(current_setting('test.fa.first')::jsonb->>'status','committed','new envelope is accepted before compact response');
select ok(not(current_setting('test.fa.first')::jsonb?'state'),'new envelope success does not duplicate the full family aggregate on the wire');
select is(current_setting('test.fa.first')::jsonb->>'serverAt',current_setting('test.fa.at'),'compact success preserves exact validated server time');
do $$ begin for n in 2..60 loop perform pg_temp.fa_apply(n);end loop;end $$;
select is((select count(*)::integer from app_private.finance_events where family_id=(current_setting('test.fa.scope')::jsonb->>'familyId')::uuid),60,'sixty actual same-minute commands are admitted with bypass off');
select set_config('test.fa.hash',app_private.finance_state_hash((api.finance_load(current_setting('test.fa.scope')::jsonb))->'state'),true);
select throws_ok($$select pg_temp.fa_apply(61,false,true)$$,'PT429','Too many financial actions. Try again later.','sixty-first new write rolls back the entire checkpoint/capture transaction');
select is((select count(*)::integer from app_private.finance_commands where family_id=(current_setting('test.fa.scope')::jsonb->>'familyId')::uuid),60,'failed admission retains exactly sixty immutable command identities');
select is((select count(*)::integer from app_private.finance_activity where family_id=(current_setting('test.fa.scope')::jsonb->>'familyId')::uuid),60,'failed admission rolls back new activity capture');
select is((select last_sequence from app_private.finance_projection_snapshots where family_id=(current_setting('test.fa.scope')::jsonb->>'familyId')::uuid),60,'failed admission rolls back mutable projection snapshot');
select is((select count(*)::integer from app_private.finance_checkpoints where family_id=(current_setting('test.fa.scope')::jsonb->>'familyId')::uuid),0,'failed admission rolls back new immutable checkpoint');
select is(app_private.finance_state_hash((api.finance_load(current_setting('test.fa.scope')::jsonb))->'state'),current_setting('test.fa.hash'),'failed admission preserves the prior aggregate bytes');
select is(pg_temp.fa_apply(1)->>'status','replayed','exact old UUID replay succeeds at admission capacity');
select ok(pg_temp.fa_apply(1)?'state','racing replay still returns current authorized state');
select is(api.finance_commit(current_setting('test.fa.scope')::jsonb,'6b000000-0000-0000-0000-000000009999',repeat('0',64),0,'{}',current_setting('test.fa.at'))->>'status','conflict','stale CAS remains conflict without admission consumption');
select is(pg_temp.fa_apply(62,true)->>'status','committed','visible actor minute budget cannot deny a private operation');
select is(pg_temp.fa_apply(63,false,false,1)->>'status','committed','another child has an independent actor/visibility budget');
select is(pg_temp.fa_apply(64,false,false,2)->>'status','committed','another family has an independent child/visibility budget');

-- Historical source rows for exact day boundaries: no production helper test parameter or synthetic bypass.
-- These are owned new fictional event+command mutations, each still subject to the live resource circuit.
create function pg_temp.fa_day_seed(p_count integer,p_hidden boolean,p_admit boolean default true) returns integer language plpgsql as $$
declare ids jsonb:=current_setting('test.fa.children')::jsonb->3;family uuid:=(ids->>'family')::uuid;child uuid:=(ids->>'child')::uuid;actor uuid:=current_setting('test.fa.actor')::uuid;
  seq integer;op uuid;event jsonb;at text;base integer;begin
  select coalesce(max(sequence),0) into base from app_private.finance_events where family_id=family;
  for n in 1..p_count loop
    seq:=base+n;op:=('6c000000-0000-0000-0000-'||lpad(seq::text,12,'0'))::uuid;
    at:=to_char(('2000-01-01T00:00:00Z'::timestamptz+make_interval(mins=>seq/20,secs=>(seq%20)::double precision)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    event:=jsonb_build_object('id',actor::text||':'||op,'childId',child,'at',at,'kind',case when p_hidden then 'configure_matching' else 'configure_plan' end,'actor','{"role":"parent"}'::jsonb,'effects','[]'::jsonb);
    insert into app_private.finance_events(family_id,sequence,event_id,child_id,payload) values(family,seq,event->>'id',child,event);
    insert into app_private.finance_commands(family_id,actor_id,operation_id,child_id,fingerprint,event_sequence,server_at) values(family,actor,op,child,repeat('0',64),seq,at);
  end loop;
  if p_admit then perform app_private.finance_write_admit(family,child,actor,seq);end if;return seq;
end $$;
select set_config('test.fa.visible_sequence',pg_temp.fa_day_seed(1000,false)::text,true);
select throws_ok($$select pg_temp.fa_day_seed(1,false)$$,'PT429','Too many financial actions. Try again later.','one thousand and first visible UTC-day write denies despite a small minute bucket');
select set_config('test.fa.private_sequence',pg_temp.fa_day_seed(200,true)::text,true);
select throws_ok($$select pg_temp.fa_day_seed(1,true)$$,'PT429','Too many financial actions. Try again later.','two hundred and first private UTC-day write denies');
select lives_ok($$select app_private.finance_write_admit((current_setting('test.fa.children')::jsonb->3->>'family')::uuid,
  (current_setting('test.fa.children')::jsonb->3->>'child')::uuid,current_setting('test.fa.actor')::uuid,current_setting('test.fa.visible_sequence')::integer)$$,'private daily work cannot deny the visible stream');
select ok(exists(select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid() and granted
  and classid=((hashtextextended((current_setting('test.fa.scope')::jsonb->>'familyId'),1729)>>32)&4294967295)::oid
  and objid=(hashtextextended((current_setting('test.fa.scope')::jsonb->>'familyId'),1729)&4294967295)::oid and objsubid=1),
  'same family transaction lock remains held through admission, so competing commits must serialize');
select * from finish();
rollback;
