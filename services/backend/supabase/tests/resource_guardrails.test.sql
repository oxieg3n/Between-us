begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();

update app_private.deployment_policy set local_synthetic=false where singleton;
delete from app_private.resource_sample;
select is(app_private.resource_band(),3,'hosted mode fails closed with missing telemetry');
select ok((select enforcement_enabled from app_private.resource_policy),'resource enforcement defaults on');
select throws_ok($$update app_private.resource_policy set enforcement_enabled=false$$,'23514',null,'hosted enforcement cannot be switched off');
select throws_ok($$update app_private.resource_policy set sample_max_age_seconds=901$$,'23514',null,'freshness cannot exceed fifteen minutes');
select throws_ok($$update app_private.resource_policy set growth_percent=100$$,'23514',null,'policy cannot silently relax the ninety-percent ceiling');
select ok(not has_table_privilege('service_role','app_private.resource_policy','UPDATE'),'service role cannot change policy');
select ok(not has_table_privilege('service_role','app_private.resource_sample','UPDATE'),'service role cannot bypass sample validation');
select ok(not has_function_privilege('authenticated','api.record_resource_sample(jsonb)','EXECUTE'),'clients cannot publish telemetry');
select ok(not has_function_privilege('authenticated','api.resource_status()','EXECUTE'),'clients cannot inspect aggregate usage');
select ok(not has_function_privilege('anon','api.resource_status()','EXECUTE'),'anonymous callers cannot inspect usage');
select ok(not has_function_privilege('service_role','app_private.resource_band()','EXECUTE'),'service role uses only narrow API ports');
select ok(has_function_privilege('service_role','api.record_resource_sample(jsonb)','EXECUTE'),'trusted operator has validated recording port');
select throws_ok($$insert into app_private.families(name,timezone) values('Blocked','UTC')$$,'PT503','Service is temporarily unavailable.',
  'even SQL owner writes are guarded without a local fixture bypass');

create function pg_temp.resource_input(p_metric text default 'edgeInvocations',p_used numeric default 0,p_age_seconds numeric default 0) returns jsonb
language sql as $$select jsonb_build_object('plan','free','projectAvailable',true,
  'collectedAtMs',floor(extract(epoch from clock_timestamp()-make_interval(secs=>p_age_seconds::double precision))*1000),
  'metrics',jsonb_build_object('databaseBytes',0,'uncachedEgressBytes',0,'cachedEgressBytes',0,'storageBytes',0,'monthlyActiveUsers',0,
    'edgeInvocations',0,'realtimeMessages',0,'peakRealtimeConnections',0,'realtimeMessagesPerSecond',0,'channelJoinsPerSecond',0)
      ||jsonb_build_object(p_metric,p_used))$$;
select throws_ok($$select api.record_resource_sample('{}')$$,'22023','invalid resource sample','missing metrics are not treated as zero');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input()||'{"privateContent":"fixture"}')$$,'22023','invalid resource sample','unknown top-level fields reject');
select throws_ok($$select api.record_resource_sample(jsonb_set(pg_temp.resource_input(),'{metrics,userId}','"fixture"'))$$,'22023','invalid resource sample','identifiers/content cannot enter telemetry');
select throws_ok($$select api.record_resource_sample(jsonb_set(pg_temp.resource_input(),'{metrics,edgeInvocations}','"1"'))$$,'22023','invalid resource sample','numeric strings reject');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',-1))$$,'22023','invalid resource sample','negative metrics reject');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',9007199254740992))$$,'22023','invalid resource sample','unsafe numeric metrics reject');
select throws_ok($$select api.record_resource_sample(jsonb_set(pg_temp.resource_input(),'{plan}','"pro"'))$$,'22023','invalid resource sample','non-Free sample rejects');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',0,-60))$$,'22023','invalid resource sample','future timestamp rejects');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',0,901))$$,'22023','invalid resource sample','old timestamp rejects');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input())$$,'valid aggregate sample records');
select ok((select (metrics->>'databaseBytes')::bigint>0 and (metrics->>'databaseBytes')::bigint<=pg_database_size(current_database()) from app_private.resource_sample),
  'server measurement replaces submitted zero; sample insertion itself may allocate database pages');
