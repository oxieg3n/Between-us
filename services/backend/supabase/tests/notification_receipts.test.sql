-- Requires owner-reviewed migration 009. Synthetic transactional fixtures; no external transport.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();

select ok(not has_table_privilege('authenticated','app_private.notification_receipts','SELECT'),'receipt tickets are not client-readable');
select ok(not has_function_privilege('authenticated','api.record_notification_ticket(uuid,uuid,text)','EXECUTE'),'clients cannot claim provider acceptance');
select ok(not has_function_privilege('authenticated','api.lease_notification_receipts(integer)','EXECUTE'),'clients cannot lease provider receipt identities');
select ok(not has_function_privilege('anon','api.complete_notification_receipt(uuid,uuid,text)','EXECUTE'),'anonymous callers cannot fabricate receipts');
select ok(has_function_privilege('service_role','api.authorize_notification_receipt(uuid,uuid)','EXECUTE'),'only trusted service transport can authorize receipt work');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-receipt-v1',consent_policy_version='synthetic-receipt-v1' where singleton;
update app_private.communication_policy set push_delivery_enabled=true,synthetic_fixture_mode=true where singleton;
create function pg_temp.receipt_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare intent text;
begin
  intent:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',intent),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
select pg_temp.receipt_user('90000000-0000-0000-0000-000000000001','receipt-parent-a@fixture.test');
select pg_temp.receipt_user('90000000-0000-0000-0000-000000000002','receipt-parent-b@fixture.test');
select pg_temp.receipt_user('90000000-0000-0000-0000-000000000003','receipt-independent-verifier@fixture.test');
-- Privileged communication fixtures only; identity/consent enrollment is covered by its own tests.
update app_private.profiles set kind='parent',state='active',display_name='Fictional receipt fixture'
  where user_id in('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003');
insert into app_private.families(id,name,timezone) values('91000000-0000-0000-0000-000000000001','Fictional receipts','UTC');
insert into app_private.memberships(family_id,user_id,role) values
  ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','guardian'),
  ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','guardian');
insert into app_private.operators(user_id,scope,active) values('90000000-0000-0000-0000-000000000003','verification',true);
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
  values('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000001',now(),now(),'90000000-0000-0000-0000-000000000003',now(),now()+interval '1 day','synthetic_fixture','fixture:receipt-independent');
insert into app_private.conversations(id,contact_id) values('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001');
insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end)
  values('90000000-0000-0000-0000-000000000002',true,'UTC',0,0);
insert into app_private.device_tokens(id,user_id,session_id,platform,token,token_hash)
  values('94000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000002','android',
    'ExponentPushToken[fictional_receipt_only_1234]',sha256(convert_to('ExponentPushToken[fictional_receipt_only_1234]','UTF8')));
create function pg_temp.receipt_outbox() returns uuid language plpgsql as $$
declare message_id uuid:=gen_random_uuid(); outbox_id uuid:=gen_random_uuid();
begin
  insert into app_private.messages(id,conversation_id,sender_id,recipient_id,client_id,body,response)
    values(message_id,'93000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002',gen_random_uuid(),'Fictional private body never transported','listen');
  insert into app_private.notification_outbox(id,recipient_id,message_id,device_id,status,attempts,lease_token,lease_until)
    values(outbox_id,'90000000-0000-0000-0000-000000000002',message_id,'94000000-0000-0000-0000-000000000001','leased',1,gen_random_uuid(),clock_timestamp()+interval '60 seconds');
  return outbox_id;
end $$;

