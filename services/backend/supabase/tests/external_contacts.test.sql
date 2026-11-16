begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
update app_private.communication_policy set synthetic_fixture_mode=true,push_delivery_enabled=false where singleton;
create temporary table external_values(key text primary key,value jsonb);
create function pg_temp.external_identify(p_number int) returns void language plpgsql as $$
declare u uuid:=('80000000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',u,'role','authenticated',
  'exp',extract(epoch from now()+interval '1 hour'),'user_metadata','{"role":"guardian"}'::jsonb)::text,true);end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..10 loop
    u:=('80000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
    token:=app_private.issue_parent_registration('external'||i::text||'@contacts.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'external'||i::text||'@contacts.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
-- Isolated fictional SQL fixtures; identity tests separately exercise managed enrollment/credentials.
update app_private.profiles set kind='parent',state='active',display_name='Fictional adult' where user_id::text like '80000000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Fictional child' where user_id in
  ('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000009','80000000-0000-0000-0000-000000000010');
update app_private.profiles set display_name='External teacher' where user_id='80000000-0000-0000-0000-000000000005';
insert into app_private.families(id,name,timezone) values
  ('81000000-0000-0000-0000-000000000003','Source family','UTC'),
  ('81000000-0000-0000-0000-000000000001','Other family','UTC'),
  ('81000000-0000-0000-0000-000000000002','Third family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values
  ('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','Child A','80000000-0000-0000-0000-000000000002','active'),
  ('82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','Child B','80000000-0000-0000-0000-000000000004','active'),
  ('82000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000002','Child C','80000000-0000-0000-0000-000000000009','active'),
  ('82000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000002','Child D','80000000-0000-0000-0000-000000000010','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('81000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000001','guardian',null),
  ('81000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000008','guardian',null),
  ('81000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002','child','82000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000003','guardian',null),
  ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000004','child','82000000-0000-0000-0000-000000000002'),
  ('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000007','guardian',null),
  ('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000009','child','82000000-0000-0000-0000-000000000003'),
  ('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000010','child','82000000-0000-0000-0000-000000000004');
insert into app_private.operators(user_id,scope,active) select '80000000-0000-0000-0000-000000000006',scope,true
  from unnest(array['consent','verification','safety','privacy']) scope;
insert into app_private.operators(user_id,scope,active) values('80000000-0000-0000-0000-000000000001','verification',true);
insert into app_private.operators(user_id,scope,active) values('80000000-0000-0000-0000-000000000003','safety',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  select id,family_id,case when family_id='81000000-0000-0000-0000-000000000003' then '80000000-0000-0000-0000-000000000001'::uuid
    when family_id='81000000-0000-0000-0000-000000000001' then '80000000-0000-0000-0000-000000000003'::uuid else '80000000-0000-0000-0000-000000000007'::uuid end,
    'verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:external','80000000-0000-0000-0000-000000000006',now(),now()+interval '1 day'
    from app_private.children where id::text like '82000000-%';

select ok(not has_table_privilege('authenticated','app_private.external_contact_invitations','SELECT'),'raw recipient email/token hashes are private');
select ok(not has_function_privilege('authenticated','api.restrict_contact(uuid,uuid,text,text)','EXECUTE'),'guardians cannot self-assign safety operator authority');
select ok(not has_function_privilege('authenticated','api.verify_contact(uuid,uuid,text,text)','EXECUTE'),'external workflow retains service-only verification');
select ok(not app_private.independent_case_operator('80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000004','safety'),'reported peer family guardian cannot become the confidential case reviewer');
set local role authenticated;
select pg_temp.external_identify(1);
select is(api.request_contact('81000000-0000-0000-0000-000000000003','external8@contacts.test')->>'status','requested','same-family request signature remains usable');
select is(api.request_contact('81000000-0000-0000-0000-000000000003','external5@contacts.test')->>'status','requested','legacy request does not become cross-family discovery');
reset role;
do $$ begin perform set_config('test.external_legacy',(select id::text from app_private.trusted_contacts where a='80000000-0000-0000-0000-000000000001' and b='80000000-0000-0000-0000-000000000008'),true);end $$;
set local role authenticated;
select pg_temp.external_identify(8);
select lives_ok($$select api.accept_contact(current_setting('test.external_legacy')::uuid)$$,'same-family endpoint can accept as before');
reset role;
set local role service_role;
select lives_ok($$select api.verify_contact(current_setting('test.external_legacy')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:legacy')$$,'same-family independent verification remains available');
reset role;
select ok(app_private.contact_allowed(current_setting('test.external_legacy')::uuid),'same-family regression: legacy default families are populated');
set local role authenticated;
select pg_temp.external_identify(2);
select is(api.request_external_contact('81000000-0000-0000-0000-000000000003','missing@contacts.test'),'{"status":"requested"}'::jsonb,'unknown recipient request has generic result');
select is(api.request_external_contact('81000000-0000-0000-0000-000000000003','external4@contacts.test'),'{"status":"requested"}'::jsonb,'existing outside child has identical request result');
select throws_ok($$select api.invite_external_contact('81000000-0000-0000-0000-000000000003',auth.uid(),'external5@contacts.test')$$,
  '42501','not authorized','child cannot issue an external token without a guardian');
select pg_temp.external_identify(5);
select is(api.list_contacts(),'[]'::jsonb,'no unsolicited stranger invitation reaches the outside adult');
reset role;
select is((select count(*)::int from api.user_invalidations where user_id='80000000-0000-0000-0000-000000000005'),0,'email request sends no recipient-dependent invalidation');
do $$ declare material jsonb;begin
  perform pg_temp.external_identify(1);
  material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external5@contacts.test');
  insert into external_values values('teacher_invite',material);
  perform set_config('test.external_teacher_token',material->>'token',true);perform set_config('test.external_teacher_invite',material->>'invitationId',true);
  material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','nobody@contacts.test');
  insert into external_values values('unknown_invite',material);
end $$;
select is((select value->>'status' from external_values where key='teacher_invite'),(select value->>'status' from external_values where key='unknown_invite'),'token issuance cannot reveal whether recipient has an account');
select is((select value->>'delivery' from external_values where key='teacher_invite'),'notSent','invitation never claims an email was sent');
select is(octet_length((select token_hash from app_private.external_contact_invitations where id=current_setting('test.external_teacher_invite')::uuid)),32,'only SHA-256 token hash is persisted');
set local role authenticated;
select pg_temp.external_identify(7);
select throws_ok($$select api.accept_external_contact_invite(current_setting('test.external_teacher_token'))$$,'42501','not authorized','bearer token cannot substitute another recipient email');
select pg_temp.external_identify(5);
select lives_ok($$select api.accept_external_contact_invite(current_setting('test.external_teacher_token'))$$,'outside adult accepts under their independent Auth identity');
select throws_ok($$select api.accept_external_contact_invite(current_setting('test.external_teacher_token'))$$,'42501','not authorized','external token is single-use');
select is(jsonb_array_length(api.get_context()->'families'),0,'teacher receives no family membership');
select is(jsonb_array_length(api.get_context()->'children'),0,'teacher receives no child directory');
select throws_ok($$select api.finance_scope('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001')$$,
  '42501','not authorized','outside adult never receives guardian or financial authority');
select is(api.list_contacts()->0->>'aName',null::text,'pending source child name is withheld');
select is(api.list_contacts()->0->>'a',null::text,'pending source child identifier is withheld');
select is(api.list_contacts()->0->>'peerCategory',null::text,'pending invitation cannot disclose or fabricate a peer category');
select pg_temp.external_identify(2);
select is(api.list_contacts(),'[]'::jsonb,'requester cannot enumerate target acceptance before independently accepting source invitation');
reset role;
select ok(position('80000000-0000-0000-0000-000000000005' in app_private.privacy_export_core('80000000-0000-0000-0000-000000000002')::text)=0,'own export does not bypass pending target identity masking');
do $$ begin perform set_config('test.external_teacher_contact',(select contact_id::text from app_private.external_contact_invitations where id=current_setting('test.external_teacher_invite')::uuid),true);end $$;
set local role service_role;
select throws_ok($$select api.verify_contact(current_setting('test.external_teacher_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:teacher')$$,
  '42501','independent verification required','guardian issuance cannot replace source child acceptance');
reset role;
set local role authenticated;
select pg_temp.external_identify(1);
select throws_ok($$select api.accept_external_contact_source(current_setting('test.external_teacher_invite')::uuid)$$,'42501','not authorized','guardian cannot impersonate source child acceptance');
select pg_temp.external_identify(2);
select lives_ok($$select api.accept_external_contact_source(current_setting('test.external_teacher_invite')::uuid)$$,'child independently accepts guardian-managed introduction');
select is(api.list_contacts()->0->>'bName','External teacher','mutual acceptance can disclose intended peer name');
select is(api.list_contacts()->0->>'peerCategory','trusted-person','outside adult is conservatively unknown, never fabricated as teacher or guardian');
select pg_temp.external_identify(5);
select throws_ok($$select api.approve_contact(current_setting('test.external_teacher_contact')::uuid)$$,'42501','not authorized','adult profile kind alone is never a guardian');
reset role;
set local role service_role;
select throws_ok($$select api.verify_contact(current_setting('test.external_teacher_contact')::uuid,'80000000-0000-0000-0000-000000000001','synthetic_fixture','fixture:self')$$,
  '42501','independent verification required','source guardian cannot self-verify even with staff scope');
select throws_ok($$select api.verify_contact(current_setting('test.external_teacher_contact')::uuid,null,'synthetic_fixture','fixture:null')$$,
  '42501','independent verification required','NULL verifier fails closed');
select lives_ok($$select api.verify_contact(current_setting('test.external_teacher_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:teacher')$$,
  'independent verification authorizes external adult without a membership');
reset role;
select ok(app_private.contact_allowed(current_setting('test.external_teacher_contact')::uuid),'outside adult relationship is now permitted');
do $$ declare conversation uuid;message uuid;begin
  perform pg_temp.external_identify(5);conversation:=(api.create_conversation(current_setting('test.external_teacher_contact')::uuid)->>'id')::uuid;
  perform set_config('test.external_teacher_conversation',conversation::text,true);
  message:=(api.send_message(conversation,'Fictional already received message',gen_random_uuid(),'reply')->>'id')::uuid;
  perform pg_temp.external_identify(2);perform api.ack_message(message);
  perform api.register_device('android','external-fixture-token-child-a-0001');perform api.set_notification_preferences(true,'UTC',0,0);
end $$;
update app_private.communication_policy set push_delivery_enabled=true where singleton;
do $$ begin
  perform pg_temp.external_identify(5);
  perform set_config('test.external_queued',(api.send_message(current_setting('test.external_teacher_conversation')::uuid,'Fictional queued secret',gen_random_uuid(),'reply')->>'id'),true);
end $$;
set local role service_role;
select set_config('test.external_lease',api.lease_notifications(20)::text,true);
select is(current_setting('test.external_lease')::jsonb->0->'payload'->>'body','Open Between Us to check for updates.','external delivery retains neutral notification payload');
reset role;
set local role authenticated;
select pg_temp.external_identify(2);
select lives_ok($$select api.block_user('80000000-0000-0000-0000-000000000005')$$,'child can block an outside adult without guardian approval');
select is(jsonb_array_length(api.fetch_messages(current_setting('test.external_teacher_conversation')::uuid)->'messages'),1,'after block only acknowledged inbound history remains available');
select ok(not (api.fetch_messages(current_setting('test.external_teacher_conversation')::uuid)::text like '%queued secret%'),'queued external body cannot cross a block');
select throws_ok($$select api.ack_message(current_setting('test.external_queued')::uuid)$$,'42501','not authorized','stale external receipt cannot bypass a block');
select pg_temp.external_identify(1);
select lives_ok($$select api.approve_contact(current_setting('test.external_teacher_contact')::uuid)$$,'guardian may record approval without deleting child block');
select pg_temp.external_identify(5);
select throws_ok($$select api.send_message(current_setting('test.external_teacher_conversation')::uuid,'blocked external send',gen_random_uuid(),'reply')$$,
  '42501','not authorized','guardian approval never overrides child block');
reset role;
set local role service_role;
select ok(not api.authorize_notification((current_setting('test.external_lease')::jsonb->0->>'id')::uuid,
  (current_setting('test.external_lease')::jsonb->0->>'leaseToken')::uuid),'provider transport rechecks external block after lease');
select is(api.lease_notifications(20),'[]'::jsonb,'blocked outside contact cannot acquire a replacement lease');
reset role;
do $$ declare material jsonb;begin
  perform pg_temp.external_identify(1);material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external5@contacts.test');
  perform set_config('test.external_reinvite',material->>'token',true);
end $$;
set local role authenticated;
select pg_temp.external_identify(5);
select throws_ok($$select api.accept_external_contact_invite(current_setting('test.external_reinvite'))$$,'42501','not authorized','a fresh token cannot revive an existing blocked or removed pair');
reset role;

-- Source child request -> source guardian issuance -> other child acceptance -> other guardian approval.
do $$ declare request uuid;material jsonb;begin
  select id into request from app_private.external_contact_invitations where subject_user_id='80000000-0000-0000-0000-000000000002' and recipient_email='external4@contacts.test';
  perform pg_temp.external_identify(1);material:=api.approve_external_contact_request(request);
  perform set_config('test.external_cross_token',material->>'token',true);perform set_config('test.external_cross_invite',request::text,true);
  perform pg_temp.external_identify(4);perform api.accept_external_contact_invite(material->>'token');
  perform set_config('test.external_cross_contact',(select contact_id::text from app_private.external_contact_invitations where id=request),true);
end $$;
select is((select array_agg(f order by f) from app_private.contact_family_ids(current_setting('test.external_cross_contact')::uuid) f),
  array['81000000-0000-0000-0000-000000000001'::uuid,'81000000-0000-0000-0000-000000000003'::uuid],'both families are discovered in stable UUID order, including lower recipient family');
set local role service_role;
select throws_ok($$select api.verify_contact(current_setting('test.external_cross_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:cross')$$,
  '42501','independent verification required','one family approval cannot authorize a cross-family child relationship');
reset role;
set local role authenticated;
select pg_temp.external_identify(1);
select lives_ok($$select api.approve_contact(current_setting('test.external_cross_contact')::uuid)$$,'source guardian can approve only their own child');
reset role;
select is((select approved_b_by from app_private.trusted_contacts where id=current_setting('test.external_cross_contact')::uuid),null::uuid,'source guardian cannot write recipient family approval');
set local role authenticated;
select pg_temp.external_identify(4);
select is((select entry->>'peerCategory' from jsonb_array_elements(api.list_contacts()) entry where entry->>'id'=current_setting('test.external_cross_contact')),
  'child','mutually accepted peer category derives from the independently enrolled child profile');
select throws_ok($$select api.approve_contact(current_setting('test.external_cross_contact')::uuid)$$,'42501','not authorized','recipient child cannot forge guardian approval');
select pg_temp.external_identify(3);
select lives_ok($$select api.approve_contact(current_setting('test.external_cross_contact')::uuid)$$,'recipient family guardian approves independently');
reset role;
set local role service_role;
select lives_ok($$select api.verify_contact(current_setting('test.external_cross_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:cross')$$,
  'two current guardian approvals and independent verification permit child peers');
reset role;
do $$ declare conversation uuid;begin
  perform pg_temp.external_identify(4);perform api.register_device('android','external-fixture-token-child-b-0002');perform api.set_notification_preferences(true,'UTC',0,0);
  perform pg_temp.external_identify(2);conversation:=(api.create_conversation(current_setting('test.external_cross_contact')::uuid)->>'id')::uuid;
  perform set_config('test.external_cross_conversation',conversation::text,true);perform api.send_message(conversation,'Fictional cross-family queued body',gen_random_uuid(),'talk');
end $$;
set local role authenticated;
select pg_temp.external_identify(7);
select throws_ok($$select api.fetch_messages(current_setting('test.external_cross_conversation')::uuid)$$,'42501','not authorized','unrelated guardian cannot inspect cross-family messages');
select pg_temp.external_identify(3);
select lives_ok($$select api.revoke_contact(current_setting('test.external_cross_contact')::uuid)$$,'either child family can revoke its own managed connection');
select pg_temp.external_identify(4);
select is(api.fetch_messages(current_setting('test.external_cross_conversation')::uuid)->'messages','[]'::jsonb,'revocation hides queued body while own identity remains active');
select pg_temp.external_identify(2);
select throws_ok($$select api.send_message(current_setting('test.external_cross_conversation')::uuid,'after other family revoke',gen_random_uuid(),'reply')$$,
  '42501','not authorized','source child cannot send after the other guardian revokes');
select throws_ok($$select api.approve_contact(null)$$,'42501','not authorized','NULL contact approval denies');
select throws_ok($$select api.block_user(null)$$,'42501','not authorized','NULL block target denies');
reset role;
set local role service_role;
select is(api.lease_notifications(20),'[]'::jsonb,'revocation suppresses cross-family queued delivery');
reset role;

-- Overlapping guardian roles and explicit safety restrictions do not silently self-resolve.
insert into app_private.memberships(family_id,user_id,role) values('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','guardian');
do $$ declare material jsonb;begin
  perform pg_temp.external_identify(1);material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external9@contacts.test');
  perform pg_temp.external_identify(2);perform api.accept_external_contact_source((material->>'invitationId')::uuid);
  perform pg_temp.external_identify(9);perform api.accept_external_contact_invite(material->>'token');
  perform set_config('test.external_overlap',(select contact_id::text from app_private.external_contact_invitations where id=(material->>'invitationId')::uuid),true);
end $$;
select ok((select review_required from app_private.trusted_contacts where id=current_setting('test.external_overlap')::uuid),'cross-family guardian overlap flags confidential review and fails closed');
select ok(not app_private.contact_allowed(current_setting('test.external_overlap')::uuid),'overlap is never treated as two independent approvals');
set local role authenticated;
select pg_temp.external_identify(7);
select lives_ok($$select api.revoke_membership('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001')$$,'fixture removes overlapping guardian authority through reviewed membership command');
reset role;
select ok((select review_required from app_private.trusted_contacts where id=current_setting('test.external_overlap')::uuid),'removing overlap alone cannot clear a review flag');
set local role service_role;
select lives_ok($$select api.restrict_contact(current_setting('test.external_legacy')::uuid,'80000000-0000-0000-0000-000000000006','guardian_dispute','fixture:restricted-case')$$,
  'independent safety operator can suspend a disputed relationship');
select throws_ok($$select api.verify_contact(current_setting('test.external_legacy')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:cannot-clear')$$,
  '42501','independent verification required','ordinary verification cannot clear a safety review restriction');
reset role;
set local role authenticated;
select pg_temp.external_identify(1);
select ok(not api.list_contacts()::text ~ 'guardian_dispute|restricted-case|review_required','ordinary family metadata never reveals confidential review cause');
reset role;

do $$ declare material jsonb;begin
  perform pg_temp.external_identify(8);
  material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external7@contacts.test');
  perform set_config('test.external_expired_token',material->>'token',true);
  update app_private.external_contact_invitations set expires_at=clock_timestamp()-interval '1 second' where id=(material->>'invitationId')::uuid;
end $$;
set local role authenticated;
select pg_temp.external_identify(7);
select throws_ok($$select api.accept_external_contact_invite(current_setting('test.external_expired_token'))$$,'42501','not authorized','expired external invitation fails before binding recipient');
reset role;

do $$ declare material jsonb;conversation uuid;begin
  perform pg_temp.external_identify(8);material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external7@contacts.test');
  perform pg_temp.external_identify(2);perform api.accept_external_contact_source((material->>'invitationId')::uuid);
  perform pg_temp.external_identify(7);perform api.accept_external_contact_invite(material->>'token');
  perform set_config('test.external_guardian_contact',(select contact_id::text from app_private.external_contact_invitations where id=(material->>'invitationId')::uuid),true);
  perform api.verify_contact(current_setting('test.external_guardian_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:guardian-revoke');
  perform api.register_device('android','external-fixture-token-outside-adult-0004');perform api.set_notification_preferences(true,'UTC',0,0);
  perform pg_temp.external_identify(2);conversation:=(api.create_conversation(current_setting('test.external_guardian_contact')::uuid)->>'id')::uuid;
  perform api.send_message(conversation,'Fictional approval-queued body',gen_random_uuid(),'reply');
end $$;
set local role authenticated;
select pg_temp.external_identify(1);
select lives_ok($$select api.revoke_membership('81000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000008')$$,
  'current authority can revoke the separately recorded approving guardian');
reset role;
select ok(app_private.account_usable('80000000-0000-0000-0000-000000000002'),'child remains usable under a different current guardian consent');
select ok(not app_private.contact_allowed(current_setting('test.external_guardian_contact')::uuid),'contact approval is rechecked independently of child account and consent');
set local role service_role;
select is(api.lease_notifications(20),'[]'::jsonb,'revoked approving guardian prevents queued external transport');
reset role;

do $$ declare material jsonb;conversation uuid;begin
  perform pg_temp.external_identify(1);material:=api.invite_external_contact('81000000-0000-0000-0000-000000000003','82000000-0000-0000-0000-000000000001','external10@contacts.test');
  perform pg_temp.external_identify(2);perform api.accept_external_contact_source((material->>'invitationId')::uuid);
  perform pg_temp.external_identify(10);perform api.accept_external_contact_invite(material->>'token');
  perform set_config('test.external_consent_contact',(select contact_id::text from app_private.external_contact_invitations where id=(material->>'invitationId')::uuid),true);
  perform pg_temp.external_identify(7);perform api.approve_contact(current_setting('test.external_consent_contact')::uuid);
  perform api.verify_contact(current_setting('test.external_consent_contact')::uuid,'80000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:consent-revoke');
  perform pg_temp.external_identify(10);perform api.register_device('android','external-fixture-token-child-d-0003');perform api.set_notification_preferences(true,'UTC',0,0);
  perform pg_temp.external_identify(2);conversation:=(api.create_conversation(current_setting('test.external_consent_contact')::uuid)->>'id')::uuid;
  perform set_config('test.external_consent_conversation',conversation::text,true);perform api.send_message(conversation,'Fictional consent-queued body',gen_random_uuid(),'reply');
end $$;
set local role authenticated;
select pg_temp.external_identify(7);
select lives_ok($$select api.withdraw_consent('82000000-0000-0000-0000-000000000004')$$,'other family consent withdrawal invalidates contact independently of block');
select pg_temp.external_identify(2);
select throws_ok($$select api.send_message(current_setting('test.external_consent_conversation')::uuid,'after consent withdrawal',gen_random_uuid(),'talk')$$,
  '42501','not authorized','send rechecks the other child current consent');
select pg_temp.external_identify(10);
select throws_ok($$select api.fetch_messages(current_setting('test.external_consent_conversation')::uuid)$$,'42501','not authorized','revoked child cannot fetch with previously valid Auth session');
reset role;
set local role service_role;
select is(api.lease_notifications(20),'[]'::jsonb,'delivery rechecks other-family consent and suppresses queued body');
reset role;
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by,verified_by,verified_at,verified_until)
  values('83000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003',
    '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001',now(),now(),
    '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000006',now(),now()+interval '1 day');
set local role authenticated;
select pg_temp.external_identify(2);
select is((select entry->>'peerCategory' from jsonb_array_elements(api.list_contacts()) entry where entry->>'id'='83000000-0000-0000-0000-000000000001'),
  'parent','parent category requires current guardianship of the caller child family');
reset role;
select lives_ok($$select app_private.privacy_lock_families('80000000-0000-0000-0000-000000000002')$$,'privacy lifecycle shares the multi-family lock helper');
select ok(not app_private.privacy_export_core('80000000-0000-0000-0000-000000000002')::text ~ 'token_hash|tokenHash|registration_token|leaseToken','own export includes no external bearer/hash or transport secrets');
update app_private.profiles set state='closed' where user_id='80000000-0000-0000-0000-000000000001';
select ok(not exists(select 1 from app_private.external_contact_invitations where approved_by='80000000-0000-0000-0000-000000000001' and token_hash is not null),'closing source authority cancels every retained invitation bearer');
select ok(not exists(select 1 from app_private.external_contact_invitations where approved_by='80000000-0000-0000-0000-000000000001' and recipient_email<>'redacted@privacy.invalid'),'closed source request records redact pending recipient email metadata');
select * from finish();
rollback;
