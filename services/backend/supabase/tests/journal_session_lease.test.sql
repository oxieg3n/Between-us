-- Metadata-only fictional fixtures. Root applies024/runs this transactional suite; no vault content is involved.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(has_function_privilege('authenticated','api.get_journal_session_lease()','EXECUTE'),'current authenticated authors may request own lease metadata');
select ok(not has_function_privilege('anon','api.get_journal_session_lease()','EXECUTE'),'anonymous callers cannot mint a lease');
select ok(not has_function_privilege('service_role','api.get_journal_session_lease()','EXECUTE'),'service credentials cannot impersonate a journal author');
select is((select pronargs::int from pg_proc where oid='api.get_journal_session_lease()'::regprocedure),0,'lease API accepts no identity/session/clock inputs');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-journal-lease',consent_policy_version='synthetic-journal-lease' where singleton;
update app_private.account_management_policy set auth_issuer='http://127.0.0.1:54321/auth/v1' where singleton;
create function pg_temp.journal_lease_user(p_id uuid,p_email text) returns void language plpgsql as $$ declare token text;begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p_id,p_email,now(),'{}',jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
do $$ declare i int;begin for i in 1..4 loop
  perform pg_temp.journal_lease_user(('f1000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'journal-lease'||i||'@fixture.test');
end loop;end $$;
update app_private.profiles set kind='parent',state='active' where user_id::text like 'f1000000-%';
update app_private.profiles set kind='child',auth_alias=true where user_id='f1000000-0000-0000-0000-000000000002';
insert into app_private.families(id,name,timezone) values('f2000000-0000-0000-0000-000000000001','Fictional journal lease family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001',
  'Fictional journal lease child','f1000000-0000-0000-0000-000000000002','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','guardian',null),
  ('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002','child','f3000000-0000-0000-0000-000000000001');
insert into app_private.operators(user_id,scope,active) values('f1000000-0000-0000-0000-000000000003','consent',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values('f3000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','verified',
  'synthetic-journal-lease','synthetic-journal-lease','synthetic_fixture','fixture:not-real-consent','f1000000-0000-0000-0000-000000000003',now(),now()+interval '1 day');
create function pg_temp.journal_lease_claims(p_user uuid,p_session uuid,p_exp jsonb default null,p_extra jsonb default '{}') returns void
language plpgsql as $$ begin
  perform set_config('request.jwt.claims',(jsonb_build_object('sub',p_user,'session_id',p_session,'role','authenticated',
    'iss','http://127.0.0.1:54321/auth/v1','exp',coalesce(p_exp,to_jsonb(extract(epoch from clock_timestamp()+interval '1 day'))))||p_extra)::text,true);
end $$;
set local role authenticated;
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
select is(api.get_journal_session_lease()->>'remainingMs','900000','long valid session is capped to fifteen minutes');
select is(api.get_journal_session_lease()->>'subject','f1000000-0000-0000-0000-000000000001','guardian lease belongs to guardian only');
select is(api.get_journal_session_lease()->>'sessionId','f1000000-0000-0000-0000-000000000001','lease binds the actual current managed session');
select is(api.get_journal_session_lease()->>'issuer','http://127.0.0.1:54321/auth/v1','lease returns approved exact issuer');
select ok(api.get_journal_session_lease()-array['issuer','subject','sessionId','remainingMs']='{}'::jsonb,'exact metadata DTO contains no body/token/role/absolute device timestamp');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',to_jsonb(extract(epoch from clock_timestamp()+interval '1 minute')));
select ok((api.get_journal_session_lease()->>'remainingMs')::int between 1 and 60000,'earlier JWT expiry bounds remaining milliseconds');
reset role;
update auth.sessions set not_after=clock_timestamp()+interval '30 seconds' where id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
select ok((api.get_journal_session_lease()->>'remainingMs')::int between 1 and 30000,'earlier actual managed-session not_after bounds lease');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000004');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','foreign session cannot be paired with an own subject');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',null,'{"role":"service_role","user_metadata":{"role":"authenticated"}}');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','forged metadata cannot replace exact authenticated JWT role');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',null,'{"iss":"https://other.invalid/auth/v1"}');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','wrong issuer denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',null,'{"session_id":null}');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','missing session denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',null,'{"session_id":"malformed"}');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','malformed session claim denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','"NaN"');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','NaN NumericDate denied even where ordinary numeric cast accepts it');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','"Infinity"');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','infinite expiry denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','"invalid"');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','malformed expiry denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',null,'{"exp":null}');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','missing/null expiry denied');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',to_jsonb(extract(epoch from now())+0.001));
select pg_sleep(0.02);
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','DB clock rejects expired JWT even inside a transaction whose now() remains earlier');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002',null,'{"user_metadata":{"role":"guardian"}}');
select is(api.get_journal_session_lease()->>'subject','f1000000-0000-0000-0000-000000000002','consenting child gets only its own distinct author lease despite forged guardian metadata');
reset role;
update app_private.consents set expires_at=clock_timestamp()+interval '20 seconds' where child_id='f3000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok((api.get_journal_session_lease()->>'remainingMs')::int between 1 and 20000,'known earlier child consent expiry conservatively caps offline writing');
reset role;
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  select child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,'fixture:second-earlier-consent',verified_by,now(),clock_timestamp()+interval '10 seconds'
    from app_private.consents where child_id='f3000000-0000-0000-0000-000000000001';
set local role authenticated;
select ok((api.get_journal_session_lease()->>'remainingMs')::int between 1 and 10000,'multiple qualifying consents use the earliest known expiry');
reset role;
update auth.sessions set not_after=null where id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
select is(api.get_journal_session_lease()->>'remainingMs','900000','parent own lease is independent of child consent expiry');
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002');
reset role;
update app_private.consents set expires_at=now()+interval '0.001 seconds' where child_id='f3000000-0000-0000-0000-000000000001';
select pg_sleep(0.02);
set local role authenticated;
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','DB clock denies expired consent even when transaction-start account_usable still sees it valid');
reset role;
update app_private.consents set expires_at=clock_timestamp()+interval '1 day' where child_id='f3000000-0000-0000-0000-000000000001';
update app_private.consents set status='withdrawn',withdrawn_at=clock_timestamp() where child_id='f3000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','withdrawn current child consent denies another lease');
reset role;
update app_private.consents set status='verified',withdrawn_at=null where child_id='f3000000-0000-0000-0000-000000000001';
update app_private.profiles set state='onboarding' where user_id='f1000000-0000-0000-0000-000000000004';
set local role authenticated;
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000004');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','not-yet-active account cannot get private writing lease');
reset role;
update app_private.profiles set state='suspended' where user_id='f1000000-0000-0000-0000-000000000004';
set local role authenticated;
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','suspended account cannot get another writing lease');
reset role;
update app_private.profiles set state='closed' where user_id='f1000000-0000-0000-0000-000000000004';
set local role authenticated;
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','closed account privacy access does not authorize journal lease');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.journal_lease_claims('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','expired managed session denied');
reset role;
delete from auth.sessions where id='f1000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','deleted managed session cannot be revived by old JWT');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select api.get_journal_session_lease()$$,'42501','not authorized','missing actor claims denied');
reset role;
select * from finish();
rollback;
