create table app_private.checkin_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app_private.families(id),
  child_id uuid not null,
  creator_id uuid not null references auth.users(id),
  contact_id uuid not null references app_private.trusted_contacts(id),
  question text not null check(char_length(question) between 1 and 500),
  weekdays int[] not null check(array_ndims(weekdays)=1 and cardinality(weekdays) between 1 and 7 and weekdays<@array[1,2,3,4,5,6,7] and array_position(weekdays,null) is null),
  local_time time not null,
  timezone text not null,
  revision bigint not null default 1,
  enabled boolean not null default true,
  removed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(child_id,family_id) references app_private.children(id,family_id)
);
create table app_private.checkin_invitations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references app_private.checkin_schedules(id),
  schedule_revision bigint not null,
  family_id uuid not null references app_private.families(id),
  child_id uuid not null references app_private.children(id),
  recipient_id uuid not null references auth.users(id),
  creator_id uuid not null references auth.users(id),
  contact_id uuid not null references app_private.trusted_contacts(id),
  question text not null check(char_length(question) between 1 and 500),
  local_date date not null,
  due_at timestamptz not null,
  expires_at timestamptz not null,
  disposition text not null default 'open' check(disposition in('open','deferred','skipped')),
  unique(schedule_id,local_date)
);
create index checkin_own_invitations on app_private.checkin_invitations(recipient_id,due_at);
create table app_private.checkin_commands (
  user_id uuid not null references auth.users(id),
  client_id uuid not null,
  fingerprint bytea not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,client_id)
);

