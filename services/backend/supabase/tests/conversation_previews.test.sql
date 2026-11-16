-- Owner runs after reviewed migration016; fictional transactional fixtures, no provider traffic.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
update app_private.deployment_policy set local_synthetic=true,notice_version='preview-v1',consent_policy_version='preview-v1' where singleton;
update app_private.communication_policy set synthetic_fixture_mode=true,push_delivery_enabled=false where singleton;
create function pg_temp.preview_id(p_group int,p_number int) returns uuid language sql immutable as $$
  select ('e'||p_group::text||'000000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
$$;
create function pg_temp.preview_identify(p_number int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.preview_id(1,p_number),
  'session_id',pg_temp.preview_id(1,p_number),'role','authenticated','exp',extract(epoch from now()+interval '1 hour'))::text,true);end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..58 loop
    u:=pg_temp.preview_id(1,i);token:=app_private.issue_parent_registration('preview'||i::text||'@fixture.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'preview'||i::text||'@fixture.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
update app_private.profiles set kind='parent',state='active',display_name='Fictional approved peer' where user_id::text like 'e1000000-%';
update app_private.profiles set display_name='Fictional guardian' where user_id=pg_temp.preview_id(1,1);
update app_private.profiles set kind='child',auth_alias=true,display_name='Fictional child' where user_id in(pg_temp.preview_id(1,2),pg_temp.preview_id(1,3));
insert into app_private.families(id,name,timezone) values(pg_temp.preview_id(2,1),'Fictional preview family','UTC'),(pg_temp.preview_id(2,2),'Fictional other family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values
  (pg_temp.preview_id(3,2),pg_temp.preview_id(2,1),'Fictional child A',pg_temp.preview_id(1,2),'active'),
  (pg_temp.preview_id(3,3),pg_temp.preview_id(2,1),'Fictional child B',pg_temp.preview_id(1,3),'active');
insert into app_private.memberships(family_id,user_id,role,child_id)
  select pg_temp.preview_id(2,1),pg_temp.preview_id(1,i),case when i in(2,3) then 'child' else 'guardian' end,
    case when i in(2,3) then pg_temp.preview_id(3,i) else null end from generate_series(1,58) i where i not in(4,5,6);
insert into app_private.memberships(family_id,user_id,role) values(pg_temp.preview_id(2,2),pg_temp.preview_id(1,5),'guardian');
insert into app_private.operators(user_id,scope,active) select pg_temp.preview_id(1,4),scope,true from unnest(array['verification','consent']) scope;
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  select pg_temp.preview_id(3,i),pg_temp.preview_id(2,1),pg_temp.preview_id(1,1),'verified','preview-v1','preview-v1','synthetic_fixture','fixture:preview-consent',pg_temp.preview_id(1,4),now(),now()+interval '1 day' from generate_series(2,3) i;
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
  select pg_temp.preview_id(5,i-1),pg_temp.preview_id(2,1),pg_temp.preview_id(1,1),pg_temp.preview_id(1,i),pg_temp.preview_id(1,1),now(),now(),pg_temp.preview_id(1,1),pg_temp.preview_id(1,4),now(),now()+interval '1 day','synthetic_fixture','fixture:preview-family' from generate_series(2,3) i;
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,external_connection,family_a_id,family_b_id,accepted_a_at,accepted_b_at,approved_a_by,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
  values(pg_temp.preview_id(5,3),pg_temp.preview_id(2,1),pg_temp.preview_id(1,2),pg_temp.preview_id(1,5),pg_temp.preview_id(1,2),true,pg_temp.preview_id(2,1),pg_temp.preview_id(2,2),now(),now(),pg_temp.preview_id(1,1),pg_temp.preview_id(1,4),now(),now()+interval '1 day','synthetic_fixture','fixture:preview-external');
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,verified_by,verified_at,verified_until,verification_method,verification_evidence_ref)
  select pg_temp.preview_id(5,i),pg_temp.preview_id(2,1),pg_temp.preview_id(1,1),pg_temp.preview_id(1,i),pg_temp.preview_id(1,1),now(),now(),pg_temp.preview_id(1,4),now(),now()+interval '1 day','synthetic_fixture','fixture:preview-pagination' from generate_series(7,58) i;
insert into app_private.conversations(id,contact_id,created_at) values
  (pg_temp.preview_id(6,1),pg_temp.preview_id(5,1),'2026-01-05T00:00:00Z'),
  (pg_temp.preview_id(6,2),pg_temp.preview_id(5,2),'2026-01-04T00:00:00Z'),
  (pg_temp.preview_id(6,3),pg_temp.preview_id(5,3),'2026-01-03T00:00:00Z');
-- Equal times force UUID tie-breaking across the page boundary.
insert into app_private.conversations(id,contact_id,created_at) select pg_temp.preview_id(6,i),pg_temp.preview_id(5,i),'2026-01-01T00:00:00Z' from generate_series(7,58) i;
insert into app_private.messages(id,conversation_id,sender_id,recipient_id,client_id,body,response,created_at,acknowledged_at) values
  (pg_temp.preview_id(7,1),pg_temp.preview_id(6,1),pg_temp.preview_id(1,2),pg_temp.preview_id(1,1),pg_temp.preview_id(8,1),'Fictional own sent history','listen','2026-02-01T10:00:00Z',null),
  (pg_temp.preview_id(7,2),pg_temp.preview_id(6,1),pg_temp.preview_id(1,1),pg_temp.preview_id(1,2),pg_temp.preview_id(8,2),'Fictional acknowledged history','listen','2026-02-01T11:00:00Z','2026-02-01T11:01:00Z'),
  (pg_temp.preview_id(7,3),pg_temp.preview_id(6,1),pg_temp.preview_id(1,1),pg_temp.preview_id(1,2),pg_temp.preview_id(8,3),repeat('界',180)||'FICTIONAL QUEUED SENTINEL','reply','2026-02-01T12:00:00Z',null),
  (pg_temp.preview_id(7,4),pg_temp.preview_id(6,3),pg_temp.preview_id(1,5),pg_temp.preview_id(1,2),pg_temp.preview_id(8,4),'Fictional child-only external conversation','listen','2026-02-01T13:00:00Z',null);

select ok(has_function_privilege('authenticated','api.list_conversations_page(integer,uuid)','EXECUTE'),'page API is authenticated');
select ok(not has_function_privilege('anon','api.list_conversations_page(integer,uuid)','EXECUTE'),'anonymous caller cannot list previews');
select ok(not has_function_privilege('service_role','api.list_conversations_page(integer,uuid)','EXECUTE'),'service transport role has no participant preview grant');
select ok(not has_table_privilege('authenticated','app_private.messages','SELECT'),'raw message grants remain absent');
set local role authenticated;
select pg_temp.preview_identify(2);
select is(jsonb_array_length(api.list_conversations_page()->'conversations'),2,'child sees own family and approved external conversation only');
select is((select string_agg(k,',' order by k) from jsonb_object_keys(api.list_conversations_page()->'conversations'->0) k),
  'canExchange,contactId,createdAt,id,lastMessageAt,peerId,peerName,preview','participant projection contains only the documented conversation fields');
select is(api.list_conversations_page()->'conversations'->0->>'peerName','Fictional guardian','current approved peer display name is returned');
select is(api.list_conversations_page()->'conversations'->0->>'preview',repeat('界',160),'preview truncates to 160 Unicode characters');
select is((api.list_conversations_page()->'conversations'->0->>'lastMessageAt')::timestamptz,'2026-02-01T12:00:00Z'::timestamptz,'preview timestamp belongs to the same visible message');
select is((api.list_conversations_page()->'conversations'->0->>'createdAt')::timestamptz,'2026-01-05T00:00:00Z'::timestamptz,'conversation creation time is distinct from activity');
select is(api.list_conversations_page()->>'hasMore','false','short page truthfully has no more rows');
select is(api.list_conversations_page()->>'nextBeforeId',null::text,'terminal page has no cursor');
select pg_temp.preview_identify(3);
select is(jsonb_array_length(api.list_conversations_page()->'conversations'),1,'another child cannot enumerate sibling conversations');
select throws_ok($$select api.list_conversations_page(50,pg_temp.preview_id(6,1))$$,'42501','not authorized','sibling-forged cursor is denied');
select pg_temp.preview_identify(1);
select is(jsonb_typeof(api.list_conversations()),'array','legacy zero-argument list keeps its array shape');
select is(jsonb_array_length(api.list_conversations()),50,'legacy wrapper remains bounded at 50');
select is(api.list_conversations_page()->>'hasMore','true','page exposes more rows instead of silently truncating');
select is(api.list_conversations_page()->>'nextBeforeId',pg_temp.preview_id(6,11)::text,'cursor advances through deterministic createdAt/UUID ordering');
select is(jsonb_array_length(api.list_conversations_page(50,pg_temp.preview_id(6,11))->'conversations'),4,'older page recovers every remaining conversation');
select is(api.list_conversations_page(50,pg_temp.preview_id(6,11))->'conversations'->0->>'id',pg_temp.preview_id(6,10)::text,'equal timestamps do not duplicate or skip the first older ID');
select is(api.list_conversations_page(50,pg_temp.preview_id(6,11))->>'hasMore','false','last nonempty page is terminal');
select is(api.list_conversations_page(50,pg_temp.preview_id(6,7))->'conversations','[]'::jsonb,'cursor beyond oldest row returns an empty page');
select is(api.list_conversations_page(1,pg_temp.preview_id(6,2))->'conversations'->0->>'preview',null::text,'empty conversations have no invented preview');
select is(api.list_conversations_page(1,pg_temp.preview_id(6,2))->'conversations'->0->>'lastMessageAt',null::text,'empty conversations have no invented message time');
select throws_ok($$select api.list_conversations_page(50,pg_temp.preview_id(6,3))$$,'42501','not authorized','guardian cannot use the child external chat as a cursor');
select throws_ok($$select api.list_conversations_page(0)$$,'22023','invalid page size','zero page limit is denied');
select throws_ok($$select api.list_conversations_page(51)$$,'22023','invalid page size','page limit above lock batch bound is denied');
select throws_ok($$select api.list_conversations_page(null)$$,'22023','invalid page size','null page size is denied');
select pg_temp.preview_identify(5);
select throws_ok($$select api.list_conversations_page(50,pg_temp.preview_id(6,1))$$,'42501','not authorized','cross-family guessed cursor is denied');
select throws_ok($$select api.list_conversations_page(50,'e6000000-0000-0000-0000-999999999999')$$,'42501','not authorized','missing and unauthorized cursor have the same denial');
select pg_temp.preview_identify(6);
select is(api.list_conversations_page()->'conversations','[]'::jsonb,'unrelated active account gets no participant rows');
select pg_temp.preview_identify(2);
select lives_ok($$select api.block_user(pg_temp.preview_id(1,1))$$,'child can block the guardian contact');
select is(api.list_conversations_page()->'conversations'->0->>'peerName','Connection unavailable','blocked contact receives no approved-name projection');
select is(api.list_conversations_page()->'conversations'->0->>'canExchange','false','blocked preview cannot imply current sending permission');
select is(api.list_conversations_page()->'conversations'->0->>'preview','Fictional acknowledged history','blocked incoming queued message is replaced by previously acknowledged history');
select is((api.list_conversations_page()->'conversations'->0->>'lastMessageAt')::timestamptz,'2026-02-01T11:00:00Z'::timestamptz,'hidden queued message does not leak its later timestamp');
select is(api.list_conversations_page()->'conversations'->0->>'preview',api.fetch_messages(pg_temp.preview_id(6,1))->'messages'->-1->>'body','preview agrees with fetch_messages visible history');
select pg_temp.preview_identify(1);
select is(api.list_conversations_page(1)->'conversations'->0->>'preview',repeat('界',160),'sender keeps their own sent preview after either-direction block');
reset role;
delete from app_private.messages where id=pg_temp.preview_id(7,2);
set local role authenticated;
select pg_temp.preview_identify(2);
select is(api.list_conversations_page()->'conversations'->0->>'preview','Fictional own sent history','own sent history remains when no incoming message was acknowledged');
reset role;
delete from app_private.private_blocks where blocker=pg_temp.preview_id(1,2) and blocked=pg_temp.preview_id(1,1);
update app_private.trusted_contacts set accepted_b_at=null where id=pg_temp.preview_id(5,1);
set local role authenticated;
select pg_temp.preview_identify(2);
select is(api.list_conversations_page()->'conversations'->0->>'peerName','Connection unavailable','missing acceptance never discloses an approved name');
select is(api.list_conversations_page()->'conversations'->0->>'preview','Fictional own sent history','missing acceptance cannot deliver queued incoming content');
reset role;
update app_private.trusted_contacts set accepted_b_at=now(),verified_until=now()-interval '1 minute' where id=pg_temp.preview_id(5,1);
set local role authenticated;
select pg_temp.preview_identify(2);
select is(api.list_conversations_page()->'conversations'->0->>'canExchange','false','expired verification denies current exchange');
select is(api.list_conversations_page()->'conversations'->0->>'preview','Fictional own sent history','expired verification cannot deliver queued incoming content');
reset role;
update app_private.trusted_contacts set verified_until=now()+interval '1 day',revoked_at=now() where id=pg_temp.preview_id(5,1);
set local role authenticated;
select pg_temp.preview_identify(2);
select is(api.list_conversations_page()->'conversations'->0->>'peerName','Connection unavailable','revoked relationship never exposes an approved-name projection');
select is(api.list_conversations_page()->'conversations'->0->>'preview','Fictional own sent history','revocation preserves only authorized history');
select lives_ok($$select api.block_user(pg_temp.preview_id(1,5))$$,'child may also block an outside-family endpoint');
select is(api.list_conversations_page()->'conversations'->1->>'preview',null::text,'queued-only incoming conversation has no preview after block');
select is(api.list_conversations_page()->'conversations'->1->>'lastMessageAt',null::text,'queued-only incoming conversation has no activity-time leak after block');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id=pg_temp.preview_id(1,2);
set local role authenticated;
select pg_temp.preview_identify(2);
select throws_ok($$select api.list_conversations_page()$$,'42501','not authorized','revoked managed session cannot read previews using an old JWT');
select throws_ok($$select api.list_conversations()$$,'42501','not authorized','legacy wrapper also rechecks managed session revocation');
reset role;
update auth.sessions set not_after=null where id=pg_temp.preview_id(1,2);
update app_private.consents set status='withdrawn',withdrawn_at=now() where child_id=pg_temp.preview_id(3,2);
set local role authenticated;
select pg_temp.preview_identify(2);
select throws_ok($$select api.list_conversations_page()$$,'42501','not authorized','withdrawn consent prevents child preview access');
reset role;
select * from finish();
rollback;
