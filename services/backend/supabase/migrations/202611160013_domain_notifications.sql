-- Neutral domain notifications. No transport, credentials, enrollment or policy is enabled here.
create table app_private.domain_notification_policy (
  singleton boolean primary key default true check(singleton),
  contacts_enabled boolean not null default false,
  checkins_enabled boolean not null default false,
  chores_enabled boolean not null default false,
  payouts_enabled boolean not null default false
);
insert into app_private.domain_notification_policy(singleton) values(true);
create table app_private.domain_notification_events (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check(source_kind in('contact','checkin','finance')),
  source_ref text not null check(char_length(source_ref) between 1 and 200),
  event_kind text not null check(event_kind in('contact_approved','checkin_due','chore_assigned','chore_submitted','chore_reviewed','chore_changed',
    'payout_requested','payout_prepared','payout_changed','payment_reported','payment_acknowledged')),
  family_id uuid references app_private.families(id),
  child_id uuid references app_private.children(id),
  actor_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  contact_id uuid not null references app_private.trusted_contacts(id),
  source_id uuid,
  finance_sequence int,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  cancelled_at timestamptz,
  unique(source_kind,source_ref,recipient_id),
  check(actor_id<>recipient_id),
  check((source_kind='contact' and event_kind='contact_approved' and source_id is not null and finance_sequence is null) or
    (source_kind='checkin' and event_kind='checkin_due' and source_id is not null and child_id is not null and finance_sequence is null) or
    (source_kind='finance' and event_kind not in('contact_approved','checkin_due') and family_id is not null and child_id is not null and finance_sequence is not null and finance_sequence>0))
);
create index domain_notification_retention on app_private.domain_notification_events(recipient_id,created_at);
alter table app_private.notification_outbox alter column message_id drop not null;
alter table app_private.notification_outbox add column domain_event_id uuid references app_private.domain_notification_events(id) on delete cascade;
alter table app_private.notification_outbox add constraint notification_one_source check(num_nonnulls(message_id,domain_event_id)=1);
create unique index notification_domain_device on app_private.notification_outbox(domain_event_id,device_id) where domain_event_id is not null;
alter table app_private.domain_notification_policy enable row level security;
alter table app_private.domain_notification_events enable row level security;
revoke all on app_private.domain_notification_policy,app_private.domain_notification_events from public,anon,authenticated,service_role;

create function app_private.domain_notification_enabled(p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.domain_notification_policy where singleton and case
    when p_kind='contact_approved' then contacts_enabled when p_kind='checkin_due' then checkins_enabled
    when p_kind in('chore_assigned','chore_submitted','chore_reviewed','chore_changed') then chores_enabled
    when p_kind in('payout_requested','payout_prepared','payout_changed','payment_reported','payment_acknowledged') then payouts_enabled else false end);
$$;

create function app_private.domain_notification_allowed(p_event_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.domain_notification_events e join app_private.trusted_contacts c on c.id=e.contact_id
    where e.id=p_event_id and e.cancelled_at is null and e.expires_at>clock_timestamp()
      and app_private.domain_notification_enabled(e.event_kind)
      and app_private.account_usable(e.actor_id) and app_private.account_usable(e.recipient_id)
      and c.a=least(e.actor_id,e.recipient_id) and c.b=greatest(e.actor_id,e.recipient_id) and app_private.contact_allowed(c.id)
      and ((e.source_kind='contact' and e.source_id=c.id) or
        (e.source_kind='checkin' and exists(select 1 from app_private.checkin_invitations i join app_private.checkin_schedules s on s.id=i.schedule_id
          where i.id=e.source_id and i.recipient_id=e.recipient_id and i.creator_id=e.actor_id and i.contact_id=e.contact_id
            and i.child_id=e.child_id and i.family_id=e.family_id and i.disposition='open'
            and i.local_date=(clock_timestamp() at time zone s.timezone)::date and app_private.checkin_invitation_allowed(i.id,e.recipient_id))) or
        (e.source_kind='finance' and exists(select 1 from app_private.children child join app_private.finance_events event
          on event.family_id=child.family_id and event.child_id=child.id and event.sequence=e.finance_sequence
          where child.id=e.child_id and child.family_id=e.family_id and child.state='active'
            and app_private.child_for_user(e.family_id,child.account_user_id)=child.id
            and ((e.actor_id=child.account_user_id and app_private.is_guardian(e.family_id,e.recipient_id)) or
              (e.recipient_id=child.account_user_id and app_private.is_guardian(e.family_id,e.actor_id)))
            and event.payload->>'kind' in('assign_chore','edit_chore','submit_chore','review_chore','close_chore','reverse_earning',
              'request_payout','prepare_payout','cancel_payout','report_payment','acknowledge_payment','reverse_payment')))));