select throws_ok($$update app_private.resource_sample set metrics='{"edgeInvocations":0}'$$,'23514',null,'partial restored or privileged sample cannot turn unknown metrics into zero');
select is(app_private.resource_band(),0,'fresh low sample allows normal growth');
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',0,1))$$,'22023','stale resource sample','older observation cannot overwrite a newer sample');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',250000))$$,'fifty-percent observation accepted');
select is(app_private.resource_band(),1,'fifty percent is warning only');
select lives_ok($$insert into app_private.families(name,timezone) values('Warning growth','UTC')$$,'warning does not reject normal writes');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',350000))$$,'seventy-percent observation accepted');
select is(app_private.resource_band(),2,'seventy percent restricts background dispatch');
select lives_ok($$insert into app_private.families(name,timezone) values('Restricted growth','UTC')$$,'seventy percent still permits ordinary foreground growth');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',450000))$$,'ninety-percent observation accepted');
select is(app_private.resource_band(),3,'ninety percent closes normal growth');
select throws_ok($$insert into app_private.families(name,timezone) values('At capacity','UTC')$$,'PT503','Service is temporarily unavailable.','capacity blocks direct inserts');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input())$$,'trusted fresh sample can recover capacity');
select is(app_private.resource_band(),0,'recovery is observable without changing policy');
update app_private.resource_sample set collected_at=clock_timestamp()-interval '16 minutes';
select is(app_private.resource_band(),3,'wall clock rechecks freshness inside an old transaction');
select lives_ok($$select api.record_resource_sample(jsonb_set(pg_temp.resource_input(),'{projectAvailable}','false'))$$,'unavailable provider state records honestly');
select is(app_private.resource_band(),3,'provider outage closes growth');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input())$$,'provider recovery requires fresh valid sample');

-- All subsequent data is a rolled-back fictional fixture. This trusted flag is never taken from JWT metadata.
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
delete from app_private.resource_sample;
select is(app_private.resource_band(),0,'explicit local synthetic policy permits isolated existing fixtures without hosted telemetry');
create function pg_temp.resource_identify(p_id uuid,p_forge boolean default false) returns void language plpgsql as $$begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',p_id,'role','authenticated',
    'exp',extract(epoch from clock_timestamp()+interval '1 hour'),'user_metadata',jsonb_build_object('role','service_role','local_synthetic',p_forge))::text,true);
