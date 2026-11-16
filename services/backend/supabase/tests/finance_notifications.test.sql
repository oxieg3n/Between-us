-- Trusted projector stubs test SQL authority/CAS/lifecycle, not a second money engine. Root executes after023.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not app_private.domain_notification_enabled('payout_due') and not app_private.domain_notification_enabled('savings_milestone'),'both new feature flags default OFF');
select ok(not has_function_privilege('authenticated','api.queue_finance_notifications(uuid,uuid,bigint,jsonb,integer)','EXECUTE'),'clients cannot submit a fake projection');
select ok(not has_function_privilege('anon','api.finance_notification_snapshot(uuid,uuid)','EXECUTE'),'private aggregate snapshot not anonymous');
select ok(not has_function_privilege('authenticated','api.finance_notification_delivery_snapshot(uuid,uuid,boolean)','EXECUTE'),'delivery state stays service-only');
select ok(not has_function_privilege('service_role','app_private.queue_finance_signal(uuid,uuid,uuid,text,text,text,date,integer)','EXECUTE'),'service cannot bypass source CAS with private enqueue');
select ok(not has_table_privilege('authenticated','app_private.finance_notification_observations','SELECT'),'no raw threshold metadata reads');
select ok(not has_function_privilege('service_role','app_private.authorize_notification_before_finance_signals(uuid,uuid)','EXECUTE'),'renamed base authorization is not a service bypass');
select is(api.finance_notification_scopes(20)->>'status','disabled','policy OFF avoids scope enumeration');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-finance-notifications',consent_policy_version='synthetic-finance-notifications' where singleton;
update app_private.communication_policy set synthetic_fixture_mode=true,push_delivery_enabled=true where singleton;
create function pg_temp.finance_notice_user(p_id uuid,p_email text) returns void language plpgsql as $$ declare token text;begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
do $$ declare i int;begin for i in 1..4 loop perform pg_temp.finance_notice_user(('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'finance-notice'||i||'@fixture.test');end loop;end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like 'e1000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='e1000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('e2000000-0000-0000-0000-000000000001','Fictional financial notices','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001',
  'PRIVATE FICTIONAL CHILD NAME','e1000000-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','guardian',null),
  ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','guardian',null),
  ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','child','e3000000-0000-0000-0000-000000000001');
insert into app_private.operators(user_id,scope,active) values('e1000000-0000-0000-0000-000000000004','verification',true),('e1000000-0000-0000-0000-000000000004','consent',true),
  ('e1000000-0000-0000-0000-000000000004','privacy',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values('e3000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000002','verified',
  'synthetic-finance-notifications','synthetic-finance-notifications','synthetic_fixture','fixture:no-real-consent','e1000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end) values
  ('e1000000-0000-0000-0000-000000000001',true,'UTC',0,0),('e1000000-0000-0000-0000-000000000003',true,'UTC',0,0);
insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash) select
  ('e4000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  ('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'android','ExponentPushToken[fictional_finance_notice_'||i||']',
  sha256(convert_to('ExponentPushToken[fictional_finance_notice_'||i||']','UTF8')) from (values(1),(3)) n(i);
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by) values
  ('e5000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000001',now(),now(),'e1000000-0000-0000-0000-000000000002');
set local role service_role;
select api.verify_contact('e5000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:financial-notice-contact');
reset role;
insert into app_private.finance_aggregates(family_id,state) values('e2000000-0000-0000-0000-000000000001',jsonb_build_object('timezone','UTC','children',
  jsonb_build_array(jsonb_build_object('id','e3000000-0000-0000-0000-000000000001','name','PRIVATE FICTIONAL CHILD NAME')),'events','[]'::jsonb));
create function pg_temp.finance_notice_projection(p_due boolean,p_complete boolean,p_period text default 'current-period') returns jsonb language sql as $$
  select jsonb_build_object('localDate',(clock_timestamp() at time zone 'UTC')::date::text,
    'payout',jsonb_build_object('scheduled',true,'due',p_due,'periodKey',p_period),'goals',jsonb_build_array(jsonb_build_object('id','goal','complete',p_complete)));
$$;
create function pg_temp.finance_notice_queue(p_due boolean,p_complete boolean,p_period text default 'current-period') returns jsonb language sql as $$
  select api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',
    (select revision from app_private.finance_aggregates where family_id='e2000000-0000-0000-0000-000000000001'),pg_temp.finance_notice_projection(p_due,p_complete,p_period),20);
$$;
update app_private.domain_notification_policy set payout_reminders_enabled=true,savings_milestones_enabled=true where singleton;
select is(jsonb_array_length(api.finance_notification_scopes(20,null,'e3000000-0000-0000-0000-000000000001')->'scopes'),1,'targeted bounded worker scan finds its usable financial child scope');
select is(pg_temp.finance_notice_queue(false,false)->>'created','0','initial incomplete child projection establishes a silent baseline');
select is(jsonb_array_length(app_private.privacy_export_core('e1000000-0000-0000-0000-000000000003')->'financeNotificationObservations'),1,'subject own export includes collected threshold observations');
select is(jsonb_array_length(app_private.privacy_export_core('e1000000-0000-0000-0000-000000000001')->'financeNotificationObservations'),0,'guardian own export never includes child-only observations');
select is(app_private.privacy_export_core('e1000000-0000-0000-0000-000000000003')#>>'{financeNotificationObservations,0,goals,0,complete}','false','own incomplete marker is exported accurately');
update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,
  reviewed_policy_id='local-finance-notice-fixture-only',reauth_methods=array['synthetic_fixture'] where singleton;
insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref) values
  ('e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','synthetic_fixture','fixture:finance-notice-parent-export-check'),
  ('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','synthetic_fixture','fixture:finance-notice-own-export-check');
insert into app_private.privacy_lifecycle_jobs(id,requester_id,subject_id,client_id,requested_session,reauth_id,kind,status,artifact,artifact_expires_at)
  select 'e7000000-0000-0000-0000-000000000002',user_id,user_id,gen_random_uuid(),session_id,id,'export','ready',
    app_private.privacy_export_core(user_id),clock_timestamp()+interval '1 hour' from app_private.privacy_reauthentication where auth_event_ref='fixture:finance-notice-own-export-check';
select set_config('request.jwt.claims',jsonb_build_object('sub','e1000000-0000-0000-0000-000000000001','role','authenticated',
  'session_id','e1000000-0000-0000-0000-000000000001','exp',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true);
set local role authenticated;
select throws_ok($$select api.get_own_export('e7000000-0000-0000-0000-000000000002',false)$$,'42501',null,'freshly authenticated guardian cannot fetch child observation export');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','e1000000-0000-0000-0000-000000000003','role','authenticated',
  'session_id','e1000000-0000-0000-0000-000000000003','exp',extract(epoch from clock_timestamp()+interval '1 hour'))::text,true);