create function app_private.checkin_lock(p_family_id uuid,p_contact_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare f uuid; contact record;
begin
  for f in select family_id from(select p_family_id as family_id union select x.family_id from unnest(p_contact_ids) ids(id)
    cross join lateral app_private.contact_family_ids(ids.id) x(family_id)) families where family_id is not null order by family_id loop
    perform app_private.lock_family(f);
  end loop;
  for contact in select id from app_private.trusted_contacts where id=any(p_contact_ids) order by a,b,id loop perform app_private.lock_contact(contact.id); end loop;
end $$;

create function app_private.checkin_invitation_allowed(p_id uuid,p_user uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.checkin_invitations i join app_private.checkin_schedules s on s.id=i.schedule_id
    join app_private.children c on c.id=i.child_id join app_private.trusted_contacts contact on contact.id=i.contact_id
    where i.id=p_id and i.recipient_id=p_user and c.account_user_id=p_user
      and s.enabled and s.removed_at is null and i.schedule_revision=s.revision and s.child_id=i.child_id
      and s.family_id=i.family_id and s.creator_id=i.creator_id and s.contact_id=i.contact_id
      and contact.a=least(i.creator_id,i.recipient_id) and contact.b=greatest(i.creator_id,i.recipient_id)
      and i.expires_at>clock_timestamp() and app_private.is_member(i.family_id,p_user)
      and app_private.child_for_user(i.family_id,p_user)=i.child_id and app_private.is_guardian(i.family_id,i.creator_id)
      and app_private.contact_allowed(i.contact_id))
$$;

create function api.save_checkin_schedule(p_family_id uuid,p_child_id uuid,p_question text,p_weekdays int[],p_local_time text,p_timezone text,
  p_client_id uuid,p_schedule_id uuid default null,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.children; previous app_private.checkin_schedules;
  contact uuid; normalized int[]; fingerprint bytea; receipt app_private.checkin_commands; saved app_private.checkin_schedules; result jsonb;
begin
  select * into c from app_private.children where id=p_child_id and family_id=p_family_id;
  if not found or not app_private.is_guardian(p_family_id,u) or not coalesce(app_private.is_member(p_family_id,c.account_user_id),false) then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_schedule_id is not null then
    select * into previous from app_private.checkin_schedules where id=p_schedule_id and family_id=p_family_id;
    if not found then raise exception 'not authorized' using errcode='42501'; end if;
  end if;
  select id into contact from app_private.trusted_contacts where a=least(u,c.account_user_id) and b=greatest(u,c.account_user_id);
  if contact is null then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.checkin_lock(p_family_id,array[contact,previous.contact_id]);
  if not app_private.is_guardian(p_family_id,u) or not app_private.is_member(p_family_id,c.account_user_id) or not app_private.contact_allowed(contact) then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_client_id is null or coalesce(char_length(p_question),0) not between 1 and 500 or char_length(trim(p_question))=0
    or p_weekdays is null or coalesce(array_ndims(p_weekdays),0)<>1 or cardinality(p_weekdays) not between 1 and 7
    or not(p_weekdays<@array[1,2,3,4,5,6,7]) or array_position(p_weekdays,null) is not null
    or p_local_time is null or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid schedule' using errcode='22023'; end if;
  select array_agg(v.weekday_value order by v.weekday_value) into normalized from(select distinct unnest(p_weekdays) as weekday_value) as v;
  if cardinality(normalized)<>cardinality(p_weekdays) then raise exception 'invalid schedule' using errcode='22023'; end if;
  fingerprint:=sha256(convert_to(jsonb_build_object('kind','save','familyId',p_family_id,'childId',p_child_id,'question',p_question,
    'weekdays',normalized,'localTime',p_local_time,'timezone',p_timezone,'scheduleId',p_schedule_id,'revision',p_expected_revision)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('betweenus-checkin-command:'||u::text||':'||p_client_id::text,0));
  select * into receipt from app_private.checkin_commands where user_id=u and client_id=p_client_id;
  if found then
    if receipt.fingerprint is distinct from fingerprint then raise exception 'idempotency conflict' using errcode='22023'; end if;
    return receipt.result;
  end if;
  perform app_private.communication_budget(u,'checkin_schedule',5);
  if p_schedule_id is null then
    if (select count(*) from app_private.checkin_schedules where child_id=p_child_id and enabled)>=8 or
      (select count(*) from app_private.checkin_schedules where family_id=p_family_id and enabled)>=32 then raise exception 'schedule capacity reached' using errcode='54000'; end if;
    insert into app_private.checkin_schedules(family_id,child_id,creator_id,contact_id,question,weekdays,local_time,timezone)
      values(p_family_id,p_child_id,u,contact,p_question,normalized,p_local_time::time,p_timezone) returning * into saved;
  else
    select * into previous from app_private.checkin_schedules where id=p_schedule_id for update;
    if not previous.enabled or previous.removed_at is not null then raise exception 'not authorized' using errcode='42501'; end if;
    if previous.revision is distinct from p_expected_revision then raise exception 'schedule changed; reload before editing' using errcode='22023'; end if;
    if p_child_id<>previous.child_id then raise exception 'create a separate schedule for another child' using errcode='22023'; end if;
    update app_private.checkin_schedules set creator_id=u,contact_id=contact,question=p_question,weekdays=normalized,local_time=p_local_time::time,
      timezone=p_timezone,revision=revision+1,updated_at=clock_timestamp() where id=p_schedule_id returning * into saved;
  end if;
  result:=jsonb_build_object('id',saved.id,'revision',saved.revision,'status','saved','backgroundDeliveryOperational',false);
  insert into app_private.checkin_commands(user_id,client_id,fingerprint,result) values(u,p_client_id,fingerprint,result);
  return result;
end $$;

create function api.remove_checkin_schedule(p_schedule_id uuid,p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); s app_private.checkin_schedules; receipt app_private.checkin_commands; fingerprint bytea; result jsonb;
begin
  select * into s from app_private.checkin_schedules where id=p_schedule_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.checkin_lock(s.family_id,array[s.contact_id]);
  if not app_private.is_guardian(s.family_id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_client_id is null then raise exception 'command identity required' using errcode='22023'; end if;
  fingerprint:=sha256(convert_to(jsonb_build_object('kind','remove','scheduleId',p_schedule_id)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('betweenus-checkin-command:'||u::text||':'||p_client_id::text,0));
  select * into receipt from app_private.checkin_commands where user_id=u and client_id=p_client_id;
  if found then
    if receipt.fingerprint is distinct from fingerprint then raise exception 'idempotency conflict' using errcode='22023'; end if;
    return receipt.result;
  end if;
  update app_private.checkin_schedules set enabled=false,removed_at=coalesce(removed_at,clock_timestamp()),updated_at=clock_timestamp()
    where id=s.id;
  result:=jsonb_build_object('id',s.id,'status','removed');
  insert into app_private.checkin_commands(user_id,client_id,fingerprint,result) values(u,p_client_id,fingerprint,result);
  return result;
end $$;

create function api.list_checkin_schedules() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'familyId',s.family_id,'childId',s.child_id,'childName',c.name,
    'question',s.question,'weekdays',s.weekdays,'localTime',left(s.local_time::text,5),'timezone',s.timezone,'revision',s.revision,
    'canIssue',app_private.is_guardian(s.family_id,s.creator_id) and app_private.is_member(s.family_id,c.account_user_id) and app_private.contact_allowed(s.contact_id),
    'backgroundDeliveryOperational',false) order by s.created_at,s.id),'[]'::jsonb) into result
    from app_private.checkin_schedules s join app_private.children c on c.id=s.child_id
    where s.enabled and s.removed_at is null and app_private.is_guardian(s.family_id,u);
  return result;
end $$;

create function api.refresh_checkin_invitations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); candidate record; s app_private.checkin_schedules; c app_private.children;
  local_now timestamp; today date; due timestamptz;
begin
  if not exists(select 1 from app_private.profiles where user_id=u and kind='child') then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.communication_budget(u,'checkin_refresh',10);
  -- Prelock the union of families before any relationship in this bounded batch.
  perform app_private.privacy_lock_families(u);
  for candidate in select sch.id from app_private.checkin_schedules sch join app_private.children child on child.id=sch.child_id
    where child.account_user_id=u and sch.enabled and sch.removed_at is null order by sch.family_id,sch.contact_id,sch.id limit 32 loop
    select * into s from app_private.checkin_schedules where id=candidate.id for update;
    select * into c from app_private.children where id=s.child_id;
    if not app_private.is_member(s.family_id,u) or not app_private.is_guardian(s.family_id,s.creator_id) or not app_private.contact_allowed(s.contact_id) then continue; end if;
    local_now:=clock_timestamp() at time zone s.timezone; today:=local_now::date;
    due:=(today+s.local_time) at time zone s.timezone;
    if extract(isodow from today)::int=any(s.weekdays) and due<=clock_timestamp() then
      insert into app_private.checkin_invitations(schedule_id,schedule_revision,family_id,child_id,recipient_id,creator_id,contact_id,question,local_date,due_at,expires_at)
        values(s.id,s.revision,s.family_id,s.child_id,u,s.creator_id,s.contact_id,s.question,today,due,((today+8)::timestamp at time zone s.timezone))
        on conflict(schedule_id,local_date) do nothing;
    end if;
  end loop;
  return jsonb_build_object('status','checked','backgroundDeliveryOperational',false);
end $$;

create function api.list_checkin_invitations(p_include_deferred boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); result jsonb;
begin
  perform app_private.privacy_lock_families(u);
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'question',i.question,'fromId',i.creator_id,'fromName',p.display_name,
    'dueAt',i.due_at,'disposition',i.disposition,'backgroundDeliveryOperational',false) order by i.due_at,i.id),'[]'::jsonb) into result
    from app_private.checkin_invitations i join app_private.checkin_schedules s on s.id=i.schedule_id join app_private.profiles p on p.user_id=i.creator_id
    where i.recipient_id=u and app_private.checkin_invitation_allowed(i.id,u) and
      ((i.disposition='open' and i.local_date=(clock_timestamp() at time zone s.timezone)::date)
        or (coalesce(p_include_deferred,false) and i.disposition='deferred'));
  return result;