end $$;
do $$declare uid uuid; email text; token text; family uuid; child uuid; consent uuid; material jsonb; contact uuid; conversation uuid; message uuid; schedule uuid; invitation uuid; scope jsonb; device uuid;begin
  for uid,email in select * from(values
    ('26000000-0000-0000-0000-000000000001'::uuid,'resource-parent@fixture.test'),
    ('26000000-0000-0000-0000-000000000002'::uuid,'resource-reviewer@fixture.test'))v(id,email) loop
    token:=app_private.issue_parent_registration(email)->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(uid,email,clock_timestamp(),jsonb_build_object('registration_token',token),clock_timestamp(),clock_timestamp());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(uid,uid,clock_timestamp(),clock_timestamp());
    perform pg_temp.resource_identify(uid);perform api.bootstrap_parent('Fictional adult');
  end loop;
  insert into app_private.operators(user_id,scope,active) values
    ('26000000-0000-0000-0000-000000000002','consent',true),
    ('26000000-0000-0000-0000-000000000002','verification',true);
  perform pg_temp.resource_identify('26000000-0000-0000-0000-000000000001');
  family:=api.create_family('Resource fixture','UTC');child:=api.create_child(family,'Fictional child');
  consent:=api.request_child_consent(child,'synthetic-v1','synthetic-v1');
  perform pg_temp.resource_identify('26000000-0000-0000-0000-000000000002');
  perform api.verify_child_consent(consent,'synthetic_fixture','fixture:resource',clock_timestamp()+interval '1 day');
  perform pg_temp.resource_identify('26000000-0000-0000-0000-000000000001');material:=api.begin_child_enrollment(child);
  uid:='26000000-0000-0000-0000-000000000003';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(uid,material->>'email',clock_timestamp(),jsonb_build_object('registration_token',material->>'token'),clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(uid,uid,clock_timestamp(),clock_timestamp());
  perform pg_temp.resource_identify(uid);perform api.accept_child_enrollment(material->>'token');
  insert into app_private.trusted_contacts(family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_a_by,approved_b_by,verified_by,
      verification_method,verification_evidence_ref,verified_at,verified_until)
    values(family,'26000000-0000-0000-0000-000000000001',uid,'26000000-0000-0000-0000-000000000001',clock_timestamp(),clock_timestamp(),
      '26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002',
      'synthetic_fixture','fixture:resource',clock_timestamp(),clock_timestamp()+interval '1 day') returning id into contact;
  perform pg_temp.resource_identify('26000000-0000-0000-0000-000000000001');
  conversation:=(api.create_conversation(contact)->>'id')::uuid;
  message:=(api.send_message(conversation,'Fictional capacity fixture','26000000-0000-0000-0000-000000000101','reply')->>'id')::uuid;
  insert into app_private.device_tokens(user_id,session_id,platform,token,token_hash)
    values(uid,uid,'android','ExpoPushToken[fictionalresource123]',extensions.digest('fictionalresource123','sha256')) returning id into device;
  insert into app_private.notification_outbox(recipient_id,message_id,device_id) values(uid,message,device);
  insert into app_private.checkin_schedules(family_id,child_id,creator_id,contact_id,question,weekdays,local_time,timezone)
    values(family,child,'26000000-0000-0000-0000-000000000001',contact,'Fictional invitation',array[1,2,3,4,5,6,7],'12:00','UTC') returning id into schedule;
  insert into app_private.checkin_invitations(schedule_id,schedule_revision,family_id,child_id,recipient_id,creator_id,contact_id,question,local_date,due_at,expires_at)
    values(schedule,1,family,child,uid,'26000000-0000-0000-0000-000000000001',contact,'Fictional invitation',clock_timestamp()::date,
      clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day') returning id into invitation;
  scope:=api.finance_scope(family,child);perform api.finance_load(scope);
  perform set_config('test.resource_family',family::text,true);perform set_config('test.resource_child',child::text,true);
  perform set_config('test.resource_scope',scope::text,true);perform set_config('test.resource_conversation',conversation::text,true);
  perform set_config('test.resource_message',message::text,true);perform set_config('test.resource_invitation',invitation::text,true);
end $$;

create function pg_temp.resource_command(p_operation uuid,p_execute boolean default true) returns jsonb
language plpgsql as $$declare scope jsonb:=current_setting('test.resource_scope')::jsonb;loaded jsonb;action jsonb;event jsonb;state jsonb;fingerprint text;begin
  loaded:=api.finance_load(scope);
  action:=jsonb_build_object('kind','configure_plan','plan',jsonb_build_object('budgetCents',5000,'period','monthly','anchorDate','2026-11-01',
    'payoutCadence','per_task','minimumPayoutCents',0,'allowGoalRelease',true));
  event:=action||jsonb_build_object('id',(scope->>'actorId')||':'||p_operation::text,'childId',scope->>'childId','at',loaded->>'serverAt',
    'actor',jsonb_build_object('role','parent'),'effects','[]'::jsonb);
  state:=jsonb_set(loaded->'state','{events}',(loaded->'state'->'events')||jsonb_build_array(event));
  fingerprint:=encode(extensions.digest(app_private.finance_canonical(jsonb_build_object('familyId',scope->>'familyId','childId',scope->>'childId','action',action)),'sha256'),'hex');
  perform set_config('test.resource_fingerprint',fingerprint,true);perform set_config('test.resource_candidate',state::text,true);
  perform set_config('test.resource_revision',loaded->>'revision',true);perform set_config('test.resource_at',loaded->>'serverAt',true);
  if p_execute then return api.finance_commit(scope,p_operation,fingerprint,(loaded->>'revision')::bigint,state,loaded->>'serverAt');end if;
  return jsonb_build_object('prepared',true);
end $$;
select is(pg_temp.resource_command('26000000-0000-0000-0000-000000000201')->>'status','committed','initial exact finance operation commits');
select lives_ok($$select pg_temp.resource_command('26000000-0000-0000-0000-000000000202',false)$$,'next valid command prepared without committing');
update app_private.deployment_policy set local_synthetic=false where singleton;
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',350000))$$,'background restriction established');
select throws_ok($$update app_private.notification_outbox set status='leased' where message_id=current_setting('test.resource_message')::uuid$$,
  'PT503','Service is temporarily unavailable.','seventy percent pauses real queued notification leasing');
select is((select status from app_private.notification_outbox where message_id=current_setting('test.resource_message')::uuid),'queued','failed lease leaves queued record intact');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input('edgeInvocations',450000))$$,'growth cutoff established');

