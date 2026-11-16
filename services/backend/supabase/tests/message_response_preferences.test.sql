-- Owner runs after migration018. Entirely fictional, rolled back, no delivery transport.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
update app_private.deployment_policy set local_synthetic=true,notice_version='response-v1',consent_policy_version='response-v1' where singleton;
update app_private.communication_policy set synthetic_fixture_mode=true,push_delivery_enabled=false where singleton;
create function pg_temp.response_id(p_group int,p_number int) returns uuid language sql immutable as $$
  select ('f'||p_group::text||'000000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
$$;
create function pg_temp.response_identify(p_number int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.response_id(1,p_number),
  'session_id',pg_temp.response_id(1,p_number),'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,true);end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..4 loop
    u:=pg_temp.response_id(1,i);token:=app_private.issue_parent_registration('response'||i::text||'@fixture.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'response'||i::text||'@fixture.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
update app_private.profiles set kind='parent',state='active',display_name='Fictional adult' where user_id::text like 'f1000000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Fictional child' where user_id=pg_temp.response_id(1,2);
insert into app_private.families(id,name,timezone) values(pg_temp.response_id(2,1),'Fictional response family','UTC'),(pg_temp.response_id(2,2),'Fictional unrelated family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values(pg_temp.response_id(3,1),pg_temp.response_id(2,1),'Fictional child',pg_temp.response_id(1,2),'active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  (pg_temp.response_id(2,1),pg_temp.response_id(1,1),'guardian',null),
  (pg_temp.response_id(2,1),pg_temp.response_id(1,2),'child',pg_temp.response_id(3,1)),
  (pg_temp.response_id(2,2),pg_temp.response_id(1,3),'guardian',null);
insert into app_private.operators(user_id,scope,active) select pg_temp.response_id(1,4),scope,true from unnest(array['verification','consent']) scope;
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values(pg_temp.response_id(3,1),pg_temp.response_id(2,1),pg_temp.response_id(1,1),'verified','response-v1','response-v1','synthetic_fixture','fixture:response-consent',pg_temp.response_id(1,4),now(),now()+interval '1 day');
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
  values(pg_temp.response_id(4,1),pg_temp.response_id(2,1),pg_temp.response_id(1,1),pg_temp.response_id(1,2),pg_temp.response_id(1,1),now(),now(),pg_temp.response_id(1,1),pg_temp.response_id(1,4),now(),now()+interval '1 day','synthetic_fixture','fixture:response-contact');
insert into app_private.conversations(id,contact_id) values(pg_temp.response_id(5,1),pg_temp.response_id(4,1));

select ok(has_function_privilege('authenticated','api.send_message(uuid,text,uuid,text)','EXECUTE'),'send remains an authenticated participant RPC');
select ok(not has_function_privilege('anon','api.send_message(uuid,text,uuid,text)','EXECUTE'),'anonymous send remains denied');
select ok(not has_function_privilege('service_role','api.send_message(uuid,text,uuid,text)','EXECUTE'),'service transport cannot impersonate an author send');
select ok(not has_table_privilege('authenticated','app_private.messages','INSERT'),'raw message insert remains denied');
set local role authenticated;
select pg_temp.response_identify(1);
select lives_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional listen request',pg_temp.response_id(6,1),'listen')$$,'Just listen retains listen');
select lives_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional ideas request',pg_temp.response_id(6,2),'reply')$$,'Give me ideas retains reply');
select is((set_config('test.response_later',api.send_message(pg_temp.response_id(5,1),'Fictional later request',pg_temp.response_id(6,3),'later')::text,true)::jsonb)->>'status','saved','Talk later persists later');
select lives_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional in-person request',pg_temp.response_id(6,4),'talk')$$,'Talk in person retains talk');
select is(api.send_message(pg_temp.response_id(5,1),'Fictional later request',pg_temp.response_id(6,3),'later')->>'id',current_setting('test.response_later')::jsonb->>'id','identical later retry returns the original message');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional later request',pg_temp.response_id(6,3),'listen')$$,'22023','idempotency conflict','changing only a retried preference conflicts');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional changed later words',pg_temp.response_id(6,3),'later')$$,'22023','idempotency conflict','changing replay words still conflicts');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional invalid preference',gen_random_uuid(),'later_today')$$,'22023','invalid message','unknown preference is denied');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional missing preference',gen_random_uuid(),null)$$,'22023','invalid message','null preference is denied');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional empty preference',gen_random_uuid(),'')$$,'22023','invalid message','empty preference is denied');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),repeat('x',5001),gen_random_uuid(),'later')$$,'22023','invalid message','later does not bypass message-size bounds');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),' ',gen_random_uuid(),'later')$$,'22023','invalid message','later does not bypass blank-body validation');
select pg_temp.response_identify(3);
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional cross-family later',gen_random_uuid(),'later')$$,'42501','not authorized','cross-family guessed conversation cannot send later');
select pg_temp.response_identify(2);
select is((select string_agg(v->>'response',',' order by v->>'response') from jsonb_array_elements(api.fetch_messages(pg_temp.response_id(5,1))->'messages') v),
  'later,listen,reply,talk','fetch_messages passes all four stored response strings unchanged');