set local role authenticated;
select is(jsonb_array_length(api.get_own_export('e7000000-0000-0000-0000-000000000002',false)#>'{data,financeNotificationObservations}'),1,'reauthenticated subject can fetch own observation export');
reset role;
select is(pg_temp.finance_notice_queue(true,true)->>'created','2','due unpaid schedule reminds guardian and first visible100% milestone notifies child');
select is(pg_temp.finance_notice_queue(true,true)->>'created','0','same snapshot never repeats either signal');
select ok(not exists(select 1 from jsonb_array_elements(app_private.privacy_export_core('e1000000-0000-0000-0000-000000000003')->'domainNotifications') item
  where item-array['id','kind','createdAt','expiresAt']<>'{}'::jsonb),'own export includes received metadata without private source/projection details');
select is(pg_temp.finance_notice_queue(true,true,'next-period')->>'created','0','carried unpaid allowance never nags again merely because a period changed');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='payout_due' and recipient_id='e1000000-0000-0000-0000-000000000001'),1,'scheduled reminder goes only to current guardian, not child');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='savings_milestone' and recipient_id='e1000000-0000-0000-0000-000000000003'),1,'only the child receives its own visible completion');
select set_config('test.finance_notice_events',(select count(*)::text from app_private.domain_notification_events),true);
select set_config('test.finance_notice_quota',(select coalesce(sum(used),0)::text from app_private.notification_quota),true);
update app_private.finance_aggregates set revision=revision+1 where family_id='e2000000-0000-0000-0000-000000000001';
select is(pg_temp.finance_notice_queue(true,true)->>'created','0','private hidden revision with same child projection creates no events');
select is((select coalesce(sum(used),0)::text from app_private.notification_quota),current_setting('test.finance_notice_quota'),'same child projection consumes no shared quota');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',0,pg_temp.finance_notice_projection(true,true),20)->>'status','conflict','stale CAS cannot enqueue');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,null,20)->>'status','conflict','NULL projection never authorizes or enqueues');
select is(pg_temp.finance_notice_queue(false,false)->>'created','0','payment/holding/progress correction creates no new reminder');
select is(pg_temp.finance_notice_queue(false,true)->>'created','0','falling below then reaching milestone cannot repeat its once-only goal signal');

