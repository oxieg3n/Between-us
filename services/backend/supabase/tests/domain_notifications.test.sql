-- Owner executes after migration013. Entirely synthetic, transactional, no provider HTTP.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not app_private.domain_notification_enabled('contact_approved') and not app_private.domain_notification_enabled('checkin_due')
  and not app_private.domain_notification_enabled('chore_assigned') and not app_private.domain_notification_enabled('payout_requested'),'all new feature groups default OFF');
select ok(not has_table_privilege('authenticated','app_private.domain_notification_events','SELECT'),'no raw domain metadata reads');
select ok(not has_table_privilege('authenticated','app_private.domain_notification_policy','UPDATE'),'parents cannot enable delivery policy');
select ok(not has_function_privilege('authenticated','api.produce_due_checkins(integer)','EXECUTE'),'due producer is service-only');
select ok(not has_function_privilege('anon','api.run_domain_notification_retention(uuid,uuid,integer)','EXECUTE'),'retention is not anonymous');
select ok(not has_function_privilege('service_role','app_private.queue_domain_notification(text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,integer)','EXECUTE'),'service cannot bypass source workflows through private enqueue');
select ok(has_function_privilege('service_role','api.lease_notifications(integer)','EXECUTE'),'existing worker interface remains service-only');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-domain-v1',consent_policy_version='synthetic-domain-v1' where singleton;
update app_private.communication_policy set synthetic_fixture_mode=true,push_delivery_enabled=true where singleton;
create function pg_temp.domain_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.domain_identify(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',p_id,
    'exp',extract(epoch from clock_timestamp()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian'))::text,true);
end $$;
do $$ declare i int;begin for i in 1..5 loop perform pg_temp.domain_user(('d1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'domain'||i::text||'@fixture.test');end loop;end $$;
update app_private.profiles set kind='parent',state='active',display_name='FICTIONAL PRIVATE NAME' where user_id::text like 'd1000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='d1000000-0000-0000-0000-000000000003';
insert into app_private.families(id,name,timezone) values('d2000000-0000-0000-0000-000000000001','Fictional notification family','UTC'),
  ('d2000000-0000-0000-0000-000000000002','Fictional unrelated family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('d3000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001','FICTIONAL CHILD LABEL','d1000000-0000-0000-0000-000000000003','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','guardian',null),
  ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','guardian',null),
  ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','child','d3000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000005','guardian',null);
insert into app_private.operators(user_id,scope,active) values('d1000000-0000-0000-0000-000000000004','verification',true),
  ('d1000000-0000-0000-0000-000000000004','consent',true),('d1000000-0000-0000-0000-000000000004','privacy',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values('d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002',
  'verified','synthetic-domain-v1','synthetic-domain-v1','synthetic_fixture','fixture:not-real-consent','d1000000-0000-0000-0000-000000000004',now(),now()+interval '1 day');
insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end) select
  ('d1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,true,'UTC',0,0 from generate_series(1,5) i;
insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash) select
  ('d4000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  ('d1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('d1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  'android','ExponentPushToken[fictional_domain_fixture_'||i::text||']',sha256(convert_to('ExponentPushToken[fictional_domain_fixture_'||i::text||']','UTF8')) from generate_series(1,5) i;
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by) values
  ('d5000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001',now(),now(),'d1000000-0000-0000-0000-000000000002'),
  ('d5000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000002',now(),now(),'d1000000-0000-0000-0000-000000000001');
update app_private.domain_notification_policy set contacts_enabled=true,checkins_enabled=true,chores_enabled=true,payouts_enabled=true where singleton;
select is((select count(*)::int from app_private.domain_notification_events),0,'acceptance/guardian approval without verification never queues contact approval');
set local role service_role;
select lives_ok($$select api.verify_contact('d5000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:domain-contact')$$,'independent verification emits actual approved-contact events');
select lives_ok($$select api.verify_contact('d5000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:second-contact')$$,'second guardian relationship independently verified');
reset role;
select is((select count(*)::int from app_private.domain_notification_events where event_kind='contact_approved'),4,'only two actual endpoints receive each approved-contact event');
update app_private.trusted_contacts set accepted_a_at=accepted_a_at where id='d5000000-0000-0000-0000-000000000001';
select is((select count(*)::int from app_private.domain_notification_events where event_kind='contact_approved'),4,'contact replay creates no repeated reminder');

-- Trusted SQL fixture inserts test classification, not money arithmetic (actual HTTP tests cover the engine).
create function pg_temp.domain_finance(p_sequence int,p_actor uuid,p_kind text) returns void language plpgsql as $$
declare operation uuid:=gen_random_uuid();event_id text:=p_actor::text||':'||operation::text;
begin
  insert into app_private.finance_events(family_id,sequence,event_id,child_id,payload) values('d2000000-0000-0000-0000-000000000001',p_sequence,event_id,
    'd3000000-0000-0000-0000-000000000001',jsonb_build_object('id',event_id,'kind',p_kind,'at',clock_timestamp(),'childId','d3000000-0000-0000-0000-000000000001',
    'actor',jsonb_build_object('role',case when p_actor='d1000000-0000-0000-0000-000000000003' then 'child' else 'parent' end),
    'title','FICTIONAL CHORE TITLE','note','FICTIONAL PRIVATE NOTE','effects',jsonb_build_array(jsonb_build_object('kind','match_committed','cents',2000))));
  insert into app_private.finance_commands(family_id,actor_id,operation_id,child_id,fingerprint,event_sequence,server_at)
    values('d2000000-0000-0000-0000-000000000001',p_actor,operation,'d3000000-0000-0000-0000-000000000001',repeat('a',64),p_sequence,clock_timestamp()::text);
end $$;
select pg_temp.domain_finance(1,'d1000000-0000-0000-0000-000000000001','assign_chore');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='chore_assigned'),1,'assignment transaction queues only the own child');
select pg_temp.domain_finance(2,'d1000000-0000-0000-0000-000000000003','submit_chore');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='chore_submitted'),2,'submission reaches current guardians with independently allowed relationships');
select pg_temp.domain_finance(3,'d1000000-0000-0000-0000-000000000001','review_chore');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='chore_reviewed'),1,'review result queues child notification');
select pg_temp.domain_finance(4,'d1000000-0000-0000-0000-000000000003','request_payout');
select pg_temp.domain_finance(5,'d1000000-0000-0000-0000-000000000001','prepare_payout');
select pg_temp.domain_finance(6,'d1000000-0000-0000-0000-000000000001','report_payment');
select is((select count(*)::int from app_private.domain_notification_events where event_kind in('payout_requested','payout_prepared','payment_reported')),4,'request, preparation and manual report are scoped workflow events, not payment proof');
select set_config('test.domain_count',(select count(*)::text from app_private.domain_notification_events),true);
select set_config('test.domain_quota',(select coalesce(sum(used),0)::text from app_private.notification_quota),true);
select pg_temp.domain_finance(7,'d1000000-0000-0000-0000-000000000001','configure_matching');
select pg_temp.domain_finance(8,'d1000000-0000-0000-0000-000000000001','reveal_match');
select pg_temp.domain_finance(9,'d1000000-0000-0000-0000-000000000001','fund_match');
select pg_temp.domain_finance(10,'d1000000-0000-0000-0000-000000000001','reverse_match');
select pg_temp.domain_finance(11,'d1000000-0000-0000-0000-000000000001','reconcile_match');
select pg_temp.domain_finance(12,'d1000000-0000-0000-0000-000000000003','allocate');
select is((select count(*)::text from app_private.domain_notification_events),current_setting('test.domain_count'),'all matching and savings actions create NO notification metadata');
select is((select coalesce(sum(used),0)::text from app_private.notification_quota),current_setting('test.domain_quota'),'hidden matching actions cannot change shared notification quotas/counts');
select is((select count(*)::int from app_private.domain_notification_events where recipient_id='d1000000-0000-0000-0000-000000000005'),0,'unrelated family is never a recipient');