$$;

-- Reuse message authorization without changing its current-session/contact semantics.
alter function app_private.notification_allowed(uuid) rename to message_notification_allowed;
create function app_private.notification_allowed(p_outbox_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.notification_outbox q where q.id=p_outbox_id and
    ((q.message_id is not null and app_private.message_notification_allowed(q.id)) or
      (q.domain_event_id is not null and app_private.domain_notification_allowed(q.domain_event_id) and exists(
        select 1 from app_private.device_tokens d join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
        join app_private.notification_preferences p on p.user_id=d.user_id cross join app_private.communication_policy cp
        where d.id=q.device_id and d.user_id=q.recipient_id and d.revoked_at is null and p.enabled and cp.singleton and cp.push_delivery_enabled
          and q.recipient_id=(select recipient_id from app_private.domain_notification_events where id=q.domain_event_id)
          and (s.not_after is null or s.not_after>clock_timestamp()) and app_private.account_usable(d.user_id)
          and q.created_at>clock_timestamp()-interval '24 hours'))));
$$;

create function app_private.domain_lock_scope(p_families uuid[],p_contacts uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare f uuid;c record;
begin
  if coalesce(cardinality(p_families),0)>100 or coalesce(cardinality(p_contacts),0)>100 then raise exception 'invalid lock batch' using errcode='22023';end if;
  for f in select family_id from(select unnest(p_families) family_id union select family_id from unnest(p_contacts) ids(id)
    cross join lateral app_private.contact_family_ids(ids.id) bound(family_id)) families where family_id is not null order by family_id loop
    perform app_private.lock_family(f);
  end loop;
  for c in select id from app_private.trusted_contacts where id=any(p_contacts) order by a,b,id loop perform app_private.lock_contact(c.id);end loop;
end $$;

-- The core export wrapper raises capacity before the executor claims an artifact is ready.
alter function app_private.privacy_export_core(uuid) rename to privacy_export_core_before_domain;
create function app_private.privacy_export_core(p_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare data jsonb;metadata jsonb;
begin
  if (select count(*) from app_private.domain_notification_events where recipient_id=p_subject)>1000 then
    raise exception 'export capacity review required' using errcode='54000';end if;
  data:=app_private.privacy_export_core_before_domain(p_subject);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',event_kind,'createdAt',created_at,'expiresAt',expires_at) order by created_at,id),'[]')
    into metadata from app_private.domain_notification_events where recipient_id=p_subject;
  data:=data||jsonb_build_object('domainNotifications',metadata);
  if octet_length(data::text)>7340032 then raise exception 'export capacity review required' using errcode='54000';end if;
  return data;
end $$;

create function app_private.domain_notification_privacy_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='deletion' and new.status='access_revoked' and (tg_op='INSERT' or old.status is distinct from new.status) then
    -- The existing executor already locks the subject's sessions, family union and relationships.
    update app_private.domain_notification_events set cancelled_at=coalesce(cancelled_at,clock_timestamp())
      where new.subject_id in(actor_id,recipient_id);
    delete from app_private.notification_outbox where domain_event_id in(select id from app_private.domain_notification_events where new.subject_id in(actor_id,recipient_id));
    delete from app_private.domain_notification_events e where new.subject_id in(e.actor_id,e.recipient_id)
      and not app_private.privacy_has_hold(e.actor_id,'messages') and not app_private.privacy_has_hold(e.recipient_id,'messages')
      and not app_private.privacy_has_hold(e.actor_id,'identity') and not app_private.privacy_has_hold(e.recipient_id,'identity')
      and (e.source_kind<>'finance' or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')));
    new.stages:=new.stages||array['domain_notifications_cancelled','own_unheld_domain_notification_metadata_erased'];
    -- Preserve the executor's stable public blockers; never disclose another person's hold or skip.
  end if;
  return new;
end $$;
create trigger domain_notification_privacy_job before insert or update on app_private.privacy_lifecycle_jobs
  for each row execute function app_private.domain_notification_privacy_job();

create function api.run_domain_notification_retention(p_subject_id uuid,p_operator_id uuid,p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];families uuid[];contacts uuid[];n int;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023';end if;
  if not app_private.privacy_operator(p_operator_id,p_subject_id,p_subject_id) or not app_private.privacy_policy_allows(p_subject_id)
    or not exists(select 1 from app_private.privacy_lifecycle_policy where singleton and retention_enabled) then
    raise exception 'reviewed retention required' using errcode='42501';end if;
  select array_agg(id),array_agg(family_id),array_agg(contact_id) into ids,families,contacts from(
    select e.id,e.family_id,e.contact_id from app_private.domain_notification_events e where p_subject_id in(e.actor_id,e.recipient_id)
      and e.created_at<clock_timestamp()-make_interval(days=>(select notification_days from app_private.privacy_lifecycle_policy where singleton))
      and not app_private.privacy_has_hold(e.actor_id,'messages') and not app_private.privacy_has_hold(e.recipient_id,'messages')
      and not app_private.privacy_has_hold(e.actor_id,'identity') and not app_private.privacy_has_hold(e.recipient_id,'identity')
      and (e.source_kind<>'finance' or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')))
    order by e.created_at,e.id limit p_limit) ready;
  perform app_private.domain_lock_scope(families,contacts);
  -- Recheck holds after locks: no case/hold decision may race the snapshot into erasure.
  delete from app_private.domain_notification_events e where e.id=any(ids)
    and not app_private.privacy_has_hold(e.actor_id,'messages') and not app_private.privacy_has_hold(e.recipient_id,'messages')
    and not app_private.privacy_has_hold(e.actor_id,'identity') and not app_private.privacy_has_hold(e.recipient_id,'identity')
    and (e.source_kind<>'finance' or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')));
  get diagnostics n=row_count;
  return jsonb_build_object('deleted',n,'allDataDeleted',false);
end $$;
create function app_private.notification_lock_sources(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare families uuid[];contacts uuid[];
begin
  if coalesce(cardinality(p_ids),0)>100 then raise exception 'invalid lock batch' using errcode='22023';end if;
  select array_agg(distinct e.family_id),array_agg(distinct coalesce(e.contact_id,v.contact_id)) into families,contacts
    from app_private.notification_outbox q left join app_private.domain_notification_events e on e.id=q.domain_event_id
    left join app_private.messages m on m.id=q.message_id left join app_private.conversations v on v.id=m.conversation_id where q.id=any(p_ids);
  perform app_private.domain_lock_scope(families,contacts);
end $$;

create function app_private.queue_domain_notification(p_kind text,p_source_kind text,p_source_ref text,p_family uuid,p_child uuid,
  p_actor uuid,p_recipient uuid,p_contact uuid,p_source_id uuid default null,p_sequence int default null) returns void
language plpgsql security definer set search_path='' as $$
declare event_id uuid; device uuid;global_used int;user_used int;
begin
  if not app_private.domain_notification_enabled(p_kind) or not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return;end if;
  -- Called transactionally by sources already protected by their family/pair authority locks.
  -- Never acquire another family after a source caller has locked its own scope.
  if not exists(select 1 from app_private.device_tokens d join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
    join app_private.notification_preferences p on p.user_id=d.user_id where d.user_id=p_recipient and d.revoked_at is null and p.enabled
      and (s.not_after is null or s.not_after>clock_timestamp())) then return;end if;
  insert into app_private.domain_notification_events(source_kind,source_ref,event_kind,family_id,child_id,actor_id,recipient_id,contact_id,source_id,finance_sequence)
    values(p_source_kind,p_source_ref,p_kind,p_family,p_child,p_actor,p_recipient,p_contact,p_source_id,p_sequence)
    on conflict(source_kind,source_ref,recipient_id) do nothing returning id into event_id;
  if event_id is null then return;end if;
  if not app_private.domain_notification_allowed(event_id) then delete from app_private.domain_notification_events where id=event_id;return;end if;
  for device in select d.id from app_private.device_tokens d join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
    join app_private.notification_preferences p on p.user_id=d.user_id where d.user_id=p_recipient and d.revoked_at is null and p.enabled
      and (s.not_after is null or s.not_after>clock_timestamp()) order by d.id limit 3 loop
    insert into app_private.notification_quota(bucket,hour,used) values('global',date_trunc('hour',clock_timestamp()),1)
      on conflict(bucket,hour) do update set used=app_private.notification_quota.used+1 returning used into global_used;
    if global_used>500 then exit;end if;
    insert into app_private.notification_quota(bucket,hour,used) values(p_recipient::text,date_trunc('hour',clock_timestamp()),1)
      on conflict(bucket,hour) do update set used=app_private.notification_quota.used+1 returning used into user_used;
    if user_used>20 then exit;end if;
    insert into app_private.notification_outbox(recipient_id,domain_event_id,device_id) values(p_recipient,event_id,device) on conflict do nothing;
  end loop;
  delete from app_private.notification_quota where hour<clock_timestamp()-interval '1 day';
end $$;

create function app_private.domain_contact_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if app_private.contact_allowed(new.id) then
    perform app_private.queue_domain_notification('contact_approved','contact',new.id::text,new.family_id,null,new.a,new.b,new.id,new.id);
    perform app_private.queue_domain_notification('contact_approved','contact',new.id::text,new.family_id,null,new.b,new.a,new.id,new.id);
  end if;
  return new;
end $$;
create trigger domain_contact_notification after insert or update of accepted_a_at,accepted_b_at,approved_a_by,approved_b_by,verified_at on app_private.trusted_contacts
  for each row execute function app_private.domain_contact_notification();

create function app_private.domain_checkin_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform app_private.queue_domain_notification('checkin_due','checkin',new.id::text,new.family_id,new.child_id,new.creator_id,new.recipient_id,new.contact_id,new.id);
  elsif new.disposition<>'open' then
    update app_private.domain_notification_events set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where source_kind='checkin' and source_id=new.id;
    update app_private.notification_outbox set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null
      where domain_event_id in(select id from app_private.domain_notification_events where source_kind='checkin' and source_id=new.id) and status in('queued','leased');
  end if;
  return new;
end $$;
create trigger domain_checkin_notification after insert or update of disposition on app_private.checkin_invitations
  for each row execute function app_private.domain_checkin_notification();

create function app_private.domain_finance_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare event app_private.finance_events; child app_private.children;kind text;recipient uuid;contact uuid;
begin
  select * into event from app_private.finance_events where family_id=new.family_id and sequence=new.event_sequence;
  -- Explicit allowlist: matching (including reveal/funding/correction) and all savings changes are silent.
  kind:=case event.payload->>'kind' when 'assign_chore' then 'chore_assigned' when 'submit_chore' then 'chore_submitted'
    when 'review_chore' then 'chore_reviewed' when 'edit_chore' then 'chore_changed' when 'close_chore' then 'chore_changed'
    when 'reverse_earning' then 'chore_changed' when 'request_payout' then 'payout_requested' when 'prepare_payout' then 'payout_prepared'
    when 'cancel_payout' then 'payout_changed' when 'report_payment' then 'payment_reported' when 'reverse_payment' then 'payout_changed'
    when 'acknowledge_payment' then 'payment_acknowledged' else null end;
  if kind is null then return new;end if;
  select * into child from app_private.children where id=new.child_id and family_id=new.family_id;
  if new.actor_id=child.account_user_id then
    for recipient in select m.user_id from app_private.memberships m where m.family_id=new.family_id and app_private.is_guardian(new.family_id,m.user_id)
      order by m.user_id limit 8 loop
      select id into contact from app_private.trusted_contacts where a=least(new.actor_id,recipient) and b=greatest(new.actor_id,recipient);
      if contact is not null then perform app_private.queue_domain_notification(kind,'finance',event.event_id,new.family_id,new.child_id,
        new.actor_id,recipient,contact,null,event.sequence);end if;
    end loop;
  elsif app_private.is_guardian(new.family_id,new.actor_id) then
    select id into contact from app_private.trusted_contacts where a=least(new.actor_id,child.account_user_id) and b=greatest(new.actor_id,child.account_user_id);
    if contact is not null then perform app_private.queue_domain_notification(kind,'finance',event.event_id,new.family_id,new.child_id,
      new.actor_id,child.account_user_id,contact,null,event.sequence);end if;
  end if;
  return new;
end $$;
create trigger domain_finance_notification after insert on app_private.finance_commands for each row execute function app_private.domain_finance_notification();

-- Service cron source: materialize only due TODAY, never yesterday's backlog or repeated reminders.
create function api.produce_due_checkins(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];families uuid[];contacts uuid[];candidate record;s app_private.checkin_schedules;c app_private.children;
  local_now timestamp;today date;due timestamptz;created int:=0;n int;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023';end if;
  if not app_private.domain_notification_enabled('checkin_due') or not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then
    return jsonb_build_object('status','disabled','created',0,'sent',false);end if;
  select array_agg(id),array_agg(family_id),array_agg(contact_id) into ids,families,contacts from (
    select sch.id,sch.family_id,sch.contact_id from app_private.checkin_schedules sch join app_private.children child on child.id=sch.child_id
    where sch.enabled and sch.removed_at is null and app_private.is_member(sch.family_id,child.account_user_id)
      and app_private.is_guardian(sch.family_id,sch.creator_id) and app_private.contact_allowed(sch.contact_id)
      and extract(isodow from clock_timestamp() at time zone sch.timezone)::int=any(sch.weekdays)
      and ((clock_timestamp() at time zone sch.timezone)::date+sch.local_time) at time zone sch.timezone<=clock_timestamp()
      and not exists(select 1 from app_private.checkin_invitations i where i.schedule_id=sch.id and i.local_date=(clock_timestamp() at time zone sch.timezone)::date)
    order by sch.family_id,sch.id limit p_limit) ready;
  perform app_private.domain_lock_scope(families,contacts);
  for candidate in select id from app_private.checkin_schedules where id=any(ids) order by id loop
    select * into s from app_private.checkin_schedules where id=candidate.id for update;
    select * into c from app_private.children where id=s.child_id;
    if not s.enabled or s.removed_at is not null or not app_private.is_member(s.family_id,c.account_user_id)
      or not app_private.is_guardian(s.family_id,s.creator_id) or not app_private.contact_allowed(s.contact_id) then continue;end if;
    local_now:=clock_timestamp() at time zone s.timezone;today:=local_now::date;due:=(today+s.local_time) at time zone s.timezone;
    if extract(isodow from today)::int=any(s.weekdays) and due<=clock_timestamp() then
      insert into app_private.checkin_invitations(schedule_id,schedule_revision,family_id,child_id,recipient_id,creator_id,contact_id,question,local_date,due_at,expires_at)
        values(s.id,s.revision,s.family_id,s.child_id,c.account_user_id,s.creator_id,s.contact_id,s.question,today,due,((today+8)::timestamp at time zone s.timezone))
        on conflict(schedule_id,local_date) do nothing;
      get diagnostics n=row_count;created:=created+n;
    end if;
  end loop;
  return jsonb_build_object('status','checked','created',created,'sent',false);
end $$;

create or replace function app_private.suppress_contact_notifications(p_contact_id uuid) returns void
language sql security definer set search_path='' as $$
  update app_private.notification_outbox q set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null
    where q.status in('queued','leased') and (q.domain_event_id in(select id from app_private.domain_notification_events where contact_id=p_contact_id)
      or q.message_id in(select m.id from app_private.messages m join app_private.conversations v on v.id=m.conversation_id where v.contact_id=p_contact_id));
$$;

create or replace function api.lease_notifications(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];candidate record;q app_private.notification_outbox;tz text;start_hour int;end_hour int;hour_now int;result jsonb:='[]';
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid batch size' using errcode='22023';end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result;end if;
  select array_agg(id) into ids from(select id from app_private.notification_outbox where
    (status='queued' or (status='leased' and lease_until<clock_timestamp())) and next_attempt_at<=clock_timestamp() order by created_at,id limit p_limit) ready;
  perform app_private.notification_lock_sources(ids);
  for candidate in select id from app_private.notification_outbox where id=any(ids) order by id loop
    select * into q from app_private.notification_outbox where id=candidate.id for update;
    if not found or not(q.status='queued' or (q.status='leased' and q.lease_until<clock_timestamp())) or q.next_attempt_at>clock_timestamp() then continue;end if;
    if not app_private.notification_allowed(q.id) or q.attempts>=5 then
      update app_private.notification_outbox set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null where id=q.id;continue;end if;
    select timezone,quiet_start,quiet_end into tz,start_hour,end_hour from app_private.notification_preferences where user_id=q.recipient_id;
    hour_now:=extract(hour from clock_timestamp() at time zone tz)::int;
    if (start_hour<end_hour and hour_now>=start_hour and hour_now<end_hour) or (start_hour>end_hour and (hour_now>=start_hour or hour_now<end_hour)) then
      update app_private.notification_outbox set status='queued',next_attempt_at=clock_timestamp()+interval '1 hour',lease_token=null,lease_until=null where id=q.id;continue;end if;
    update app_private.notification_outbox set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' where id=q.id returning * into q;
    result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'leaseToken',q.lease_token,'deviceId',q.device_id,
      'platform',(select platform from app_private.device_tokens where id=q.device_id),'token',(select token from app_private.device_tokens where id=q.device_id),
      'payload',jsonb_build_object('title','Between Us','body','Open Between Us to check for updates.','data',jsonb_build_object('invalidationId',q.id))));
  end loop;
  return result;
end $$;

create or replace function api.lease_notification_receipts(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];candidate record;r app_private.notification_receipts;result jsonb:='[]';
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023';end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result;end if;
  select array_agg(outbox_id) into ids from(select outbox_id from app_private.notification_receipts where
    (status='pending' or (status='leased' and lease_until<clock_timestamp())) and next_attempt_at<=clock_timestamp() order by created_at,outbox_id limit p_limit) ready;
  perform app_private.notification_lock_sources(ids);
  for candidate in select outbox_id from app_private.notification_receipts where outbox_id=any(ids) order by outbox_id loop
    select * into r from app_private.notification_receipts where outbox_id=candidate.outbox_id for update;
    if not found or not(r.status='pending' or (r.status='leased' and r.lease_until<clock_timestamp())) or r.next_attempt_at>clock_timestamp() then continue;end if;
    if r.created_at<=clock_timestamp()-interval '24 hours' or r.attempts>=8 then
      update app_private.notification_receipts set status='expired',last_outcome='expired',lease_until=null,lease_token=null where outbox_id=r.outbox_id;continue;end if;
    if not app_private.notification_allowed(r.outbox_id) or not exists(select 1 from app_private.notification_outbox where id=r.outbox_id and status='provider_accepted') then
      update app_private.notification_receipts set status='suppressed',last_outcome='authorization',lease_until=null,lease_token=null where outbox_id=r.outbox_id;continue;end if;
    update app_private.notification_receipts set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' where outbox_id=r.outbox_id returning * into r;
    result:=result||jsonb_build_array(jsonb_build_object('id',r.outbox_id,'leaseToken',r.lease_token,'ticketId',r.ticket_id));
  end loop;
  return result;
end $$;

create or replace function api.authorize_notification(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.notification_lock_sources(array[p_outbox_id]);
  return exists(select 1 from app_private.notification_outbox where id=p_outbox_id and status='leased'
    and lease_token=p_lease_token and lease_until>clock_timestamp()) and app_private.notification_allowed(p_outbox_id);
end $$;

create or replace function api.complete_notification(p_outbox_id uuid,p_lease_token uuid,p_outcome text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q app_private.notification_outbox;
begin
  perform app_private.notification_lock_sources(array[p_outbox_id]);
  select * into q from app_private.notification_outbox where id=p_outbox_id for update;
  if not found or q.status<>'leased' or q.lease_token is distinct from p_lease_token or q.lease_until<=clock_timestamp() then
    raise exception 'invalid notification lease' using errcode='42501'; end if;
  if p_outcome is null or p_outcome not in('accepted','retry','invalid_token','failed') then raise exception 'invalid provider outcome' using errcode='22023'; end if;
  if not app_private.notification_allowed(q.id) then
    update app_private.notification_outbox set status='suppressed',last_outcome='authorization',lease_until=null,lease_token=null where id=q.id;
    return jsonb_build_object('id',q.id,'status','suppressed');
  end if;
  if p_outcome='invalid_token' then update app_private.device_tokens set revoked_at=clock_timestamp() where id=q.device_id; end if;
  update app_private.notification_outbox set
    status=case when p_outcome='accepted' then 'provider_accepted' when p_outcome='retry' and attempts<5 then 'queued' else 'failed' end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*(2^attempts)::int)),
    last_outcome=p_outcome,lease_until=null,lease_token=null where id=q.id returning * into q;
  return jsonb_build_object('id',q.id,'status',q.status,'deviceDelivered',false,'read',false);
end $$;

create or replace function api.record_notification_ticket(p_outbox_id uuid,p_lease_token uuid,p_ticket_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q app_private.notification_outbox; r app_private.notification_receipts; allowed boolean;
begin
  if p_ticket_id is null or p_ticket_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'invalid ticket' using errcode='22023'; end if;
  perform app_private.notification_lock_sources(array[p_outbox_id]);
  select * into q from app_private.notification_outbox where id=p_outbox_id for update;
  select * into r from app_private.notification_receipts where outbox_id=p_outbox_id for update;
  if r.outbox_id is not null then
    if r.ticket_id<>p_ticket_id or r.dispatch_lease_token is distinct from p_lease_token then raise exception 'ticket conflict' using errcode='22023'; end if;
    return jsonb_build_object('status','provider_accepted','deviceDelivered',false,'read',false);
  end if;
  if q.id is null or q.status<>'leased' or q.lease_token is distinct from p_lease_token or q.lease_until<=clock_timestamp() then
    raise exception 'invalid notification lease' using errcode='42501';
  end if;
  allowed:=app_private.notification_allowed(q.id);
  update app_private.notification_outbox set status='provider_accepted',last_outcome='accepted',lease_token=null,lease_until=null where id=q.id;
  insert into app_private.notification_receipts(outbox_id,ticket_id,dispatch_lease_token,status)
    values(q.id,p_ticket_id,p_lease_token,case when allowed then 'pending' else 'suppressed' end);
  return jsonb_build_object('status','provider_accepted','deviceDelivered',false,'read',false);
end $$;

create or replace function api.authorize_notification_receipt(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.notification_lock_sources(array[p_outbox_id]);
  return exists(select 1 from app_private.notification_receipts r join app_private.notification_outbox q on q.id=r.outbox_id
    where r.outbox_id=p_outbox_id and r.status='leased' and r.lease_token=p_lease_token and r.lease_until>clock_timestamp()
      and r.created_at>clock_timestamp()-interval '24 hours' and q.status='provider_accepted') and app_private.notification_allowed(p_outbox_id);
end $$;

create or replace function api.complete_notification_receipt(p_outbox_id uuid,p_lease_token uuid,p_outcome text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.notification_receipts; allowed boolean;
begin
  if p_outcome is null or p_outcome not in('provider_received','retry','invalid_token','failed') then raise exception 'invalid receipt outcome' using errcode='22023'; end if;
  perform app_private.notification_lock_sources(array[p_outbox_id]);
  select * into r from app_private.notification_receipts where outbox_id=p_outbox_id for update;
  if r.outbox_id is null or r.status<>'leased' or r.lease_token is distinct from p_lease_token or r.lease_until<=clock_timestamp() then
    raise exception 'invalid receipt lease' using errcode='42501';
  end if;
  allowed:=app_private.notification_allowed(p_outbox_id);
  -- A valid provider outcome revokes only this immutable device identity, even if contact access just changed.
  if p_outcome='invalid_token' then update app_private.device_tokens set revoked_at=coalesce(revoked_at,clock_timestamp())
    where id=(select device_id from app_private.notification_outbox where id=p_outbox_id); end if;
  if not allowed then
    update app_private.notification_receipts set status='suppressed',last_outcome='authorization',lease_until=null,lease_token=null where outbox_id=p_outbox_id;
  else
    update app_private.notification_receipts set
      status=case when p_outcome='provider_received' then 'provider_received' when p_outcome='retry' and attempts<8 and created_at>clock_timestamp()-interval '24 hours' then 'pending' when p_outcome='retry' then 'expired' else 'failed' end,
      next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,60*(2^attempts)::int)),
      last_outcome=p_outcome,lease_until=null,lease_token=null where outbox_id=p_outbox_id;
  end if;
  return jsonb_build_object('status',(select status from app_private.notification_receipts where outbox_id=p_outbox_id),'deviceDelivered',false,'read',false);
end $$;

-- All provider operations retain the same service-only interface and neutral worker DTOs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('domain_notification_enabled','domain_notification_allowed','message_notification_allowed',
      'notification_allowed','domain_lock_scope','notification_lock_sources','queue_domain_notification','domain_contact_notification',
      'domain_checkin_notification','domain_finance_notification','privacy_export_core_before_domain','privacy_export_core',
      'domain_notification_privacy_job','suppress_contact_notifications')) or
    (n.nspname='api' and p.proname in('produce_due_checkins','run_domain_notification_retention','lease_notifications','lease_notification_receipts',
      'authorize_notification','complete_notification','record_notification_ticket','authorize_notification_receipt','complete_notification_receipt')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
