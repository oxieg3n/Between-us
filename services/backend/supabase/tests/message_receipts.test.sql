begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(has_function_privilege('authenticated','api.get_message_receipt(uuid)','EXECUTE'),'authenticated own-receipt RPC');
select ok(not has_function_privilege('anon','api.get_message_receipt(uuid)','EXECUTE'),'anonymous denied');
select ok(not has_table_privilege('authenticated','app_private.messages','SELECT'),'no raw message grants');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
create function pg_temp.mr_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare v_token text;
begin
  v_token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('registration_token',v_token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.mr_identify(p_user uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'session_id',p_user,'role','authenticated',
    'exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian'))::text,true);
end $$;
do $$ begin for i in 1..3 loop perform pg_temp.mr_user(('22000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'receipt'||i||'@fixture.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like '22000000-%';
insert into app_private.families(id,name,timezone) values('22100000-0000-0000-0000-000000000001','Fictional receipt family','UTC');
insert into app_private.memberships(family_id,user_id,role) values
 ('22100000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','guardian'),
 ('22100000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002','guardian');
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by) values('22200000-0000-0000-0000-000000000001','22100000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001');
insert into app_private.conversations(id,contact_id) values('22300000-0000-0000-0000-000000000001','22200000-0000-0000-0000-000000000001');
insert into app_private.operators(user_id,scope,active) values('22000000-0000-0000-0000-000000000003','verification',true);
update app_private.trusted_contacts set accepted_a_at=now(),accepted_b_at=now(),verified_at=now(),verified_until=now()+interval '1 day',
 verified_by='22000000-0000-0000-0000-000000000003',verification_method='synthetic_fixture',verification_evidence_ref='fixture:receipt'
 where id='22200000-0000-0000-0000-000000000001';
select ok(app_private.contact_allowed('22200000-0000-0000-0000-000000000001'),'baseline connection independently verified and currently permitted');
insert into app_private.messages(id,conversation_id,sender_id,recipient_id,client_id,body,response) values
 ('22400000-0000-0000-0000-000000000001','22300000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000002','22500000-0000-0000-0000-000000000001','Fictional secret body','later');
set local role authenticated;
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000001');
select is(api.get_message_receipt('22500000-0000-0000-0000-000000000001')->>'status','saved','sender confirms saved outcome');
select is((select count(*)::int from jsonb_object_keys(api.get_message_receipt('22500000-0000-0000-0000-000000000001'))),5,'only five opaque receipt fields');
select ok(not(api.get_message_receipt('22500000-0000-0000-0000-000000000001') ?| array['body','response','acknowledgedAt','createdAt']),'no text or read receipt');
select is(api.get_message_receipt('22500000-0000-0000-0000-000000000009')->>'status','unknown','absent own record is explicitly unknown');
select lives_ok($$select api.send_message('22300000-0000-0000-0000-000000000001','Fictional secret body','22500000-0000-0000-0000-000000000001','later')$$,'baseline exact replay is permitted before block');
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000002');
select is(api.get_message_receipt('22500000-0000-0000-0000-000000000001')->>'status','unknown','recipient cannot inspect sender nonce');
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000003');
select is(api.get_message_receipt('22500000-0000-0000-0000-000000000001')->>'status','unknown','unrelated guardian metadata cannot inspect nonce');
reset role;
insert into app_private.private_blocks(blocker,blocked) values('22000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000001');
select is(api.get_message_receipt('22500000-0000-0000-0000-000000000001')->>'status','saved','own opaque saved outcome retained after block without granting send');
select throws_ok($$select api.send_message('22300000-0000-0000-0000-000000000001','Fictional secret body','22500000-0000-0000-0000-000000000001','later')$$,'42501',null,'block still denies exact send replay');
reset role;
delete from auth.sessions where id='22000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select api.get_message_receipt('22500000-0000-0000-0000-000000000001')$$,'42501',null,'unexpired token with revoked managed session denied');
reset role;
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||jsonb_build_object('session_id','22000000-0000-0000-0000-000000000003'))::text,true);
set local role authenticated;
select throws_ok($$select api.get_message_receipt('22500000-0000-0000-0000-000000000001')$$,'42501',null,'forged other-user session binding denied');
reset role;
select pg_temp.mr_identify('22000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||jsonb_build_object('exp',extract(epoch from now()-interval '1 minute')))::text,true);
set local role authenticated;
select throws_ok($$select api.get_message_receipt('22500000-0000-0000-0000-000000000001')$$,'42501',null,'expired managed token denied');
reset role;
select * from finish();
rollback;