insert into app_private.checkin_schedules(id,family_id,child_id,creator_id,contact_id,question,weekdays,local_time,timezone) values
  ('d6000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  'd5000000-0000-0000-0000-000000000001','FICTIONAL CHECKIN QUESTION',array[extract(isodow from clock_timestamp() at time zone 'UTC')::int],'00:00','UTC');
set local role service_role;
select is(api.produce_due_checkins(20)->>'created','1','service producer materializes due TODAY without the child opening the app');
select is(api.produce_due_checkins(20)->>'created','0','same occurrence has no backlog or repeated nag');
reset role;
select is((select count(*)::int from app_private.checkin_invitations where schedule_id='d6000000-0000-0000-0000-000000000001'),1,'one invitation for today only');
select is((select count(*)::int from app_private.domain_notification_events where event_kind='checkin_due'),1,'checkin insert transaction queues once');
select set_config('test.domain_checkin',(select id::text from app_private.checkin_invitations where schedule_id='d6000000-0000-0000-0000-000000000001'),true);
select set_config('test.domain_invalidations',(select count(*)::text from api.user_invalidations),true);
set local role authenticated;
select pg_temp.domain_identify('d1000000-0000-0000-0000-000000000001');
select set_config('test.domain_parent_schedule',api.list_checkin_schedules()::text,true);
select pg_temp.domain_identify('d1000000-0000-0000-0000-000000000003');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.domain_checkin')::uuid,'defer')$$,'child sets aside optional invitation');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.domain_checkin')::uuid,'resume')$$,'resume does not generate another push');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.domain_checkin')::uuid,'skip')$$,'child skip remains private');
select pg_temp.domain_identify('d1000000-0000-0000-0000-000000000001');
select is(api.list_checkin_schedules()::text,current_setting('test.domain_parent_schedule'),'parent schedule DTO does not disclose disposition');
reset role;
select is((select count(*)::text from api.user_invalidations),current_setting('test.domain_invalidations'),'defer/resume/skip sends no parent invalidation');
select ok(not exists(select 1 from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id
  where e.event_kind='checkin_due' and q.status in('queued','leased')),'defer/skip suppress queued pressure and resume never revives it');
