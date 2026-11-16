begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();

-- Isolate the test policy from an explicitly seeded local development stack.
update app_private.communication_policy set synthetic_fixture_mode=false where singleton;

select ok(not (select public_report_intake or staffed_support_promises or push_delivery_enabled or synthetic_fixture_mode
  from app_private.communication_policy),'real intake, staffing promises, push and fixtures default off');
select ok(not has_function_privilege('authenticated','api.verify_contact(uuid,uuid,text,text)','EXECUTE'),'guardian cannot invoke verification transport');
select ok(not has_function_privilege('authenticated','api.lease_notifications(integer)','EXECUTE'),'client cannot lease private device tokens');
select ok(not has_function_privilege('authenticated','api.assign_report(uuid,uuid)','EXECUTE'),'client cannot assign their own report operator');
select ok(not has_table_privilege('authenticated','app_private.messages','SELECT'),'raw message table has no client select grant');
select ok(not has_table_privilege('authenticated','app_private.private_blocks','SELECT'),'private block edge is not exposed');
select is((select count(*)::int from pg_publication_tables where schemaname='app_private'),0,'no raw message, case or finance table is published');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.communication_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.communication_identify(p_id uuid,p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',coalesce(p_session,p_id),
    'exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian','verified',true))::text,true);
end $$;
do $$ declare i int; u uuid; begin
  for i in 1..9 loop
    u:=('20000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    perform pg_temp.communication_user(u,'synthetic'||i::text||'@communication.test');
  end loop;
end $$;
-- Privileged synthetic SQL fixtures isolate communication; identity's own tests exercise enrollment.
update app_private.profiles set kind='parent',state='active',display_name='Synthetic adult' where user_id::text like '20000000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Synthetic child'
  where user_id in('20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004');
insert into app_private.families(id,name,timezone) values
  ('21000000-0000-0000-0000-000000000001','Synthetic family A','UTC'),
  ('21000000-0000-0000-0000-000000000002','Synthetic family B','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values
  ('22000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Child A','20000000-0000-0000-0000-000000000003','active'),
  ('22000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000001','Child B','20000000-0000-0000-0000-000000000004','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','guardian',null),
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','guardian',null),
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','child','22000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','child','22000000-0000-0000-0000-000000000002'),
  ('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000005','guardian',null);
insert into app_private.operators(user_id,scope,active) values
  ('20000000-0000-0000-0000-000000000006','verification',true),
  ('20000000-0000-0000-0000-000000000006','consent',true),
  ('20000000-0000-0000-0000-000000000007','safety',true),
  ('20000000-0000-0000-0000-000000000008','safety',true),
  ('20000000-0000-0000-0000-000000000009','privacy',true),
  ('20000000-0000-0000-0000-000000000001','verification',true),
  ('20000000-0000-0000-0000-000000000001','safety',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  select id,family_id,'20000000-0000-0000-0000-000000000001','verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:consent',
    '20000000-0000-0000-0000-000000000006',now(),now()+interval '1 day' from app_private.children where id::text like '22000000-%';

set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select is(api.request_contact('21000000-0000-0000-0000-000000000001','not-an-account@communication.test'),'{"status":"requested"}'::jsonb,'unknown email receives generic response');
select is(api.request_contact('21000000-0000-0000-0000-000000000001','synthetic5@communication.test'),'{"status":"requested"}'::jsonb,'unrelated existing account receives same response');
select is(api.request_contact('21000000-0000-0000-0000-000000000001','synthetic3@communication.test'),'{"status":"requested"}'::jsonb,'known family contact request does not claim verification');
reset role;
select set_config('test.comm_contact',(select id::text from app_private.trusted_contacts where a='20000000-0000-0000-0000-000000000001' and b='20000000-0000-0000-0000-000000000003'),true);
set local role authenticated;
select throws_ok($$select api.create_conversation(current_setting('test.comm_contact')::uuid)$$,'42501','not authorized','invitation alone cannot start a conversation');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000005');
select throws_ok($$select api.accept_contact(current_setting('test.comm_contact')::uuid)$$,'42501','not authorized','contact acceptance is recipient-bound');
select throws_ok($$select api.request_contact('21000000-0000-0000-0000-000000000001','synthetic3@communication.test')$$,'42501','not authorized','cross-family request is denied');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000003');
select lives_ok($$select api.accept_contact(current_setting('test.comm_contact')::uuid)$$,'intended child independently accepts');
select throws_ok($$select api.approve_contact(current_setting('test.comm_contact')::uuid)$$,'42501','not authorized','forged JWT metadata does not make child a guardian');
select throws_ok($$select api.create_conversation(current_setting('test.comm_contact')::uuid)$$,'42501','not authorized','acceptance without guardian approval and verification cannot send');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select lives_ok($$select api.approve_contact(current_setting('test.comm_contact')::uuid)$$,'guardian can approve child-bound contact');
select throws_ok($$select api.verify_contact(current_setting('test.comm_contact')::uuid,'20000000-0000-0000-0000-000000000001','checkbox','self')$$,'42501',null,'guardian cannot invoke service verification');
select throws_ok($$select api.create_conversation(current_setting('test.comm_contact')::uuid)$$,'42501','not authorized','approval alone never verifies relationship');
reset role;
set local role service_role;
select throws_ok($$select api.verify_contact(current_setting('test.comm_contact')::uuid,'20000000-0000-0000-0000-000000000001','fixture','fixture:self')$$,
  '42501','independent verification required','even active verifier cannot verify own family/contact');
select lives_ok($$select api.verify_contact(current_setting('test.comm_contact')::uuid,'20000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:independent')$$,'independent service verifier records reviewed fixture');
select throws_ok($$select api.verify_contact(current_setting('test.comm_contact')::uuid,'20000000-0000-0000-0000-000000000006','email','fixture:email')$$,'22023','verification evidence required','email ownership cannot verify a trusted relationship');
reset role;
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select set_config('test.comm_conversation',api.create_conversation(current_setting('test.comm_contact')::uuid)->>'id',true);
select set_config('test.comm_message',api.send_message(current_setting('test.comm_conversation')::uuid,'FICTIONAL private first message','23000000-0000-0000-0000-000000000001','listen')->>'id',true);
select is(api.send_message(current_setting('test.comm_conversation')::uuid,'FICTIONAL private first message','23000000-0000-0000-0000-000000000001','listen')->>'id',current_setting('test.comm_message'),'same sender/client identity retry returns original record');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,'changed replay','23000000-0000-0000-0000-000000000001','listen')$$,'22023','idempotency conflict','changed-content replay is rejected');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,repeat('x',5001),gen_random_uuid(),'listen')$$,'22023','invalid message','oversized body denied');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000005');
select throws_ok($$select api.fetch_messages(current_setting('test.comm_conversation')::uuid)$$,'42501','not authorized','outsider cannot fetch guessed conversation');
select throws_ok($$select api.ack_message(current_setting('test.comm_message')::uuid)$$,'42501','not authorized','outsider cannot acknowledge guessed message');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,'cross-family',gen_random_uuid(),'reply')$$,'42501','not authorized','outsider cannot send with forged conversation');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000003');
select is(jsonb_array_length(api.fetch_messages(current_setting('test.comm_conversation')::uuid)->'messages'),1,'authorized recipient fetches persisted body');
select is(api.ack_message(current_setting('test.comm_message')::uuid)->>'status','acknowledged','explicit device receipt records acknowledgement');
select is(api.get_notification_preferences()->>'enabled','false','notifications default opt-out');
select lives_ok($$select api.set_notification_preferences(true,'UTC',0,0)$$,'recipient explicitly enables neutral notifications');
select set_config('test.comm_device',api.register_device('android','fixture-token-never-a-real-device-0001')->>'id',true);
select throws_ok($$select api.submit_report('20000000-0000-0000-0000-000000000001','Fictional concern',current_setting('test.comm_message')::uuid)$$,
  '42501','report intake unavailable; safety information remains available','unstaffed public intake cannot claim report submission');