select is(api.send_message(pg_temp.response_id(5,1),'Fictional child later request',pg_temp.response_id(6,5),'later')->>'status','saved','child independently chooses Talk later');
select set_config('test.response_listen',(select v->>'id' from jsonb_array_elements(api.fetch_messages(pg_temp.response_id(5,1))->'messages') v where v->>'response'='listen'),true);
select lives_ok($$select api.ack_message(current_setting('test.response_listen')::uuid)$$,'recipient explicitly acknowledges one message');
reset role;
select is((select count(*)::int from app_private.messages where sender_id=pg_temp.response_id(1,1) and client_id=pg_temp.response_id(6,3)),1,'later retries never append a duplicate row');
select is((select response from app_private.messages where sender_id=pg_temp.response_id(1,1) and client_id=pg_temp.response_id(6,3)),'later','conflicting preference replay never rewrites the original');
select is((select sum(used)::int from app_private.communication_budgets where user_id=pg_temp.response_id(1,1) and operation='send'),4,'invalid calls and idempotent retries do not consume new-send budget');
select throws_ok($$insert into app_private.messages(conversation_id,sender_id,recipient_id,client_id,body,response) values(pg_temp.response_id(5,1),pg_temp.response_id(1,1),pg_temp.response_id(1,2),gen_random_uuid(),'Fictional invalid direct fixture','invalid')$$,
  '23514',null,'table constraint also rejects unsupported response strings');
set local role authenticated;
select pg_temp.response_identify(2);
select lives_ok($$select api.block_user(pg_temp.response_id(1,1))$$,'child can independently block the contact');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional blocked child later',gen_random_uuid(),'later')$$,'42501','not authorized','Talk later cannot bypass own block');
select is((select string_agg(v->>'response',',' order by v->>'response') from jsonb_array_elements(api.fetch_messages(pg_temp.response_id(5,1))->'messages') v),
  'later,listen','blocked recipient retains only own later request and acknowledged incoming history');
select ok(position('Fictional later request' in api.fetch_messages(pg_temp.response_id(5,1))::text)=0,'queued unacknowledged later request is not delivered across a block');
select pg_temp.response_identify(1);
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional blocked parent later',gen_random_uuid(),'later')$$,'42501','not authorized','Talk later cannot bypass the other author block');
select throws_ok($$select api.send_message(pg_temp.response_id(5,1),'Fictional later request',pg_temp.response_id(6,3),'later')$$,'42501','not authorized','even identical saved-command replay must reauthorize after block');
reset role;
select is((select count(*)::int from app_private.messages where conversation_id=pg_temp.response_id(5,1)),5,'denied sends/replays leave exactly the original five messages');
select * from finish();
rollback;