select ok(not exists(select 1 from jsonb_array_elements(app_private.privacy_export_core('d1000000-0000-0000-0000-000000000001')->'domainNotifications') e
  where e->>'kind'='checkin_due'),'guardian own export excludes sent child check-in notification/skip metadata');

set local role service_role;
select set_config('test.domain_leases',api.lease_notifications(20)::text,true);
reset role;
select ok(jsonb_array_length(current_setting('test.domain_leases')::jsonb)>0,'ordinary domain events lease through the existing worker shape');
select ok(not current_setting('test.domain_leases') ~ 'FICTIONAL|chore_assigned|chore_reviewed|payout|question|familyId|actorId|childId|matching','lease never exposes domain names, amounts, identifiers or private source content');
select ok(not exists(select 1 from jsonb_array_elements(current_setting('test.domain_leases')::jsonb) e where e->'payload' is distinct from
  jsonb_build_object('title','Between Us','body','Open Between Us to check for updates.','data',jsonb_build_object('invalidationId',e->>'id'))),'every payload has only neutral text and its own invalidation UUID');
select set_config('test.domain_chore_outbox',(select q.id::text from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id where e.event_kind='chore_assigned'),true);
select set_config('test.domain_chore_lease',(select lease_token::text from app_private.notification_outbox where id=current_setting('test.domain_chore_outbox')::uuid),true);
set local role service_role;
select ok(api.authorize_notification(current_setting('test.domain_chore_outbox')::uuid,current_setting('test.domain_chore_lease')::uuid),'current delivery authorization supports domain source');
select lives_ok($$select api.record_notification_ticket(current_setting('test.domain_chore_outbox')::uuid,current_setting('test.domain_chore_lease')::uuid,'fictional-domain-ticket')$$,'domain acceptance persists ticket atomically');
reset role;
update app_private.notification_receipts set next_attempt_at=clock_timestamp() where outbox_id=current_setting('test.domain_chore_outbox')::uuid;
set local role service_role;
select set_config('test.domain_receipt',api.lease_notification_receipts(20)::text,true);
select ok(api.authorize_notification_receipt(current_setting('test.domain_chore_outbox')::uuid,(current_setting('test.domain_receipt')::jsonb->0->>'leaseToken')::uuid),'receipt worker rechecks actual domain authority');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id='d1000000-0000-0000-0000-000000000003';
select ok(not app_private.notification_allowed(current_setting('test.domain_chore_outbox')::uuid),'stale managed recipient session denies domain delivery');
update auth.sessions set not_after=null where id='d1000000-0000-0000-0000-000000000003';
update app_private.notification_outbox set device_id='d4000000-0000-0000-0000-000000000005' where id=current_setting('test.domain_chore_outbox')::uuid;
select ok(not app_private.notification_allowed(current_setting('test.domain_chore_outbox')::uuid),'another user device cannot receive a domain event');
update app_private.notification_outbox set device_id='d4000000-0000-0000-0000-000000000003' where id=current_setting('test.domain_chore_outbox')::uuid;
update app_private.notification_preferences set enabled=false where user_id='d1000000-0000-0000-0000-000000000003';
select ok(not app_private.notification_allowed(current_setting('test.domain_chore_outbox')::uuid),'private recipient opt-out is rechecked');
update app_private.notification_preferences set enabled=true where user_id='d1000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.domain_identify('d1000000-0000-0000-0000-000000000003');
select lives_ok($$select api.block_user('d1000000-0000-0000-0000-000000000001')$$,'child block applies to all notification sources in both directions');
reset role;
set local role service_role;
select ok(not api.authorize_notification_receipt(current_setting('test.domain_chore_outbox')::uuid,(current_setting('test.domain_receipt')::jsonb->0->>'leaseToken')::uuid),'block after provider ticket denies receipt lookup');
select is(api.complete_notification_receipt(current_setting('test.domain_chore_outbox')::uuid,(current_setting('test.domain_receipt')::jsonb->0->>'leaseToken')::uuid,'provider_received')->>'status','suppressed','receipt outcome never restores blocked authority');
reset role;
select ok(not exists(select 1 from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id
  where e.contact_id='d5000000-0000-0000-0000-000000000001' and q.status in('queued','leased')),'block suppresses queued/leased domains for both actors');