set local role service_role;
select set_config('test.finance_notice_leases',api.lease_notifications(20)::text,true);
reset role;
select is(jsonb_array_length(current_setting('test.finance_notice_leases')::jsonb),2,'existing neutral worker leases new sources');
select ok(not exists(select 1 from jsonb_array_elements(current_setting('test.finance_notice_leases')::jsonb) q
  where q->'payload'<>jsonb_build_object('title','Between Us','body','Open Between Us to check for updates.','data',jsonb_build_object('invalidationId',q->>'id'))),'payload contains only neutral invalidationUUID');
select set_config('test.finance_notice_payout_q',(select q.id::text from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id where e.event_kind='payout_due'),true);
select set_config('test.finance_notice_goal_q',(select q.id::text from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id where e.event_kind='savings_milestone'),true);
select ok(not api.authorize_notification(current_setting('test.finance_notice_payout_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_payout_q')::uuid)),'ordinary worker cannot bypass fresh financial projection');
select is(api.authorize_finance_notification(current_setting('test.finance_notice_payout_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_payout_q')::uuid),false,1,pg_temp.finance_notice_projection(true,true))->>'allowed','true','trusted fresh due projection authorizes leased reminder');
select is(api.authorize_finance_notification(current_setting('test.finance_notice_payout_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_payout_q')::uuid),false,1,pg_temp.finance_notice_projection(false,true))->>'allowed','false','paid/held allowance denies reminder before transport');
select is(api.authorize_finance_notification(current_setting('test.finance_notice_goal_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_goal_q')::uuid),false,1,pg_temp.finance_notice_projection(false,false))->>'allowed','false','corrected progress denies stale milestone before transport');
insert into app_private.private_blocks(blocker,blocked) values('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000001');
select is(api.authorize_finance_notification(current_setting('test.finance_notice_goal_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_goal_q')::uuid),false,1,pg_temp.finance_notice_projection(false,true))->>'allowed','false','either-direction block denies queued milestone');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000099',1,pg_temp.finance_notice_projection(true,true),20)->>'status','unavailable','wrong child cannot borrow family projection authority');
delete from app_private.private_blocks where blocker='e1000000-0000-0000-0000-000000000003';
update app_private.notification_preferences set enabled=false where user_id='e1000000-0000-0000-0000-000000000003';
select is(api.authorize_finance_notification(current_setting('test.finance_notice_goal_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_goal_q')::uuid),false,1,pg_temp.finance_notice_projection(false,true))->>'allowed','false','private preference opt-out denies queued milestone');
update app_private.notification_preferences set enabled=true where user_id='e1000000-0000-0000-0000-000000000003';
update app_private.consents set status='withdrawn',withdrawn_at=clock_timestamp() where child_id='e3000000-0000-0000-0000-000000000001';
select is(api.authorize_finance_notification(current_setting('test.finance_notice_goal_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_goal_q')::uuid),false,1,pg_temp.finance_notice_projection(false,true))->>'allowed','false','current consent withdrawal denies queued milestone');
update app_private.consents set status='verified',withdrawn_at=null where child_id='e3000000-0000-0000-0000-000000000001';
update app_private.trusted_contacts set revoked_at=clock_timestamp() where id='e5000000-0000-0000-0000-000000000001';
select is(api.authorize_finance_notification(current_setting('test.finance_notice_goal_q')::uuid,(select lease_token from app_private.notification_outbox where id=current_setting('test.finance_notice_goal_q')::uuid),false,1,pg_temp.finance_notice_projection(false,true))->>'allowed','false','contact removal denies queued milestone');
update app_private.trusted_contacts set revoked_at=null where id='e5000000-0000-0000-0000-000000000001';
-- Eight current guardians and nine eligible goals exercise capacity without consuming unqueued transitions.
do $$ declare i int;u uuid;contact uuid;begin
  for i in 2..10 loop
    if i in(3,4) then continue;end if;
    u:=('e1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    if i<>2 then
      perform pg_temp.finance_notice_user(u,'finance-notice'||i||'@fixture.test');
      update app_private.profiles set kind='parent',state='active' where user_id=u;
      insert into app_private.memberships(family_id,user_id,role) values('e2000000-0000-0000-0000-000000000001',u,'guardian');
    end if;
    insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end) values(u,true,'UTC',0,0);
    insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash) values(
      ('e4000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,u,u,'android','ExponentPushToken[fictional_finance_notice_'||i||']',
      sha256(convert_to('ExponentPushToken[fictional_finance_notice_'||i||']','UTF8')));
    contact:=('e5000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_a_by,approved_b_by) values(contact,
      'e2000000-0000-0000-0000-000000000001',least(u,'e1000000-0000-0000-0000-000000000003'::uuid),greatest(u,'e1000000-0000-0000-0000-000000000003'::uuid),u,now(),now(),
      case when u>'e1000000-0000-0000-0000-000000000003'::uuid then 'e1000000-0000-0000-0000-000000000002'::uuid end,
      case when u<'e1000000-0000-0000-0000-000000000003'::uuid then 'e1000000-0000-0000-0000-000000000001'::uuid end);
    perform api.verify_contact(contact,'e1000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:fanout-contact');
  end loop;
end $$;
create function pg_temp.finance_notice_many(p_due boolean,p_complete boolean) returns jsonb language sql as $$
  select jsonb_set(pg_temp.finance_notice_projection(p_due,true,'fanout-period'),'{goals}',
    jsonb_build_array(jsonb_build_object('id','goal','complete',true))||
    (select jsonb_agg(jsonb_build_object('id','capacity-goal-'||i,'complete',p_complete) order by i) from generate_series(1,9) i));
$$;
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(false,false),8)->>'created','0','baseline records multiple incomplete goals without notification');
select throws_ok($$select api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(true,true),1)$$,'22023',null,'direct SQL requires explicit minimum8 finance budget instead of truncating fanout');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(true,true),8)->>'created','8','full eight-guardian payout fanout reserves its entire atomic source');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='payout_due'),9,'every current guardian gets exactly one new episode event');
select is((select count(*)::int from jsonb_each((select goals from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001')) item
  where item.key like 'capacity-goal-%' and item.value->>'announced'='false'),9,'exhausted budget leaves all nine goal transitions pending');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(true,true),8)->>'created','8','next bounded retry queues eight pending goals without repeating payout');