reset role;
update app_private.communication_policy set push_delivery_enabled=true,synthetic_fixture_mode=true where singleton;
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select set_config('test.comm_queued_message',api.send_message(current_setting('test.comm_conversation')::uuid,'FICTIONAL undelivered second message','23000000-0000-0000-0000-000000000002','reply')->>'id',true);
select is(api.fetch_messages(current_setting('test.comm_conversation')::uuid)->>'readReceipts','false','sender does not receive read receipts');
select is(jsonb_array_length(api.fetch_messages(current_setting('test.comm_conversation')::uuid,1)->'messages'),1,'bounded latest page respects requested size');
select is(api.fetch_messages(current_setting('test.comm_conversation')::uuid,1,current_setting('test.comm_queued_message')::uuid)->'messages'->0->>'id',current_setting('test.comm_message'),'opaque cursor retrieves earlier own history without skipping same-time rows');
select throws_ok($$select api.fetch_messages(current_setting('test.comm_conversation')::uuid,50,'ffffffff-ffff-ffff-ffff-ffffffffffff')$$,'42501','not authorized','unknown or cross-conversation cursor is denied');
reset role;
select is((select count(*)::int from app_private.messages where sender_id='20000000-0000-0000-0000-000000000001' and client_id='23000000-0000-0000-0000-000000000001'),1,'duplicate retry did not append another message');
select set_config('test.comm_queued_at',(select created_at::text from app_private.messages where id=current_setting('test.comm_queued_message')::uuid),true);
select ok((current_setting('test.comm_queued_at'))::timestamptz between now()-interval '1 minute' and now()+interval '1 minute','message creation uses server time');
set local role service_role;
select set_config('test.comm_lease',api.lease_notifications(20)::text,true);
select is(jsonb_array_length(current_setting('test.comm_lease')::jsonb),1,'neutral outbox can be leased once');
select is(current_setting('test.comm_lease')::jsonb->0->'payload'->>'body','Open Between Us to check for updates.','push body is neutral');
select ok(not (current_setting('test.comm_lease')::jsonb->0->'payload')::text ~* 'FICTIONAL|sender|journal|finance|report|match|conversation|response','push payload contains no private content or scope metadata');
select is(api.lease_notifications(20),'[]'::jsonb,'active lease prevents duplicate worker claim');
select ok(api.authorize_notification((current_setting('test.comm_lease')::jsonb->0->>'id')::uuid,(current_setting('test.comm_lease')::jsonb->0->>'leaseToken')::uuid),'worker must reauthorize immediately before external transport');
reset role;
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000003');
select lives_ok($$select api.block_user('20000000-0000-0000-0000-000000000001')$$,'child blocks independently of parent administration');
select is(jsonb_array_length(api.fetch_messages(current_setting('test.comm_conversation')::uuid)->'messages'),1,'after block recipient retains only previously acknowledged history');
select ok(not (api.fetch_messages(current_setting('test.comm_conversation')::uuid)::text like '%undelivered second%'),'undelivered queued body cannot cross block');
select throws_ok($$select api.ack_message(current_setting('test.comm_queued_message')::uuid)$$,'42501','not authorized','stale fetch cannot acknowledge after block');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,'blocked child send',gen_random_uuid(),'talk')$$,'42501','not authorized','block denies blocker sending too');
select set_config('test.comm_report',api.submit_report('20000000-0000-0000-0000-000000000001','FICTIONAL unsafe guardian concern',current_setting('test.comm_message')::uuid)->>'id',true);
select is(api.get_report(current_setting('test.comm_report')::uuid)->>'description','FICTIONAL unsafe guardian concern','reporter can read their restricted report');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,'blocked adult send',gen_random_uuid(),'talk')$$,'42501','not authorized','block denies other direction');
select lives_ok($$select api.approve_contact(current_setting('test.comm_contact')::uuid)$$,'parent approval can be recorded without erasing child block');
select throws_ok($$select api.send_message(current_setting('test.comm_conversation')::uuid,'parent cannot erase child block',gen_random_uuid(),'talk')$$,'42501','not authorized','guardian approval cannot override private block');
select throws_ok($$select api.get_report(current_setting('test.comm_report')::uuid)$$,'42501','not authorized','reported guardian cannot read report');
select set_config('test.comm_privacy',api.submit_privacy_request('parental_review','20000000-0000-0000-0000-000000000003','Fictional statutory request')->>'id',true);
select is(api.get_privacy_request(current_setting('test.comm_privacy')::uuid)->>'journalIncluded','false','parental request records legal review without journal export');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000002');
select throws_ok($$select api.get_report(current_setting('test.comm_report')::uuid)$$,'42501','not authorized','other family administrator also cannot read confidential report');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000008');
select throws_ok($$select api.get_report(current_setting('test.comm_report')::uuid)$$,'42501','not authorized','unassigned safety operator cannot read report');
reset role;
set local role service_role;
select ok(not api.authorize_notification((current_setting('test.comm_lease')::jsonb->0->>'id')::uuid,(current_setting('test.comm_lease')::jsonb->0->>'leaseToken')::uuid),'previously leased notification loses authorization after block');
select is(api.lease_notifications(20),'[]'::jsonb,'blocked queued work does not lease');
select throws_ok($$select api.assign_report(current_setting('test.comm_report')::uuid,'20000000-0000-0000-0000-000000000001')$$,
  '42501','independent assigned safety operator required','reported guardian cannot become assigned reviewer even with staff scope');