select set_config('test.domain_after_block',(select count(*)::text from app_private.domain_notification_events),true);
select pg_temp.domain_finance(13,'d1000000-0000-0000-0000-000000000001','review_chore');
select is((select count(*)::text from app_private.domain_notification_events),current_setting('test.domain_after_block'),'blocked source cannot enqueue new child financial notification');
update app_private.consents set status='withdrawn',withdrawn_at=clock_timestamp() where child_id='d3000000-0000-0000-0000-000000000001';
select ok(not exists(select 1 from app_private.notification_outbox where domain_event_id is not null and app_private.notification_allowed(id)),'withdrawal denies every remaining child/guardian domain delivery');
update app_private.consents set status='verified',withdrawn_at=null where child_id='d3000000-0000-0000-0000-000000000001';

update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,
  reviewed_policy_id='local-domain-fixture-only',reauth_methods=array['synthetic_fixture'] where singleton;
update app_private.domain_notification_events set created_at=clock_timestamp()-interval '10 days';
set local role service_role;
select set_config('test.domain_hold',api.set_privacy_hold('d1000000-0000-0000-0000-000000000003','messages','fixture:finite-domain-hold',clock_timestamp()+interval '1 day','d1000000-0000-0000-0000-000000000004')::text,true);
select is(api.run_domain_notification_retention('d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000004',1)->>'deleted','0','both-party finite holds preserve notification metadata');
select lives_ok($$select api.release_privacy_hold(current_setting('test.domain_hold')::uuid,'d1000000-0000-0000-0000-000000000004')$$,'hold release remains independent');
select is(api.run_domain_notification_retention('d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000004',1)->>'deleted','1','retention actually erases only the bounded old metadata batch');
select set_config('test.domain_parent_hold',api.set_privacy_hold('d1000000-0000-0000-0000-000000000001','messages','fixture:shared-domain-hold',clock_timestamp()+interval '1 day','d1000000-0000-0000-0000-000000000004')::text,true);
reset role;
insert into app_private.privacy_reauthentication(user_id,session_id,method,auth_event_ref) values('d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003','synthetic_fixture','fixture:domain-deletion');
insert into app_private.privacy_lifecycle_jobs(id,requester_id,subject_id,client_id,requested_session,reauth_id,kind,status,review_operator)
  select 'd7000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000003',gen_random_uuid(),
    'd1000000-0000-0000-0000-000000000003',id,'deletion','approved','d1000000-0000-0000-0000-000000000004' from app_private.privacy_reauthentication where auth_event_ref='fixture:domain-deletion';
set local role service_role;
select is(api.execute_privacy_job('d7000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000004')->>'deletionComplete','false','domain cleanup never converts staged deletion into full-erasure claim');
reset role;
select ok(not exists(select 1 from app_private.notification_outbox where domain_event_id is not null),'deletion revokes domain transport even where shared metadata is held');
select ok(exists(select 1 from app_private.domain_notification_events where cancelled_at is not null),'held shared metadata remains cancelled, not silently erased');
select is((select count(*)::int from app_private.finance_events where family_id='d2000000-0000-0000-0000-000000000001'),13,'notification retention/deletion never erases financial audit history');
select * from finish();
rollback;