set local role authenticated;
select pg_temp.resource_identify('26000000-0000-0000-0000-000000000001',true);
select throws_ok($$select api.record_resource_sample(pg_temp.resource_input())$$,'42501',null,'forged metadata never grants telemetry authority');
select throws_ok($$select api.resource_status()$$,'42501',null,'client cannot infer hidden activity through usage status');
select throws_ok($$update app_private.resource_policy set growth_percent=89$$,'42501',null,'client cannot update the private policy');
select throws_ok($$select api.create_family('RPC bypass','UTC')$$,'PT503','Service is temporarily unavailable.','direct authorized RPC cannot bypass growth circuit via forged local flag');
select throws_ok($$select api.send_message(current_setting('test.resource_conversation')::uuid,'Fictional new send','26000000-0000-0000-0000-000000000102','reply')$$,
  'PT503','Service is temporarily unavailable.','direct authorized message RPC cannot grow at capacity');
select lives_ok($$select api.send_message(current_setting('test.resource_conversation')::uuid,'Fictional capacity fixture','26000000-0000-0000-0000-000000000101','reply')$$,
  'already saved exact message replay remains available at capacity');
select lives_ok($$select api.fetch_messages(current_setting('test.resource_conversation')::uuid)$$,'existing authorized message reads remain available');
select lives_ok($$select api.submit_privacy_request('own_export')$$,'own export request survives resource cutoff');
select lives_ok($$select api.submit_privacy_request('own_delete')$$,'own deletion request survives resource cutoff');
select pg_temp.resource_identify('26000000-0000-0000-0000-000000000003');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.resource_invitation')::uuid,'skip')$$,'child skip remains available without creating surveillance or growth');
select lives_ok($$select api.ack_message(current_setting('test.resource_message')::uuid)$$,'actual receipt acknowledgment is not blocked by resource cutoff');
select pg_temp.resource_identify('26000000-0000-0000-0000-000000000001');
reset role;

set local role service_role;
select lives_ok($$select api.resource_status()$$,'service operator alone sees content-free usage');
select is(api.finance_commit(current_setting('test.resource_scope')::jsonb,'26000000-0000-0000-0000-000000000201',
  current_setting('test.resource_fingerprint'),0,'{}',null)->>'status','replayed','exact saved finance command replay survives capacity cutoff');
select throws_ok($$select api.finance_commit(current_setting('test.resource_scope')::jsonb,'26000000-0000-0000-0000-000000000202',
  current_setting('test.resource_fingerprint'),current_setting('test.resource_revision')::bigint,current_setting('test.resource_candidate')::jsonb,current_setting('test.resource_at'))$$,
  'PT503','Service is temporarily unavailable.','service-role finance commit is subject to the same database growth guard');
reset role;
select is((select count(*) from app_private.finance_events where family_id=current_setting('test.resource_family')::uuid),1::bigint,'rejected finance growth cannot leave a partial ledger event');
select lives_ok($$update app_private.finance_aggregates set state=state where family_id=current_setting('test.resource_family')::uuid$$,'exact no-op aggregate update remains harmless');
select throws_ok($$update app_private.finance_aggregates set revision=revision+1 where family_id=current_setting('test.resource_family')::uuid$$,
  'PT503','Service is temporarily unavailable.','aggregate update guard closes direct mutation bypass');

set local role authenticated;
select lives_ok($$select api.block_user('26000000-0000-0000-0000-000000000003')$$,'critical block and neutral suppression survive growth cutoff');
select lives_ok($$select api.withdraw_consent(current_setting('test.resource_child')::uuid)$$,'consent withdrawal/audit/session revocation survives growth cutoff');
reset role;
select is((select status from app_private.notification_outbox where message_id=current_setting('test.resource_message')::uuid),'suppressed','critical block keeps an auditable notification terminal');
select is((select state from app_private.children where id=current_setting('test.resource_child')::uuid),'suspended','withdrawal actually revokes child access');
select lives_ok($$insert into app_private.safety_reports(reporter_id,description) values('26000000-0000-0000-0000-000000000001','Fictional restricted report')$$,
  'resource guard excludes restricted report storage; existing intake authorization remains separate');
select ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relname in('private_blocks','consents','privacy_requests','privacy_lifecycle_jobs','privacy_reauthentication','privacy_legal_holds','safety_reports','identity_audit','notification_receipts')
    and t.tgfoid='app_private.guard_resource_growth()'::regprocedure),'critical rights and audit tables are deliberately outside growth trigger roster');
select lives_ok($$select api.record_resource_sample(pg_temp.resource_input())$$,'operator can record fresh recovery despite application cutoff');
select lives_ok($$insert into app_private.families(name,timezone) values('Recovered fixture','UTC')$$,'normal growth resumes only after trusted fresh recovery');
select * from finish();
rollback;
