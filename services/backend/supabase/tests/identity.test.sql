begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();

-- Tests own their rolled-back policy fixture, even after the local seed was run.
update app_private.deployment_policy set local_synthetic=false where singleton;
select throws_ok($$update app_private.deployment_policy set guardian_managed_children=false where singleton$$,
  '23514',null,'guardian-managed child and teen onboarding cannot be switched off');

select ok(not (select public_enrollment_enabled from app_private.deployment_policy), 'public enrollment is closed by default');
select ok(not (select real_child_data_enabled from app_private.deployment_policy), 'real child collection is closed by default');
select ok(not has_schema_privilege('authenticated','app_private','USAGE'), 'raw schema is inaccessible');
select ok(not has_function_privilege('authenticated','api.issue_parent_registration(text)','EXECUTE'), 'clients cannot issue parent-purpose tokens');
select ok(not has_function_privilege('anon','api.get_context()','EXECUTE'), 'anonymous callers have no identity context');
select throws_ok($$select app_private.issue_parent_registration('unapproved@fixture.test')$$,'42501','enrollment unavailable','even reserved addresses require an explicit local policy');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'self@fixture.test','{"kind":"parent","role":"guardian"}')$$,
  '42501','registration intent required','Auth creation cannot promote metadata into authority');

update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
select throws_ok($$select app_private.issue_parent_registration('real@example.com')$$,'42501','enrollment unavailable','synthetic mode does not admit ordinary email domains');
create temporary table identity_values(key text primary key,value jsonb);
insert into identity_values values('recipient-check',app_private.issue_parent_registration('bound@fixture.test'));
select is(app_private.valid_registration('swapped@fixture.test',(select value->>'token' from identity_values where key='recipient-check')),
  null::uuid,'unconsumed registration intent is bound to exact recipient');
update app_private.registration_intents set expires_at=now()-interval '1 second' where email='bound@fixture.test';
select is(app_private.valid_registration('bound@fixture.test',(select value->>'token' from identity_values where key='recipient-check')),
  null::uuid,'expired registration token is rejected');
select is((app_private.before_user_created('{"user":{"email":"real@example.com","user_metadata":{"kind":"parent"}}}')->'error'->>'http_code'),
  '403','Auth hook rejects real self-signup before identity creation');
create function pg_temp.fixture_parent(p_id uuid,p_email text) returns void language plpgsql as $$
declare v_token text;
begin
  v_token := app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{"provider":"email","providers":["email"]}',
      jsonb_build_object('registration_token',v_token,'kind','parent','role','guardian'),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end;
$$;
create function pg_temp.identify(p_id uuid,p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated',
    'session_id',coalesce(p_session,p_id),'exp',extract(epoch from now()+interval '1 hour'))::text,true);
end;
$$;
do $$ begin
  perform pg_temp.fixture_parent('10000000-0000-0000-0000-000000000001','guardian@fixture.test');
  perform pg_temp.fixture_parent('10000000-0000-0000-0000-000000000002','outsider@fixture.test');
  perform pg_temp.fixture_parent('10000000-0000-0000-0000-000000000003','operator@fixture.test');
  perform pg_temp.fixture_parent('10000000-0000-0000-0000-000000000004','invitee@fixture.test');
end $$;
select is((select kind from app_private.profiles where user_id='10000000-0000-0000-0000-000000000001'),'pending','metadata cannot bootstrap a guardian');
select ok(not exists(select 1 from auth.users where raw_user_meta_data ? 'registration_token'),'bearer enrollment tokens are removed from Auth metadata');
update app_private.profiles set kind='parent',state='active',display_name='Synthetic adult' where user_id<>'10000000-0000-0000-0000-000000000001';
insert into app_private.operators(user_id,scope,active) values('10000000-0000-0000-0000-000000000003','consent',true);
insert into app_private.operators(user_id,scope,active) values('10000000-0000-0000-0000-000000000001','consent',true);

