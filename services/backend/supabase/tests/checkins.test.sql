begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_table_privilege('authenticated','app_private.checkin_invitations','SELECT'),'private child choices have no direct client select');
select ok(not has_table_privilege('authenticated','app_private.checkin_schedules','INSERT'),'client cannot forge schedule ownership');
select ok(not has_function_privilege('authenticated','api.run_checkin_retention(uuid,uuid,integer)','EXECUTE'),'retention requires trusted operator transport');
select is((select count(*)::int from pg_publication_tables where tablename like 'checkin_%'),0,'questions and choices are not published');
update app_private.deployment_policy set local_synthetic=true,notice_version='synthetic-v1',consent_policy_version='synthetic-v1' where singleton;
update app_private.privacy_lifecycle_policy set execution_enabled=true,retention_enabled=true,synthetic_fixture_mode=true,reviewed_policy_id='synthetic-checkins-v1' where singleton;
create function pg_temp.checkin_user(p_id uuid,p_email text) returns void language plpgsql as $$
declare token text;
begin
  token:=app_private.issue_parent_registration(p_email)->>'token';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values(p_id,p_email,now(),jsonb_build_object('registration_token',token),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values(p_id,p_id,now(),now());
end $$;
create function pg_temp.checkin_identify(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',p_id,'exp',extract(epoch from clock_timestamp()+interval '1 hour'),
    'user_metadata',jsonb_build_object('role','guardian','verified',true))::text,true);