end $$;

create function api.set_checkin_disposition(p_invitation_id uuid,p_choice text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); i app_private.checkin_invitations; choice text;
begin
  select * into i from app_private.checkin_invitations where id=p_invitation_id and recipient_id=u;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.checkin_lock(i.family_id,array[i.contact_id]);
  if not app_private.checkin_invitation_allowed(i.id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  if not coalesce(p_choice in('skip','defer','resume'),false) then raise exception 'invalid check-in choice' using errcode='22023'; end if;
  choice:=case p_choice when 'skip' then 'skipped' when 'defer' then 'deferred' else 'open' end;
  update app_private.checkin_invitations set disposition=choice where id=i.id and disposition<>'skipped';
  -- No parent-visible event, acknowledgment, score, financial effect or notification.
  return jsonb_build_object('id',i.id,'status','saved','shared',false);
end $$;

create function api.prepare_checkin_response(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); i app_private.checkin_invitations;
begin
  select * into i from app_private.checkin_invitations where id=p_invitation_id and recipient_id=u;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.checkin_lock(i.family_id,array[i.contact_id]);
  select * into i from app_private.checkin_invitations where id=p_invitation_id and recipient_id=u for update;
  if not app_private.checkin_invitation_allowed(i.id,u) or i.disposition='skipped' then raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('recipientId',i.creator_id,'contactId',i.contact_id,'requiresReview',true,'sent',false);
end $$;

create function api.prepare_little_conversation(p_recipient_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts;
begin
  select * into c from app_private.trusted_contacts where a=least(u,p_recipient_id) and b=greatest(u,p_recipient_id);
  if not found or p_recipient_id=u then raise exception 'not authorized' using errcode='42501'; end if;
  c:=app_private.lock_contact(c.id);
  if not app_private.contact_allowed(c.id) then raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('recipientId',p_recipient_id,'contactId',c.id,'requiresReview',true,'sent',false);
end $$;

create function api.run_checkin_retention(p_subject_id uuid,p_operator_id uuid,p_limit int default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n int;
begin
  if not app_private.privacy_operator(p_operator_id,p_subject_id,p_subject_id) or not app_private.privacy_policy_allows(p_subject_id)
    or not exists(select 1 from app_private.privacy_lifecycle_policy where singleton and retention_enabled) then raise exception 'retention unavailable' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid batch size' using errcode='22023'; end if;
  perform app_private.privacy_lock_families(p_subject_id);
  delete from app_private.checkin_invitations where id in(select id from app_private.checkin_invitations where recipient_id=p_subject_id
    and expires_at<clock_timestamp() and not app_private.privacy_has_hold(p_subject_id,'messages')
    and not app_private.privacy_has_hold(creator_id,'messages') order by id limit p_limit);
  get diagnostics n=row_count;
  delete from app_private.checkin_commands where user_id=p_subject_id and created_at<clock_timestamp()-interval '30 days'
    and not app_private.privacy_has_hold(p_subject_id,'messages');
  delete from app_private.checkin_schedules s where s.id in(select schedule.id from app_private.checkin_schedules schedule
    join app_private.children c on c.id=schedule.child_id where (schedule.creator_id=p_subject_id or c.account_user_id=p_subject_id)
      and not schedule.enabled and schedule.removed_at<clock_timestamp()-interval '30 days'
      and not app_private.privacy_has_hold(schedule.creator_id,'messages') and not app_private.privacy_has_hold(c.account_user_id,'messages')
      and not exists(select 1 from app_private.checkin_invitations i where i.schedule_id=schedule.id) order by schedule.id limit p_limit);
  return jsonb_build_object('status','executed','expiredInvitationsDeleted',n,'allDataDeleted',false);
end $$;

create function app_private.checkin_own_export(p_subject_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('schedules',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'familyId',s.family_id,'childId',s.child_id,
      'question',s.question,'weekdays',s.weekdays,'localTime',left(s.local_time::text,5),'timezone',s.timezone,'enabled',s.enabled,'removedAt',s.removed_at))
    from app_private.checkin_schedules s where s.creator_id=p_subject_id),'[]'::jsonb),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'scheduleId',i.schedule_id,'fromId',i.creator_id,
      'dueAt',i.due_at,'expiresAt',i.expires_at,'disposition',i.disposition)) from app_private.checkin_invitations i where i.recipient_id=p_subject_id),'[]'::jsonb))