select set_config('test.receipt.one',pg_temp.receipt_outbox()::text,true);
select set_config('test.receipt.dispatch',(select lease_token::text from app_private.notification_outbox where id=current_setting('test.receipt.one')::uuid),true);
set local role service_role;
select is(api.record_notification_ticket(current_setting('test.receipt.one')::uuid,current_setting('test.receipt.dispatch')::uuid,'fictional-ticket-one')->>'status','provider_accepted','ticket acceptance persists atomically');
select is(api.record_notification_ticket(current_setting('test.receipt.one')::uuid,current_setting('test.receipt.dispatch')::uuid,'fictional-ticket-one')->>'deviceDelivered','false','ticket replay never claims device delivery');
select throws_ok($$select api.record_notification_ticket(current_setting('test.receipt.one')::uuid,current_setting('test.receipt.dispatch')::uuid,'different-ticket')$$,'22023','ticket conflict','changed ticket replay is denied');
select is(api.lease_notification_receipts(20),'[]'::jsonb,'first receipt lookup waits fifteen minutes');
reset role;
select ok((select next_attempt_at>clock_timestamp()+interval '14 minutes' from app_private.notification_receipts where outbox_id=current_setting('test.receipt.one')::uuid),'receipt poll is scheduled after provider acceptance');
update app_private.notification_receipts set next_attempt_at=clock_timestamp() where outbox_id=current_setting('test.receipt.one')::uuid;
set local role service_role;
select set_config('test.receipt.lease',api.lease_notification_receipts(20)::text,true);
select is(jsonb_array_length(current_setting('test.receipt.lease')::jsonb),1,'one due receipt is leased');
select ok(not (current_setting('test.receipt.lease')::jsonb->0)::text ~ 'Fictional|body|recipient|token|family|message','receipt lease excludes content and device/family metadata');
select ok(api.authorize_notification_receipt(current_setting('test.receipt.one')::uuid,(current_setting('test.receipt.lease')::jsonb->0->>'leaseToken')::uuid),'receipt lookup rechecks current authorization');
select is(api.complete_notification_receipt(current_setting('test.receipt.one')::uuid,(current_setting('test.receipt.lease')::jsonb->0->>'leaseToken')::uuid,'provider_received')->>'deviceDelivered','false','FCM/APNs handoff is not device receipt');
reset role;
select ok((select m.acknowledged_at is null from app_private.messages m join app_private.notification_outbox q on q.message_id=m.id where q.id=current_setting('test.receipt.one')::uuid),'provider receipt never acknowledges private message');

select set_config('test.receipt.blocked',pg_temp.receipt_outbox()::text,true);
select set_config('test.receipt.dispatch',(select lease_token::text from app_private.notification_outbox where id=current_setting('test.receipt.blocked')::uuid),true);
set local role service_role;
select lives_ok($$select api.record_notification_ticket(current_setting('test.receipt.blocked')::uuid,current_setting('test.receipt.dispatch')::uuid,'fictional-ticket-blocked')$$,'second provider ticket recorded');
reset role;
update app_private.notification_receipts set next_attempt_at=clock_timestamp() where outbox_id=current_setting('test.receipt.blocked')::uuid;
set local role service_role;
select set_config('test.receipt.lease',api.lease_notification_receipts(20)::text,true);
reset role;
insert into app_private.private_blocks(blocker,blocked) values('90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001');
set local role service_role;
select ok(not api.authorize_notification_receipt(current_setting('test.receipt.blocked')::uuid,(current_setting('test.receipt.lease')::jsonb->0->>'leaseToken')::uuid),'block after lease denies provider lookup');
select is(api.complete_notification_receipt(current_setting('test.receipt.blocked')::uuid,(current_setting('test.receipt.lease')::jsonb->0->>'leaseToken')::uuid,'failed')->>'status','suppressed','revoked receipt is suppressed');
reset role;
delete from app_private.private_blocks where blocker='90000000-0000-0000-0000-000000000002' and blocked='90000000-0000-0000-0000-000000000001';

select set_config('test.receipt.invalid',pg_temp.receipt_outbox()::text,true);
select set_config('test.receipt.dispatch',(select lease_token::text from app_private.notification_outbox where id=current_setting('test.receipt.invalid')::uuid),true);
set local role service_role;
select lives_ok($$select api.record_notification_ticket(current_setting('test.receipt.invalid')::uuid,current_setting('test.receipt.dispatch')::uuid,'fictional-ticket-invalid')$$,'invalid-token receipt has a known provider ticket');
reset role;
update app_private.notification_receipts set next_attempt_at=clock_timestamp() where outbox_id=current_setting('test.receipt.invalid')::uuid;
set local role service_role;
select set_config('test.receipt.lease',api.lease_notification_receipts(20)::text,true);
select is(api.complete_notification_receipt(current_setting('test.receipt.invalid')::uuid,(current_setting('test.receipt.lease')::jsonb->0->>'leaseToken')::uuid,'invalid_token')->>'status','failed','permanent token error finishes its receipt');
reset role;
select ok((select revoked_at is not null from app_private.device_tokens where id='94000000-0000-0000-0000-000000000001'),'provider invalid token revokes the exact registered device');
update app_private.notification_receipts set created_at=clock_timestamp()-interval '25 hours';
set local role service_role;
select is(api.purge_notification_receipts(1),1,'receipt metadata purge is bounded');
reset role;
select is((select count(*)::int from app_private.notification_receipts where outbox_id in(current_setting('test.receipt.one')::uuid,current_setting('test.receipt.blocked')::uuid,current_setting('test.receipt.invalid')::uuid)),2,'bounded purge does not delete every expired row at once');
select * from finish();
rollback;