end $$;
do $$ declare i int; begin for i in 1..7 loop perform pg_temp.checkin_user(('50000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'checkin'||i::text||'@checkins.test'); end loop; end $$;
update app_private.profiles set kind='parent',state='active',display_name='Synthetic adult' where user_id::text like '50000000-%';
update app_private.profiles set kind='child',auth_alias=true,display_name='Synthetic child' where user_id in('50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000006');
insert into app_private.families(id,name,timezone) values('51000000-0000-0000-0000-000000000001','Synthetic A','UTC'),('51000000-0000-0000-0000-000000000002','Synthetic B','UTC');
insert into app_private.children(id,family_id,name,account_user_id,state) values
  ('52000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001','Child A','50000000-0000-0000-0000-000000000003','active'),
  ('52000000-0000-0000-0000-000000000005','51000000-0000-0000-0000-000000000002','Other family child','50000000-0000-0000-0000-000000000005','active'),
  ('52000000-0000-0000-0000-000000000006','51000000-0000-0000-0000-000000000001','Sibling','50000000-0000-0000-0000-000000000006','active');
insert into app_private.memberships(family_id,user_id,role,child_id) values
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','guardian',null),
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','guardian',null),
  ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','guardian',null),
  ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000007','guardian',null),
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','child','52000000-0000-0000-0000-000000000003'),
  ('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000005','child','52000000-0000-0000-0000-000000000005'),
  ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000006','child','52000000-0000-0000-0000-000000000006');
insert into app_private.operators(user_id,scope,active) values('50000000-0000-0000-0000-000000000004','privacy',true),
  ('50000000-0000-0000-0000-000000000004','verification',true),('50000000-0000-0000-0000-000000000004','consent',true);
insert into app_private.consents(child_id,family_id,guardian_user_id,status,notice_version,policy_version,method,evidence_reference,verified_by,verified_at,expires_at)
  select id,family_id,'50000000-0000-0000-0000-000000000002','verified','synthetic-v1','synthetic-v1','synthetic_fixture','fixture:consent',
    '50000000-0000-0000-0000-000000000004',now(),now()+interval '1 day' from app_private.children where id::text like '52000000-%';
insert into app_private.trusted_contacts(id,family_id,a,b,requested_by,accepted_a_at,accepted_b_at,approved_b_by) values
  ('53000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001',now(),now(),'50000000-0000-0000-0000-000000000002'),
  ('53000000-0000-0000-0000-000000000006','51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000002',now(),now(),'50000000-0000-0000-0000-000000000001');
select set_config('test.checkin_today',extract(isodow from clock_timestamp() at time zone 'UTC')::int::text,true);
select set_config('test.checkin_tomorrow',((extract(isodow from clock_timestamp() at time zone 'UTC')::int%7)+1)::text,true);
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','CHECKIN QUESTION',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000001')$$,'42501','not authorized','contact approval without independent verification cannot schedule');
reset role;
set local role service_role;
select lives_ok($$select api.verify_contact('53000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:checkin')$$,'independent contact verification fixture');
select lives_ok($$select api.verify_contact('53000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000004','synthetic_fixture','fixture:sibling')$$,'sibling independent verification fixture');
reset role;
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Forged guardian',array[1],'00:00','UTC',gen_random_uuid())$$,'42501','not authorized','client guardian metadata cannot authorize child scheduling');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000007');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Cross family',array[1],'00:00','UTC',gen_random_uuid())$$,'42501','not authorized','other-family guardian denied');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Question',array[1,1],'00:00','UTC',gen_random_uuid())$$,'22023','invalid schedule','duplicate weekday invalid');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Question',array[1],'25:00','UTC',gen_random_uuid())$$,'22023','invalid schedule','invalid clock input rejected');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Question',array[1],'00:00','Invented/Timezone',gen_random_uuid())$$,'22023','invalid schedule','invented timezone rejected');
select set_config('test.checkin_schedule',api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','CHECKIN QUESTION',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000001')->>'id',true);
select is(api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','CHECKIN QUESTION',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000001')->>'id',current_setting('test.checkin_schedule'),'retry creates only one schedule');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Changed replay',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000001')$$,'22023','idempotency conflict','changed-content retry rejected');
select set_config('test.checkin_future',api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','FUTURE QUESTION',array[current_setting('test.checkin_tomorrow')::int],'00:00','UTC','54000000-0000-0000-0000-000000000002')->>'id',true);
select set_config('test.checkin_parent_before',api.list_checkin_schedules()::text,true);
select is(api.list_checkin_invitations(),'[]'::jsonb,'guardian has no child invitation/state listing');
select throws_ok($$select api.refresh_checkin_invitations()$$,'42501','not authorized','guardian cannot materialize child private invitation history');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select lives_ok($$select api.refresh_checkin_invitations()$$,'child app-open due check uses current server time');
select lives_ok($$select api.refresh_checkin_invitations()$$,'same server occurrence can be retried safely');
select is(jsonb_array_length(api.list_checkin_invitations()),1,'future weekday does not deliver early or create backlog');
select set_config('test.checkin_invitation',api.list_checkin_invitations()->0->>'id',true);
select is(api.prepare_checkin_response(current_setting('test.checkin_invitation')::uuid)->>'recipientId','50000000-0000-0000-0000-000000000001','prepare chooses authenticated invitation creator, never caller-supplied recipient');
select is(api.prepare_little_conversation('50000000-0000-0000-0000-000000000001')->>'sent','false','child Little Conversations prepares without sending');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.checkin_invitation')::uuid,'defer')$$,'child can set aside privately');
select is(api.list_checkin_invitations(),'[]'::jsonb,'default view does not nag deferred invitation');
select is(jsonb_array_length(api.list_checkin_invitations(true)),1,'explicit child request can show set-aside invitation');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.checkin_invitation')::uuid,'resume')$$,'child can reopen without parent approval');
reset role;
select is((select count(*)::int from app_private.checkin_invitations where schedule_id=current_setting('test.checkin_schedule')::uuid),1,'one row per schedule/local date');
select is((select local_date from app_private.checkin_invitations where id=current_setting('test.checkin_invitation')::uuid),(clock_timestamp() at time zone 'UTC')::date,'occurrence date is server-derived');
select set_config('test.checkin_outbox',(select count(*)::text from app_private.notification_outbox),true);
select set_config('test.checkin_invalidations',(select count(*)::text from api.user_invalidations),true);
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000005');
select throws_ok($$select api.set_checkin_disposition(current_setting('test.checkin_invitation')::uuid,'skip')$$,'42501','not authorized','other-family child cannot change private choice');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000006');
select throws_ok($$select api.prepare_checkin_response(current_setting('test.checkin_invitation')::uuid)$$,'42501','not authorized','sibling cannot read/prepare another child invitation');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select is(api.prepare_little_conversation('50000000-0000-0000-0000-000000000003')->>'sent','false','guardian can answer Little Conversations in own words too');
select throws_ok($$select api.set_checkin_disposition(current_setting('test.checkin_invitation')::uuid,'skip')$$,'42501','not authorized','guardian cannot set or inspect child skip state');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select lives_ok($$select api.set_checkin_disposition(current_setting('test.checkin_invitation')::uuid,'skip')$$,'skip is an optional private choice');
select lives_ok($$select api.refresh_checkin_invitations()$$,'skip plus retry never rematerializes same occurrence');
select is(api.list_checkin_invitations(true),'[]'::jsonb,'skipped occurrence stays out of invitations');
select throws_ok($$select api.prepare_checkin_response(current_setting('test.checkin_invitation')::uuid)$$,'42501','not authorized','skip cannot prepare a stale invocation');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select is(api.list_checkin_schedules()::text,current_setting('test.checkin_parent_before'),'guardian projection unchanged by child defer/resume/skip');
reset role;
select is((select count(*)::text from app_private.notification_outbox),current_setting('test.checkin_outbox'),'private skip creates no push work');
select is((select count(*)::text from api.user_invalidations),current_setting('test.checkin_invalidations'),'private skip creates no parent activity signal');
select is((select count(*)::int from app_private.messages where sender_id::text like '50000000-%'),0,'prepare never persists or sends message body');

set local role service_role;
select lives_ok($$select api.record_privacy_reauthentication('50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','synthetic_fixture','fixture:checkin-export')$$,'local parent reauthentication fixture');
select lives_ok($$select api.record_privacy_reauthentication('50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','synthetic_fixture','fixture:checkin-child-export')$$,'local child reauthentication fixture');
reset role;
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select set_config('test.checkin_parent_export',api.request_own_export('55000000-0000-0000-0000-000000000001')->>'id',true);
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select set_config('test.checkin_child_export',api.request_own_export('55000000-0000-0000-0000-000000000003')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.checkin_parent_export')::uuid,'50000000-0000-0000-0000-000000000004','approve','fixture:calendar-export')$$,'independent parent own-data export review');
select lives_ok($$select api.execute_privacy_job(current_setting('test.checkin_parent_export')::uuid,'50000000-0000-0000-0000-000000000004')$$,'actual parent artifact generation invokes checkin hook');
select lives_ok($$select api.review_privacy_job(current_setting('test.checkin_child_export')::uuid,'50000000-0000-0000-0000-000000000004','approve','fixture:private-child-export')$$,'independent child export review');
select lives_ok($$select api.execute_privacy_job(current_setting('test.checkin_child_export')::uuid,'50000000-0000-0000-0000-000000000004')$$,'actual child artifact generation invokes own-choice hook');
reset role;
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(api.get_own_export(current_setting('test.checkin_parent_export')::uuid,true)->'data'->'checkins'->'invitations'),0,'guardian export contains no child invitation or private disposition');
select ok(not((api.get_own_export(current_setting('test.checkin_parent_export')::uuid,true)->'data'->'checkins')::text like '%skipped%'),'guardian authored calendar export has no skip indicator');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select is(api.get_own_export(current_setting('test.checkin_child_export')::uuid,true)->'data'->'checkins'->'invitations'->0->>'disposition','skipped','child own export includes their own private choice');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select is(api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','EDITED QUESTION',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000004',current_setting('test.checkin_schedule')::uuid,1)->>'revision','2','guardian edit persists with revision conflict protection');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Stale edit',array[1],'00:00','UTC',gen_random_uuid(),current_setting('test.checkin_schedule')::uuid,1)$$,'22023','schedule changed; reload before editing','stale editor cannot overwrite newer calendar');
select set_config('test.checkin_blocked_due',api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','MUST NOT ARRIVE AFTER BLOCK',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000005')->>'id',true);
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select lives_ok($$select api.block_user('50000000-0000-0000-0000-000000000001')$$,'independent child block is immediately effective');
select lives_ok($$select api.refresh_checkin_invitations()$$,'blocked connection is not materialized by app-open refresh');
select throws_ok($$select api.prepare_little_conversation('50000000-0000-0000-0000-000000000001')$$,'42501','not authorized','stale Little Conversations recipient denied after block');
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select throws_ok($$select api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000003','Blocked save',array[1],'00:00','UTC',gen_random_uuid())$$,'42501','not authorized','guardian cannot schedule through child block');
select lives_ok($$select api.remove_checkin_schedule(current_setting('test.checkin_future')::uuid,'54000000-0000-0000-0000-000000000006')$$,'removal still works when relationship is blocked');
reset role;
select is((select count(*)::int from app_private.checkin_invitations where schedule_id=current_setting('test.checkin_blocked_due')::uuid),0,'no queued question crosses block');

set local role service_role;
select set_config('test.checkin_hold',api.set_privacy_hold('50000000-0000-0000-0000-000000000003','messages','fixture:checkin-hold',clock_timestamp()+interval '1 day','50000000-0000-0000-0000-000000000004')::text,true);
reset role;
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000001');
select set_config('test.checkin_parent_delete',api.request_own_deletion('55000000-0000-0000-0000-000000000002')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.checkin_parent_delete')::uuid,'50000000-0000-0000-0000-000000000004','approve','fixture:parent-close')$$,'review parent deletion with another current guardian');
select lives_ok($$select api.execute_privacy_job(current_setting('test.checkin_parent_delete')::uuid,'50000000-0000-0000-0000-000000000004')$$,'executed access revocation invokes schedule cancellation hook');
reset role;
select is((select count(*)::int from app_private.checkin_schedules where creator_id='50000000-0000-0000-0000-000000000001' and enabled),0,'revoked guardian authored schedules actually cancelled');
set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000003');
select lives_ok($$select api.refresh_checkin_invitations()$$,'other guardian consent remains valid but removed creator cannot issue');
select is(api.list_checkin_invitations(true),'[]'::jsonb,'revoked creator does not reveal cancelled questions');
select set_config('test.checkin_child_delete',api.request_own_deletion('55000000-0000-0000-0000-000000000004')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.checkin_child_delete')::uuid,'50000000-0000-0000-0000-000000000004','approve','fixture:held-choice')$$,'review own child deletion');
select lives_ok($$select api.execute_privacy_job(current_setting('test.checkin_child_delete')::uuid,'50000000-0000-0000-0000-000000000004')$$,'held choice preserves bytes while access revokes');
select ok((api.get_privacy_job_review(current_setting('test.checkin_child_delete')::uuid,'50000000-0000-0000-0000-000000000004')->'blockers') ? 'checkin_invitation_records_on_finite_hold','only assigned independent operator sees precise held-checkin blocker');
reset role;
select is((select count(*)::int from app_private.checkin_invitations where recipient_id='50000000-0000-0000-0000-000000000003'),1,'finite hold retains child private choice');

set local role authenticated;
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000002');
select lives_ok($$select api.approve_contact('53000000-0000-0000-0000-000000000006')$$,'remaining guardian refreshes approval after approving guardian revocation');
select set_config('test.checkin_sibling_schedule',api.save_checkin_schedule('51000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000006','SIBLING QUESTION',array[current_setting('test.checkin_today')::int],'00:00','UTC','54000000-0000-0000-0000-000000000007')->>'id',true);
select pg_temp.checkin_identify('50000000-0000-0000-0000-000000000006');
select lives_ok($$select api.refresh_checkin_invitations()$$,'independent sibling invitation can be generated');
reset role;
set local role service_role;
select lives_ok($$select api.record_privacy_reauthentication('50000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000006','synthetic_fixture','fixture:sibling-delete')$$,'sibling own reauthentication');
reset role;
set local role authenticated;
select set_config('test.checkin_sibling_delete',api.request_own_deletion('55000000-0000-0000-0000-000000000006')->>'id',true);
reset role;
set local role service_role;
select lives_ok($$select api.review_privacy_job(current_setting('test.checkin_sibling_delete')::uuid,'50000000-0000-0000-0000-000000000004','approve','fixture:unheld-purge')$$,'independent unheld deletion review');
select lives_ok($$select api.execute_privacy_job(current_setting('test.checkin_sibling_delete')::uuid,'50000000-0000-0000-0000-000000000004')$$,'unheld invitation deletion executes');
reset role;
select is((select count(*)::int from app_private.checkin_invitations where recipient_id='50000000-0000-0000-0000-000000000006'),0,'own unheld invitation/choice bytes actually erased');
update app_private.checkin_invitations set expires_at=clock_timestamp()-interval '1 second' where recipient_id='50000000-0000-0000-0000-000000000003';
set local role service_role;
select is(api.run_checkin_retention('50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004')->>'expiredInvitationsDeleted','0','retention respects active finite hold');
select lives_ok($$select api.release_privacy_hold(current_setting('test.checkin_hold')::uuid,'50000000-0000-0000-0000-000000000004')$$,'independent hold release');
select is(api.run_checkin_retention('50000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000004')->>'expiredInvitationsDeleted','1','expired choice bytes actually erased after release');
reset role;
select ok(not(select public_enrollment_enabled or real_child_data_enabled from app_private.deployment_policy),'schedule code never opens real-data enrollment');
select * from finish();
rollback;