set local role authenticated;
select pg_temp.identify('10000000-0000-0000-0000-000000000001');
select lives_ok($$select api.bootstrap_parent('Guardian')$$,'parent-purpose identity can complete onboarding');
select throws_ok($$select api.bootstrap_parent('Guardian')$$,'42501','not authorized','parent bootstrap is one-use');
select throws_ok($$insert into app_private.memberships(family_id,user_id,role) values(gen_random_uuid(),auth.uid(),'guardian')$$,
  '42501',null,'raw membership writes are denied');
select throws_ok($$insert into app_private.operators(user_id,scope,active) values(auth.uid(),'consent',true)$$,
  '42501',null,'guardian cannot grant themselves operator authority');
select throws_ok($$select api.create_family('Bad timezone','Client/Forgery')$$,'22023','invalid timezone','client cannot invent a financial timezone');
reset role;
do $$ begin
  perform pg_temp.identify('10000000-0000-0000-0000-000000000001');
  insert into identity_values values('family',to_jsonb(api.create_family('Synthetic family','America/New_York')));
  insert into identity_values values('child',to_jsonb(api.create_child((select (value#>>'{}')::uuid from identity_values where key='family'),'Younger child')));
  insert into identity_values values('teen',to_jsonb(api.create_child((select (value#>>'{}')::uuid from identity_values where key='family'),'Older teen')));
  insert into identity_values values('consent',to_jsonb(api.request_child_consent((select (value#>>'{}')::uuid from identity_values where key='child'),'synthetic-v1','synthetic-v1')));
  perform set_config('test.identity_family',(select value#>>'{}' from identity_values where key='family'),true);
  perform set_config('test.identity_child',(select value#>>'{}' from identity_values where key='child'),true);
  perform set_config('test.identity_teen',(select value#>>'{}' from identity_values where key='teen'),true);
  perform set_config('test.identity_consent',(select value#>>'{}' from identity_values where key='consent'),true);
end $$;
set local role authenticated;
select throws_ok($$select api.revoke_membership(current_setting('test.identity_family')::uuid,auth.uid())$$,
  '42501','last guardian requires reviewed dispute procedure','last guardian cannot bypass confidential dispute handling');
select throws_ok($$select api.begin_child_enrollment(current_setting('test.identity_child')::uuid)$$,'42501','verified consent required','guardian checkbox alone cannot enroll a young child');
select throws_ok($$select api.begin_child_enrollment(current_setting('test.identity_teen')::uuid,'teen@fixture.test')$$,'42501','verified consent required','teens have the same guardian and consent gate');
select throws_ok($$select api.verify_child_consent(current_setting('test.identity_consent')::uuid,'synthetic_fixture','fixture:consent',now()+interval '1 day')$$,
  '42501','not authorized','guardian cannot self-verify consent');
select pg_temp.identify('10000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(api.get_context()->'children'),0,'another family cannot enumerate child names');
select throws_ok($$select api.create_child(current_setting('test.identity_family')::uuid,'Forged child')$$,'42501','not authorized','cross-family child creation denied');
select throws_ok($$select api.begin_child_enrollment(current_setting('test.identity_child')::uuid)$$,'42501','not authorized','outsider cannot initiate child setup');
select pg_temp.identify('10000000-0000-0000-0000-000000000003');
select throws_ok($$select api.verify_child_consent(current_setting('test.identity_consent')::uuid,'email','fixture:email',now()+interval '1 day')$$,
  '22023','invalid verification evidence','email ownership is not verified parental consent');
select lives_ok($$select api.verify_child_consent(current_setting('test.identity_consent')::uuid,'synthetic_fixture','fixture:independent-review',now()+interval '1 day')$$,
  'independent assigned operator can record fictional evidence');
select throws_ok($$select api.verify_child_consent(current_setting('test.identity_consent')::uuid,'synthetic_fixture','fixture:replay',now()+interval '1 day')$$,
  '42501','not authorized','verification cannot be replayed to replace accepted evidence');
reset role;
do $$ declare v_material jsonb; v_child_user uuid := '10000000-0000-0000-0000-000000000005'; begin
  perform pg_temp.identify('10000000-0000-0000-0000-000000000001');
  v_material := api.begin_child_enrollment(current_setting('test.identity_child')::uuid);
  insert into identity_values values('enrollment',v_material);
  perform set_config('test.identity_child_token',v_material->>'token',true);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
    values(v_child_user,v_material->>'email',now(),jsonb_build_object('registration_token',v_material->>'token','kind','parent'),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(v_child_user,v_child_user,now(),now());
end $$;
select ok((select (value->>'authAlias')::boolean from identity_values where key='enrollment'),'personal child email is optional');
select is((select kind from app_private.profiles where user_id='10000000-0000-0000-0000-000000000005'),'child','child intent ignores forged parent metadata');
select ok(not app_private.account_usable('10000000-0000-0000-0000-000000000005'),'Auth creation alone is not account activation');
select is(app_private.valid_registration('substitution@fixture.test',current_setting('test.identity_child_token')),null::uuid,'token cannot substitute another recipient or be reused for Auth creation');
set local role authenticated;
select pg_temp.identify('10000000-0000-0000-0000-000000000005');
select throws_ok($$select api.bootstrap_parent('Forged adult')$$,'42501','not authorized','enrolled child cannot promote to parent');
select lives_ok($$select api.accept_child_enrollment(current_setting('test.identity_child_token'))$$,'independent child identity accepts guardian-managed enrollment');
select throws_ok($$select api.accept_child_enrollment(current_setting('test.identity_child_token'))$$,'42501','not authorized','child acceptance is single-use');
select is(jsonb_array_length(api.get_context()->'children'),1,'child sees only their own child subject');
select throws_ok($$select api.invite_guardian(current_setting('test.identity_family')::uuid,'other@fixture.test')$$,'42501','not authorized','child cannot become an inviting guardian');
reset role;
select ok(app_private.account_usable('10000000-0000-0000-0000-000000000005'),'verified consent plus enrollment activates child authority');
do $$ declare v_token text; begin
  perform pg_temp.identify('10000000-0000-0000-0000-000000000001');
  v_token := api.invite_guardian(current_setting('test.identity_family')::uuid,'invitee@fixture.test')->>'token';
  perform set_config('test.identity_guardian_token',v_token,true);
end $$;
set local role authenticated;
select pg_temp.identify('10000000-0000-0000-0000-000000000002');
select throws_ok($$select api.accept_guardian_invite(current_setting('test.identity_guardian_token'))$$,'42501','not authorized','guardian invitation is recipient-bound');
select pg_temp.identify('10000000-0000-0000-0000-000000000004');
select lives_ok($$select api.accept_guardian_invite(current_setting('test.identity_guardian_token'))$$,'intended verified adult accepts invitation');
select throws_ok($$select api.accept_guardian_invite(current_setting('test.identity_guardian_token'))$$,'42501','not authorized','guardian invitation cannot be replayed');
select pg_temp.identify('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
select throws_ok($$select api.get_context()$$,'42501','not authorized','session must belong to JWT subject');
reset role;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001',
    'session_id','10000000-0000-0000-0000-000000000001','exp',0)::text,true);
end $$;
set local role authenticated;
select throws_ok($$select api.get_context()$$,'42501','not authorized','expired JWT rejected even with extant session');
select pg_temp.identify('10000000-0000-0000-0000-000000000001');
select lives_ok($$select api.withdraw_consent(current_setting('test.identity_child')::uuid)$$,'guardian withdrawal suspends child authority atomically');
select pg_temp.identify('10000000-0000-0000-0000-000000000005');
select throws_ok($$select api.get_context()$$,'42501','not authorized','existing child JWT fails immediately after withdrawal');
reset role;
select ok(not app_private.account_usable('10000000-0000-0000-0000-000000000005'),'withdrawn child is unusable to messaging and finance helpers');
delete from auth.sessions where id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.identify('10000000-0000-0000-0000-000000000002');
select throws_ok($$select api.get_context()$$,'42501','not authorized','deleted managed session invalidates old JWT');
reset role;
select * from finish();
rollback;
