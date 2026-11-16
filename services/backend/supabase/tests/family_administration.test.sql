-- Owner runs after migration019; fictional, isolated transactional fixtures only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
update app_private.deployment_policy set local_synthetic=true,notice_version='family-admin-v1',consent_policy_version='family-admin-v1' where singleton;
create function pg_temp.family_admin_id(p_group int,p_number int) returns uuid language sql immutable as $$
  select ('a'||p_group::text||'190000-0000-0000-0000-'||lpad(p_number::text,12,'0'))::uuid;
$$;
create function pg_temp.family_admin_identify(p_number int,p_session int default null) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.family_admin_id(1,p_number),'session_id',pg_temp.family_admin_id(1,coalesce(p_session,p_number)),
  'role','authenticated','exp',extract(epoch from now()+interval '1 hour'),'user_metadata',jsonb_build_object('role','guardian','kind','parent'))::text,true);end $$;
do $$ declare i int;u uuid;token text;begin
  for i in 1..56 loop
    u:=pg_temp.family_admin_id(1,i);token:=app_private.issue_parent_registration('familyadmin'||i::text||'@fixture.test')->>'token';
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
      values(u,'familyadmin'||i::text||'@fixture.test',now(),jsonb_build_object('registration_token',token),now(),now());
    insert into auth.sessions(id,user_id,created_at,updated_at) values(u,u,now(),now());
  end loop;
end $$;
update app_private.profiles set kind='parent',state='active',display_name='Fictional approved parent' where user_id::text like 'a1190000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Fictional child' where user_id in(pg_temp.family_admin_id(1,3),pg_temp.family_admin_id(1,4));
insert into app_private.families(id,name,timezone) values(pg_temp.family_admin_id(2,1),'Fictional administered family','UTC'),(pg_temp.family_admin_id(2,2),'Fictional separate family','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state)
  select pg_temp.family_admin_id(3,i),pg_temp.family_admin_id(2,1),'Fictional child',pg_temp.family_admin_id(1,i),'active' from generate_series(3,4) i;
insert into app_private.memberships(family_id,user_id,role,child_id)
  select pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,i),case when i in(3,4) then 'child' else 'guardian' end,
    case when i in(3,4) then pg_temp.family_admin_id(3,i) else null end from generate_series(1,56) i where i not in(5,6);
insert into app_private.memberships(family_id,user_id,role) values(pg_temp.family_admin_id(2,2),pg_temp.family_admin_id(1,5),'guardian');
insert into app_private.operators(user_id,scope,active) values(pg_temp.family_admin_id(1,6),'consent',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  values(pg_temp.family_admin_id(3,3),pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,1),'verified','family-admin-v1','family-admin-v1','synthetic_fixture','fixture:family-admin-consent',pg_temp.family_admin_id(1,6),now(),now()+interval '1 day');
-- User4 has a membership but no verified consent: do not project an approved member.
insert into app_private.guardian_invites(id,family_id,email,issued_by,token_hash,expires_at)
  values(pg_temp.family_admin_id(4,1),pg_temp.family_admin_id(2,1),'fictional-unused-invite@fixture.test',pg_temp.family_admin_id(1,2),extensions.digest('fictional-family-admin-invite','sha256'),now()+interval '1 day');

select ok(has_function_privilege('authenticated','api.list_family_members(uuid,integer,uuid)','EXECUTE'),'family listing is an authenticated RPC');
select ok(not has_function_privilege('anon','api.list_family_members(uuid,integer,uuid)','EXECUTE'),'anonymous family listing is denied');
select ok(not has_function_privilege('service_role','api.list_family_members(uuid,integer,uuid)','EXECUTE'),'service transport has no guardian directory capability');
select ok(not has_table_privilege('authenticated','app_private.memberships','SELECT'),'raw family directory remains private');
set local role authenticated;
select pg_temp.family_admin_identify(1);
select is(jsonb_array_length(api.list_family_members(pg_temp.family_admin_id(2,1))->'members'),50,'member page is bounded to 50');
select is(api.list_family_members(pg_temp.family_admin_id(2,1))->>'hasMore','true','more approved members have a usable continuation');
select is(api.list_family_members(pg_temp.family_admin_id(2,1))->>'nextBeforeUserId',pg_temp.family_admin_id(1,7)::text,'stable descending UID cursor advances past exactly 50 members');
select is(jsonb_array_length(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->'members'),3,'older page includes approved child and both original guardians');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->>'hasMore','false','terminal member page is explicit');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->>'nextBeforeUserId',null::text,'terminal page has no cursor');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,1))->'members','[]'::jsonb,'oldest cursor produces an empty page');
select is((select string_agg(k,',' order by k) from jsonb_object_keys(api.list_family_members(pg_temp.family_admin_id(2,1))->'members'->0) k),
  'childId,currentOwn,displayName,kind,role,userId','directory exposes only the six approved membership fields');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->'members'->0->>'kind','child','child kind comes from trusted profile');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->'members'->0->>'childId',pg_temp.family_admin_id(3,3)::text,'approved child has its own family-bound child ID');