select is((select goals#>>'{capacity-goal-9,announced}' from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001'),'false','ninth eligible completion is not consumed when retry budget ends');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(true,true),8)->>'created','1','later bounded retry queues the final completion');
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_many(true,true),8)->>'created','0','completed fanout and goals remain idempotent');
create function pg_temp.finance_notice_deferred(p_complete boolean) returns jsonb language sql as $$
  select jsonb_set(pg_temp.finance_notice_many(true,true),'{goals}',(pg_temp.finance_notice_many(true,true)->'goals')||
    jsonb_build_array(jsonb_build_object('id','deferred-device-quota','complete',p_complete)));
$$;
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_deferred(false),8)->>'created','0','new incomplete goal gets a baseline before its completion');
update app_private.notification_preferences set enabled=false where user_id='e1000000-0000-0000-0000-000000000003';
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_deferred(true),8)->>'created','0','no opted-in device cannot consume a goal transition');
select is((select goals#>>'{deferred-device-quota,announced}' from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001'),'false','device-unavailable completion remains unannounced');
update app_private.notification_preferences set enabled=true where user_id='e1000000-0000-0000-0000-000000000003';
select set_config('test.finance_before_capacity_quota',(select used::text from app_private.notification_quota where bucket='global' and hour=date_trunc('hour',clock_timestamp())),true);
update app_private.notification_quota set used=500 where bucket='global' and hour=date_trunc('hour',clock_timestamp());
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_deferred(true),8)->>'created','0','quota without any durable outbox cannot consume completion');
select is((select goals#>>'{deferred-device-quota,announced}' from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001'),'false','quota-deferred completion remains unannounced');
update app_private.notification_quota set used=current_setting('test.finance_before_capacity_quota')::int where bucket='global' and hour=date_trunc('hour',clock_timestamp());
select is(api.queue_finance_notifications('e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',1,pg_temp.finance_notice_deferred(true),8)->>'created','1','retry queues the same still-visible completion when device and quota allow it');
update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,
  reviewed_policy_id='local-finance-notice-fixture-only',reauth_methods=array['synthetic_fixture'] where singleton;
update app_private.domain_notification_events set created_at=clock_timestamp()-interval '10 days' where source_kind='finance_signal';
set local role service_role;
select set_config('test.finance_notice_hold',api.set_privacy_hold('e1000000-0000-0000-0000-000000000003','finance','fixture:financial-notice-hold',clock_timestamp()+interval '1 day','e1000000-0000-0000-0000-000000000004')::text,true);
select is(api.run_domain_notification_retention('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004',20)->>'deleted','0','finite finance hold preserves new source metadata');
select api.release_privacy_hold(current_setting('test.finance_notice_hold')::uuid,'e1000000-0000-0000-0000-000000000004');
select is(api.run_domain_notification_retention('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004',20)->>'deleted','20','existing bounded retention removes eligible financial-source metadata');
reset role;
select is((select count(*)::int from app_private.finance_notification_signals),0,'deleting last domain metadata also removes its private signal descriptor');
set local role service_role;
select set_config('test.finance_observation_hold',api.set_privacy_hold('e1000000-0000-0000-0000-000000000003','finance','fixture:own-observation-hold',clock_timestamp()+interval '1 day','e1000000-0000-0000-0000-000000000004')::text,true);
reset role;
insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref) values('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','synthetic_fixture','fixture:finance-notice-deletion');
insert into app_private.privacy_lifecycle_jobs(id,requester_id,subject_id,client_id,requested_session,reauth_id,kind,status,review_operator)
  select 'e7000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003',gen_random_uuid(),
    'e1000000-0000-0000-0000-000000000003',id,'deletion','approved','e1000000-0000-0000-0000-000000000004' from app_private.privacy_reauthentication where auth_event_ref='fixture:finance-notice-deletion';
set local role service_role;
select is(api.execute_privacy_job('e7000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000004')->>'deletionComplete','false','notification cleanup does not claim complete erasure');
reset role;
select is((select count(*)::int from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001'),1,'access-revoked deletion preserves finite-held own markers');
set local role service_role;
select is(api.run_domain_notification_retention('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004',20)->>'deleted','0','empty-event retention preserves a held closed-owner observation');
select api.release_privacy_hold(current_setting('test.finance_observation_hold')::uuid,'e1000000-0000-0000-0000-000000000004');
select is(api.run_domain_notification_retention('e1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000004',20)->>'deleted','1','empty-event retention erases own markers only after hold release');
reset role;
select is((select count(*)::int from app_private.finance_notification_observations where child_id='e3000000-0000-0000-0000-000000000001'),0,'released closed-owner marker is actually erased');
select ok(exists(select 1 from app_private.finance_aggregates where family_id='e2000000-0000-0000-0000-000000000001'),'notification cleanup preserves financial audit state');
select * from finish();
rollback;