select lives_ok($$select api.assign_report(current_setting('test.comm_report')::uuid,'20000000-0000-0000-0000-000000000007')$$,'independent safety operator assignment works');
select lives_ok($$select api.assign_privacy_request(current_setting('test.comm_privacy')::uuid,'20000000-0000-0000-0000-000000000009')$$,'independent privacy assignment works');
reset role;
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000007');
select is(api.get_report(current_setting('test.comm_report')::uuid)->>'status','open','assigned active operator reads case');
select lives_ok($$select api.update_report(current_setting('test.comm_report')::uuid,'triaged','Fictional staff fixture only')$$,'assigned operator can record technical response');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000009');
select is(api.get_privacy_request(current_setting('test.comm_privacy')::uuid)->>'status','review_pending','privacy operator sees request but no automatic export');
reset role;
update app_private.operators set active=false where user_id='20000000-0000-0000-0000-000000000007' and scope='safety';
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000007');
select throws_ok($$select api.get_report(current_setting('test.comm_report')::uuid)$$,'42501','not authorized','revoked staff loses case access immediately');
reset role;

-- Separate valid relationship proves membership/consent revocation independently of block.
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by,verified_by,verified_at,verified_until)
  values('24000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002',now(),now(),
    '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006',now(),now()+interval '1 day');
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000002');
select set_config('test.comm_second_conversation',api.create_conversation('24000000-0000-0000-0000-000000000001')->>'id',true);
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000004');
select lives_ok($$select api.register_device('android','fixture-token-never-a-real-device-0002')$$,'second child device binds to distinct active session');
select lives_ok($$select api.set_notification_preferences(true,'UTC',extract(hour from clock_timestamp())::int,(extract(hour from clock_timestamp())::int+1)%24)$$,'quiet hours accept a wrap-around hour');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000002');
select set_config('test.comm_retry_message',api.send_message(current_setting('test.comm_second_conversation')::uuid,'FICTIONAL retry example','23000000-0000-0000-0000-000000000003','reply')->>'id',true);
reset role;
set local role service_role;
select is(api.lease_notifications(20),'[]'::jsonb,'quiet hours postpone notification without claiming delivery');
reset role;
select ok((select next_attempt_at>clock_timestamp() from app_private.notification_outbox where message_id=current_setting('test.comm_retry_message')::uuid),'quiet-hour work has a bounded later attempt');
update app_private.notification_preferences set quiet_start=0,quiet_end=0 where user_id='20000000-0000-0000-0000-000000000004';
update app_private.notification_outbox set next_attempt_at=clock_timestamp() where message_id=current_setting('test.comm_retry_message')::uuid;
set local role service_role;
select set_config('test.comm_retry_lease',api.lease_notifications(20)::text,true);
select is(api.complete_notification((current_setting('test.comm_retry_lease')::jsonb->0->>'id')::uuid,(current_setting('test.comm_retry_lease')::jsonb->0->>'leaseToken')::uuid,'retry')->>'status','queued','transient provider failure schedules retry');
select is(api.lease_notifications(20),'[]'::jsonb,'retry backoff prevents immediate repeated lease');
reset role;
update app_private.notification_outbox set next_attempt_at=clock_timestamp() where message_id=current_setting('test.comm_retry_message')::uuid;
set local role service_role;
select set_config('test.comm_retry_lease',api.lease_notifications(20)::text,true);
select is(api.complete_notification((current_setting('test.comm_retry_lease')::jsonb->0->>'id')::uuid,(current_setting('test.comm_retry_lease')::jsonb->0->>'leaseToken')::uuid,'accepted')->>'status','provider_accepted','provider acceptance is distinct from device acknowledgement');
reset role;
select ok((select acknowledged_at is null from app_private.messages where id=current_setting('test.comm_retry_message')::uuid),'provider acceptance does not acknowledge or mark message read');
insert into app_private.notification_quota(bucket,hour,used) values('global',date_trunc('hour',clock_timestamp()),500)
  on conflict(bucket,hour) do update set used=500;
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000002');
select set_config('test.comm_quota_message',api.send_message(current_setting('test.comm_second_conversation')::uuid,'FICTIONAL quota example','23000000-0000-0000-0000-000000000004','reply')->>'id',true);
reset role;
select is((select count(*)::int from app_private.notification_outbox where message_id=current_setting('test.comm_quota_message')::uuid),0,'global quota prevents additional notification work while message remains saved');
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001');
select lives_ok($$select api.withdraw_consent('22000000-0000-0000-0000-000000000002')$$,'guardian withdrawal executes under shared family lock');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000002');
select throws_ok($$select api.send_message(current_setting('test.comm_second_conversation')::uuid,'revoked consent',gen_random_uuid(),'reply')$$,'42501','not authorized','current consent rechecked for other participant');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000004');
select throws_ok($$select api.list_conversations()$$,'42501','not authorized','revoked child cannot reuse stale session for fetch');
reset role;
delete from auth.sessions where id='20000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000003');
select throws_ok($$select api.fetch_messages(current_setting('test.comm_conversation')::uuid)$$,'42501','not authorized','revoked Auth session denies body fetch despite old JWT');
select pg_temp.communication_identify('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
select throws_ok($$select api.list_contacts()$$,'42501','not authorized','JWT user cannot borrow another active session');
reset role;
select is((select count(*)::int from app_private.device_tokens where session_id='20000000-0000-0000-0000-000000000003'),0,'session revocation deletes its device token');
select ok(not exists(select 1 from information_schema.tables where table_schema='app_private' and table_name ~ 'journal|draft'),'backend has no journal or private-draft table');
select * from finish();
rollback;