select is(api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,7))->'members'->-1->>'currentOwn','true','currentOwn identifies only the managed requesting author');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,4))$$,'42501','not authorized','unapproved membership cannot be used as a directory cursor');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,5))$$,'42501','not authorized','other-family user cannot be forged as a cursor');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),50,'a1190000-0000-0000-0000-999999999999')$$,'42501','not authorized','unknown cursor has the same denial');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),0)$$,'22023','invalid page size','zero page size is denied');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),51)$$,'22023','invalid page size','oversized page is denied');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),null)$$,'22023','invalid page size','null page size is denied');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,2))$$,'42501','not authorized','guardian cannot list another family');
select throws_ok($$select api.revoke_membership(pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,5))$$,'42501','not authorized','guardian cannot revoke a guessed outside-family account');
select pg_temp.family_admin_identify(3);
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','child cannot list guardian directory despite forged role metadata');
select throws_ok($$select api.revoke_membership(pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,2))$$,'42501','not authorized','child cannot revoke guardians despite forged parent metadata');
select pg_temp.family_admin_identify(5);
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','outside guardian has no directory access');
select is(jsonb_array_length(api.list_family_members(pg_temp.family_admin_id(2,2))->'members'),1,'outside guardian sees only their own family');
select pg_temp.family_admin_identify(1,2);
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','another user session cannot authorize the guardian list');
select pg_temp.family_admin_identify(1);
select lives_ok($$select api.revoke_membership(pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,2))$$,'existing guardian removal RPC remains reusable');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1),50,pg_temp.family_admin_id(1,2))$$,'42501','not authorized','revoked membership no longer supplies a cursor');
select pg_temp.family_admin_identify(2);
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','removed guardian immediately loses family directory access');
select is(jsonb_array_length(api.get_context()->'families'),0,'removed guardian no longer receives the family context');
select is(api.get_privacy_context()->>'userId',pg_temp.family_admin_id(1,2)::text,'removed guardian retains narrow own-account privacy access');
reset role;
select ok((select revoked_at is not null from app_private.guardian_invites where id=pg_temp.family_admin_id(4,1)),'existing removal revokes pending guardian invitations issued by the target');
set local role authenticated;
select pg_temp.family_admin_identify(1);
select lives_ok($$select api.revoke_membership(pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,3))$$,'guardian removes child membership through the original endpoint');
select pg_temp.family_admin_identify(3);
select throws_ok($$select api.get_context()$$,'42501','not authorized','removed child immediately loses family application authority');
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','removed child cannot use an old JWT for family directory');
select is(api.get_privacy_context()->>'userId',pg_temp.family_admin_id(1,3)::text,'removed child retains their own privacy identity portal');
select is(api.get_privacy_context()->>'kind','child','removal does not promote or impersonate the child');
reset role;
select is((select status from app_private.consents where child_id=pg_temp.family_admin_id(3,3)),'revoked','existing child removal revokes family consent');
select is((select state from app_private.profiles where user_id=pg_temp.family_admin_id(1,3)),'active','family removal does not erase or close independent profile');
update app_private.memberships set status='revoked' where family_id=pg_temp.family_admin_id(2,1) and user_id>=pg_temp.family_admin_id(1,7);
set local role authenticated;
select pg_temp.family_admin_identify(1);
select throws_ok($$select api.revoke_membership(pg_temp.family_admin_id(2,1),pg_temp.family_admin_id(1,1))$$,'42501','last guardian requires reviewed dispute procedure','original last-guardian guard cannot be bypassed');
select is(jsonb_array_length(api.list_family_members(pg_temp.family_admin_id(2,1))->'members'),1,'only the final approved guardian remains visible');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id=pg_temp.family_admin_id(1,1);
set local role authenticated;
select pg_temp.family_admin_identify(1);
select throws_ok($$select api.list_family_members(pg_temp.family_admin_id(2,1))$$,'42501','not authorized','revoked managed session cannot reuse guardian directory authority');
reset role;
select * from finish();
rollback;