$$;

create function app_private.checkin_privacy_job() returns trigger
language plpgsql security definer set search_path='' as $$
declare deletion_started boolean;
begin
  if tg_op='INSERT' then deletion_started:=new.status='access_revoked';
  else deletion_started:=new.status='access_revoked' and old.status is distinct from 'access_revoked'; end if;
  if new.kind='export' and new.subject_id=new.requester_id and new.artifact is not null then
    new.artifact:=jsonb_set(new.artifact,'{checkins}',app_private.checkin_own_export(new.subject_id));
  end if;
  if new.kind='deletion' and deletion_started then
    -- The reviewed executor already holds the subject's sorted family/pair locks.
    update app_private.checkin_schedules set enabled=false,removed_at=coalesce(removed_at,clock_timestamp()),updated_at=clock_timestamp()
      where creator_id=new.subject_id or child_id in(select id from app_private.children where account_user_id=new.subject_id);
    delete from app_private.checkin_invitations where recipient_id=new.subject_id
      and not app_private.privacy_has_hold(recipient_id,'messages') and not app_private.privacy_has_hold(creator_id,'messages');
    new.stages:=new.stages||array['checkin_schedules_cancelled','own_unheld_checkin_choices_erased'];
    if exists(select 1 from app_private.checkin_invitations where recipient_id=new.subject_id) then
      new.internal_blockers:=array_append(new.internal_blockers,'checkin_invitation_records_on_finite_hold');
    end if;
  end if;
  return new;
end $$;
create trigger checkin_privacy_job before insert or update on app_private.privacy_lifecycle_jobs
  for each row execute function app_private.checkin_privacy_job();

do $$ declare name text; f record; begin
  foreach name in array array['checkin_schedules','checkin_invitations','checkin_commands'] loop
    execute format('alter table app_private.%I enable row level security',name);
    execute format('revoke all on app_private.%I from public,anon,authenticated',name);
  end loop;
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('checkin_lock','checkin_invitation_allowed','checkin_own_export','checkin_privacy_job')) or
    (n.nspname='api' and p.proname in('save_checkin_schedule','remove_checkin_schedule','list_checkin_schedules','refresh_checkin_invitations','list_checkin_invitations',
      'set_checkin_disposition','prepare_checkin_response','prepare_little_conversation','run_checkin_retention')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to %I',f.signature,case when f.proname='run_checkin_retention' then 'service_role' else 'authenticated' end); end if;
  end loop;
end $$;
