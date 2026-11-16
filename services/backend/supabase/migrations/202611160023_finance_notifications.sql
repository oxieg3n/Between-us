-- Trusted TypeScript financeView projections, never a second SQL money engine. All new delivery remains OFF.
begin;
alter table app_private.domain_notification_policy add column payout_reminders_enabled boolean not null default false,
  add column savings_milestones_enabled boolean not null default false;
create table app_private.finance_notification_observations (
  child_id uuid primary key references app_private.children(id),family_id uuid not null references app_private.families(id),
  owner_id uuid not null references auth.users(id),goals jsonb not null default '{}'::jsonb,
  payout_latched boolean not null default false,last_payout_period text,
  check(jsonb_typeof(goals)='object' and octet_length(goals::text)<=32768)
);
create table app_private.finance_notification_signals (
  id uuid primary key default gen_random_uuid(),family_id uuid not null references app_private.families(id),
  child_id uuid not null references app_private.children(id),owner_id uuid not null references auth.users(id),
  kind text not null check(kind in('payout_due','savings_milestone')),goal_id text,period_key text,local_date date not null,
  check((kind='payout_due' and goal_id is null and period_key is not null) or (kind='savings_milestone' and goal_id is not null and period_key is null))
);
alter table app_private.finance_notification_observations enable row level security;
alter table app_private.finance_notification_signals enable row level security;
revoke all on app_private.finance_notification_observations,app_private.finance_notification_signals from public,anon,authenticated,service_role;

do $$ declare c record;begin
  for c in select conname from pg_constraint where conrelid='app_private.domain_notification_events'::regclass and contype='c'
    and (pg_get_constraintdef(oid) like '%source_kind%' or conname='domain_notification_events_event_kind_check') loop
    execute format('alter table app_private.domain_notification_events drop constraint %I',c.conname);
  end loop;
end $$;
alter table app_private.domain_notification_events add constraint domain_source_kinds check(source_kind in('contact','checkin','finance','finance_signal')),
  add constraint domain_event_kinds check(event_kind in('contact_approved','checkin_due','chore_assigned','chore_submitted','chore_reviewed','chore_changed',
    'payout_requested','payout_prepared','payout_changed','payment_reported','payment_acknowledged','payout_due','savings_milestone')),
  add constraint domain_source_binding check(
    (source_kind='contact' and event_kind='contact_approved' and source_id is not null and finance_sequence is null) or
    (source_kind='checkin' and event_kind='checkin_due' and source_id is not null and child_id is not null and finance_sequence is null) or
    (source_kind='finance' and event_kind not in('contact_approved','checkin_due','payout_due','savings_milestone') and family_id is not null and child_id is not null and finance_sequence is not null and finance_sequence>0) or
    (source_kind='finance_signal' and event_kind in('payout_due','savings_milestone') and family_id is not null and child_id is not null and source_id is not null and finance_sequence is null));

create or replace function app_private.domain_notification_enabled(p_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.domain_notification_policy where singleton and case
    when p_kind='contact_approved' then contacts_enabled when p_kind='checkin_due' then checkins_enabled
    when p_kind in('chore_assigned','chore_submitted','chore_reviewed','chore_changed') then chores_enabled
    when p_kind in('payout_requested','payout_prepared','payout_changed','payment_reported','payment_acknowledged') then payouts_enabled
    when p_kind='payout_due' then payout_reminders_enabled when p_kind='savings_milestone' then savings_milestones_enabled else false end);
$$;
create function app_private.finance_signal_allowed(p_event_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.domain_notification_events e join app_private.finance_notification_signals s on s.id=e.source_id
    join app_private.children ch on ch.id=s.child_id join app_private.trusted_contacts c on c.id=e.contact_id
    join app_private.finance_aggregates a on a.family_id=s.family_id
    where e.id=p_event_id and e.source_kind='finance_signal' and e.cancelled_at is null and e.expires_at>clock_timestamp()
      and e.event_kind=s.kind and e.family_id=s.family_id and e.child_id=s.child_id and ch.family_id=s.family_id
      and ch.account_user_id=s.owner_id and ch.state='active' and app_private.child_for_user(s.family_id,s.owner_id)=ch.id
      and app_private.account_usable(e.actor_id) and app_private.account_usable(e.recipient_id)
      and app_private.domain_notification_enabled(s.kind) and app_private.contact_allowed(c.id)
      and c.a=least(e.actor_id,e.recipient_id) and c.b=greatest(e.actor_id,e.recipient_id)
      and ((s.kind='payout_due' and e.actor_id=s.owner_id and app_private.is_guardian(s.family_id,e.recipient_id)
        and s.local_date=(clock_timestamp() at time zone (a.state->>'timezone'))::date) or
        (s.kind='savings_milestone' and e.recipient_id=s.owner_id and app_private.is_guardian(s.family_id,e.actor_id))));
$$;
-- Preserve all013 source semantics; only the new structurally authorized source joins its lease path.
create or replace function app_private.domain_notification_allowed(p_event_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select app_private.finance_signal_allowed(p_event_id) or exists(select 1 from app_private.domain_notification_events e join app_private.trusted_contacts c on c.id=e.contact_id
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

create function app_private.finance_notification_lock(p_family uuid,p_child uuid,p_extra_contacts uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare contacts uuid[];
begin
  select coalesce(array_agg(id),'{}')||p_extra_contacts into contacts from (
    select c.id from app_private.children ch join app_private.memberships m on m.family_id=ch.family_id
      join app_private.trusted_contacts c on c.a=least(ch.account_user_id,m.user_id) and c.b=greatest(ch.account_user_id,m.user_id)
      where ch.id=p_child and ch.family_id=p_family and app_private.is_guardian(p_family,m.user_id) order by m.user_id limit 8
  ) bound;
  perform app_private.domain_lock_scope(array[p_family],contacts);
end $$;
create function app_private.finance_notification_projection_valid(p_projection jsonb,p_family uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare g jsonb;n int;
begin
  if p_projection is null or jsonb_typeof(p_projection)<>'object' or p_projection-array['localDate','payout','goals']<>'{}'::jsonb
    or not p_projection ?& array['localDate','payout','goals'] or jsonb_typeof(p_projection->'goals')<>'array'
    or jsonb_array_length(p_projection->'goals')>32 or octet_length(p_projection::text)>32768
    or p_projection->>'localDate' is distinct from (select (clock_timestamp() at time zone (state->>'timezone'))::date::text from app_private.finance_aggregates where family_id=p_family)
    or jsonb_typeof(p_projection->'payout')<>'object' or (p_projection->'payout')-array['scheduled','due','periodKey']<>'{}'::jsonb
    or not (p_projection->'payout') ?& array['scheduled','due','periodKey']
    or jsonb_typeof(p_projection#>'{payout,scheduled}')<>'boolean' or jsonb_typeof(p_projection#>'{payout,due}')<>'boolean'
    or jsonb_typeof(p_projection#>'{payout,periodKey}')<>'string' or length(p_projection#>>'{payout,periodKey}')>100 then return false;end if;
  for g in select value from jsonb_array_elements(p_projection->'goals') loop
    if jsonb_typeof(g)<>'object' or g-array['id','complete']<>'{}'::jsonb or not g ?& array['id','complete']
      or jsonb_typeof(g->'id')<>'string' or length(g->>'id') not between 1 and 160
      or jsonb_typeof(g->'complete')<>'boolean' then return false;end if;
  end loop;
  select count(distinct value->>'id') into n from jsonb_array_elements(p_projection->'goals');
  return n=jsonb_array_length(p_projection->'goals');
end $$;
create function api.finance_notification_scopes(p_limit int default 20,p_after_child_id uuid default null,p_child_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;more boolean;last_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch' using errcode='22023';end if;
  if not exists(select 1 from app_private.domain_notification_policy cross join app_private.communication_policy cp where cp.singleton
    and cp.push_delivery_enabled and (payout_reminders_enabled or savings_milestones_enabled)) then
    return jsonb_build_object('status','disabled','scopes','[]'::jsonb,'nextAfterChildId',null);end if;
  select coalesce(jsonb_agg(jsonb_build_object('familyId',family_id,'childId',id) order by id),'[]'::jsonb) into result from (
    select ch.id,ch.family_id from app_private.children ch join app_private.finance_aggregates a on a.family_id=ch.family_id
      where ch.state='active' and app_private.child_for_user(ch.family_id,ch.account_user_id)=ch.id and app_private.account_usable(ch.account_user_id)
        and exists(select 1 from jsonb_array_elements(a.state->'children') roster where roster->>'id'=ch.id::text)
        and (p_after_child_id is null or ch.id>p_after_child_id) and (p_child_id is null or ch.id=p_child_id) order by ch.id limit p_limit+1
  ) candidates;
  more:=jsonb_array_length(result)>p_limit;
  if more then result:=result-(jsonb_array_length(result)-1);last_id:=(result->-1->>'childId')::uuid;end if;
  return jsonb_build_object('status','ready','scopes',result,'nextAfterChildId',last_id);
end $$;
create function api.finance_notification_snapshot(p_family_id uuid,p_child_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a app_private.finance_aggregates;
begin
  if p_family_id is null or p_child_id is null then raise exception 'invalid scope' using errcode='22023';end if;
  perform app_private.finance_notification_lock(p_family_id,p_child_id);
  if not exists(select 1 from app_private.children where id=p_child_id and family_id=p_family_id and state='active'
    and app_private.child_for_user(p_family_id,account_user_id)=id and app_private.account_usable(account_user_id)) then return jsonb_build_object('status','unavailable');end if;
  select * into a from app_private.finance_aggregates where family_id=p_family_id;
  if not found then return jsonb_build_object('status','unavailable');end if;
  if not exists(select 1 from jsonb_array_elements(a.state->'children') roster where roster->>'id'=p_child_id::text) then return jsonb_build_object('status','unavailable');end if;
  if octet_length(a.state::text)>4194304 then raise exception 'capacity review required' using errcode='54000';end if;
  return jsonb_build_object('status','ready','familyId',p_family_id,'childId',p_child_id,'state',a.state,'revision',a.revision,
    'serverAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;

create function app_private.queue_finance_signal(p_family uuid,p_child uuid,p_owner uuid,p_kind text,p_goal text,p_period text,p_day date,p_limit int) returns int
language plpgsql security definer set search_path='' as $$
declare signal uuid;n int:=0;recipients uuid[];contacts uuid[];expected int;i int;
begin
  if p_limit<=0 then return 0;end if;
  -- Match finance_notification_lock's first-eight universe before choosing usable recipients.
  select array_agg(user_id order by user_id),array_agg(id order by user_id) into recipients,contacts from (
    select bound.user_id,bound.id from (
      select m.user_id,c.id from app_private.memberships m join app_private.trusted_contacts c
        on c.a=least(p_owner,m.user_id) and c.b=greatest(p_owner,m.user_id)
        where m.family_id=p_family and app_private.is_guardian(p_family,m.user_id) order by m.user_id limit 8
    ) bound where app_private.contact_allowed(bound.id) and exists(
      select 1 from app_private.device_tokens d join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
        join app_private.notification_preferences p on p.user_id=d.user_id
        where d.user_id=case when p_kind='payout_due' then bound.user_id else p_owner end and d.revoked_at is null and p.enabled
          and (s.not_after is null or s.not_after>clock_timestamp()))
    order by bound.user_id limit case when p_kind='savings_milestone' then 1 else 8 end
  ) target;
  expected:=coalesce(cardinality(recipients),0);
  if expected=0 or expected>p_limit then return 0;end if;
  begin
    insert into app_private.finance_notification_signals(family_id,child_id,owner_id,kind,goal_id,period_key,local_date)
      values(p_family,p_child,p_owner,p_kind,p_goal,p_period,p_day) returning id into signal;
    for i in 1..expected loop
      perform app_private.queue_domain_notification(p_kind,'finance_signal',signal::text,p_family,p_child,
        case when p_kind='payout_due' then p_owner else recipients[i] end,case when p_kind='payout_due' then recipients[i] else p_owner end,contacts[i],signal);
    end loop;
    select count(*) into n from app_private.domain_notification_events where source_kind='finance_signal' and source_id=signal;
    if n<>expected or exists(select 1 from app_private.domain_notification_events e where e.source_kind='finance_signal' and e.source_id=signal
      and not exists(select 1 from app_private.notification_outbox q where q.domain_event_id=e.id)) then
      raise exception 'fanout changed or no queue capacity' using errcode='BU001';end if;
    return n;
  exception when sqlstate 'BU001' then return 0; -- Roll back the whole source, its outboxes and quotas; never consume a subset.
  end;
end $$;
create function api.queue_finance_notifications(p_family_id uuid,p_child_id uuid,p_expected_revision bigint,p_projection jsonb,p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a app_private.finance_aggregates;ch app_private.children;o app_private.finance_notification_observations;
  g jsonb;prior jsonb;marks jsonb;complete boolean;latched boolean;period text;created int:=0;first_seen boolean;queued int;
begin
  if p_family_id is null or p_child_id is null or p_expected_revision is null or p_limit is null or p_limit not between 8 and 20 then raise exception 'invalid scope or finance batch (minimum8)' using errcode='22023';end if;
  if not exists(select 1 from app_private.domain_notification_policy cross join app_private.communication_policy cp where cp.singleton
    and cp.push_delivery_enabled and (payout_reminders_enabled or savings_milestones_enabled)) then return jsonb_build_object('status','disabled','created',0);end if;
  perform app_private.finance_notification_lock(p_family_id,p_child_id);
  select * into ch from app_private.children where id=p_child_id and family_id=p_family_id and state='active';
  if not found or app_private.child_for_user(p_family_id,ch.account_user_id) is distinct from ch.id or not app_private.account_usable(ch.account_user_id) then
    return jsonb_build_object('status','unavailable','created',0);end if;
  select * into a from app_private.finance_aggregates where family_id=p_family_id;
  if not found or a.revision is distinct from p_expected_revision then return jsonb_build_object('status','conflict','created',0);end if;
  if p_projection->>'localDate' is distinct from (select (clock_timestamp() at time zone (state->>'timezone'))::date::text from app_private.finance_aggregates where family_id=p_family_id) then
    return jsonb_build_object('status','conflict','created',0);end if;
  if not app_private.finance_notification_projection_valid(p_projection,p_family_id) then raise exception 'invalid projection' using errcode='22023';end if;
  select * into o from app_private.finance_notification_observations where child_id=p_child_id for update;
  if found and (o.owner_id<>ch.account_user_id or o.family_id<>p_family_id) then raise exception 'binding changed' using errcode='42501';end if;
  marks:=coalesce(o.goals,'{}'::jsonb);latched:=coalesce(o.payout_latched,false);period:=o.last_payout_period;
  if app_private.domain_notification_enabled('payout_due') then
    if (p_projection#>>'{payout,scheduled}')::boolean and (p_projection#>>'{payout,due}')::boolean then
      if not latched and period is distinct from p_projection#>>'{payout,periodKey}' then
        queued:=app_private.queue_finance_signal(p_family_id,p_child_id,ch.account_user_id,'payout_due',null,p_projection#>>'{payout,periodKey}',(p_projection->>'localDate')::date,p_limit-created);
        created:=created+queued;
        if queued>0 then period:=p_projection#>>'{payout,periodKey}';latched:=true;end if;
      end if;
    else latched:=false;end if;
  end if;
  if app_private.domain_notification_enabled('savings_milestone') then
    for g in select value from jsonb_array_elements(p_projection->'goals') loop
      complete:=(g->>'complete')::boolean;prior:=marks->(g->>'id');first_seen:=prior is null;
      queued:=0;
      if not first_seen and complete and not (prior->>'announced')::boolean then
        queued:=app_private.queue_finance_signal(p_family_id,p_child_id,ch.account_user_id,'savings_milestone',g->>'id',null,(p_projection->>'localDate')::date,p_limit-created);
        created:=created+queued;
      end if;
      marks:=jsonb_set(marks,array[g->>'id'],jsonb_build_object('complete',complete,'announced',(first_seen and complete) or queued>0 or coalesce((prior->>'announced')::boolean,false)),true);
    end loop;
  end if;
  if (select count(*) from jsonb_object_keys(marks))>32 then raise exception 'capacity review required' using errcode='54000';end if;
  insert into app_private.finance_notification_observations(child_id,family_id,owner_id,goals,payout_latched,last_payout_period)
    values(p_child_id,p_family_id,ch.account_user_id,marks,latched,period)
    on conflict(child_id) do update set goals=excluded.goals,payout_latched=excluded.payout_latched,last_payout_period=excluded.last_payout_period
      where (app_private.finance_notification_observations.goals,app_private.finance_notification_observations.payout_latched,app_private.finance_notification_observations.last_payout_period)
        is distinct from (excluded.goals,excluded.payout_latched,excluded.last_payout_period);
  return jsonb_build_object('status','committed','created',created);
end $$;

-- The ordinary worker must not authorize new financial sources using only structural contact checks.
alter function api.authorize_notification(uuid,uuid) rename to authorize_notification_before_finance_signals;
alter function api.authorize_notification_before_finance_signals(uuid,uuid) set schema app_private;
alter function api.authorize_notification_receipt(uuid,uuid) rename to authorize_notification_receipt_before_finance_signals;
alter function api.authorize_notification_receipt_before_finance_signals(uuid,uuid) set schema app_private;
create function api.authorize_notification(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id where q.id=p_outbox_id and e.source_kind='finance_signal') then return false;end if;
  return app_private.authorize_notification_before_finance_signals(p_outbox_id,p_lease_token);
end $$;
create function api.authorize_notification_receipt(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$ begin
  if exists(select 1 from app_private.notification_outbox q join app_private.domain_notification_events e on e.id=q.domain_event_id where q.id=p_outbox_id and e.source_kind='finance_signal') then return false;end if;
  return app_private.authorize_notification_receipt_before_finance_signals(p_outbox_id,p_lease_token);
end $$;
create function api.finance_notification_delivery_snapshot(p_outbox_id uuid,p_lease_token uuid,p_receipt boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e app_private.domain_notification_events;result jsonb;
begin
  select event.* into e from app_private.domain_notification_events event join app_private.notification_outbox q on q.domain_event_id=event.id where q.id=p_outbox_id;
  if not found or e.source_kind<>'finance_signal' then return jsonb_build_object('status','legacy');end if;
  perform app_private.finance_notification_lock(e.family_id,e.child_id,array[e.contact_id]);
  if p_receipt is null or not (case when p_receipt then app_private.authorize_notification_receipt_before_finance_signals(p_outbox_id,p_lease_token)
    else app_private.authorize_notification_before_finance_signals(p_outbox_id,p_lease_token) end) then return jsonb_build_object('status','unavailable');end if;
  result:=api.finance_notification_snapshot(e.family_id,e.child_id);return result;
end $$;
create function api.authorize_finance_notification(p_outbox_id uuid,p_lease_token uuid,p_receipt boolean,p_expected_revision bigint,p_projection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e app_private.domain_notification_events;s app_private.finance_notification_signals;allowed boolean:=false;revision bigint;
begin
  select event.* into e from app_private.domain_notification_events event join app_private.notification_outbox q on q.domain_event_id=event.id where q.id=p_outbox_id;
  if not found or e.source_kind<>'finance_signal' or p_receipt is null or p_expected_revision is null then return jsonb_build_object('status','checked','allowed',false);end if;
  perform app_private.finance_notification_lock(e.family_id,e.child_id,array[e.contact_id]);
  select a.revision into revision from app_private.finance_aggregates a where a.family_id=e.family_id;
  if revision is distinct from p_expected_revision then return jsonb_build_object('status','conflict');end if;
  if p_projection->>'localDate' is distinct from (select (clock_timestamp() at time zone (state->>'timezone'))::date::text from app_private.finance_aggregates where family_id=e.family_id) then
    return jsonb_build_object('status','conflict');end if;
  if not app_private.finance_notification_projection_valid(p_projection,e.family_id) then raise exception 'invalid projection' using errcode='22023';end if;
  select * into s from app_private.finance_notification_signals where id=e.source_id;
  allowed:=case when p_receipt then app_private.authorize_notification_receipt_before_finance_signals(p_outbox_id,p_lease_token)
    else app_private.authorize_notification_before_finance_signals(p_outbox_id,p_lease_token) end;
  allowed:=allowed and case when s.kind='payout_due' then
    (p_projection#>>'{payout,scheduled}')::boolean and (p_projection#>>'{payout,due}')::boolean and p_projection#>>'{payout,periodKey}'=s.period_key
    else exists(select 1 from jsonb_array_elements(p_projection->'goals') g where g->>'id'=s.goal_id and g->'complete'='true'::jsonb) end;
  return jsonb_build_object('status','checked','allowed',coalesce(allowed,false));
end $$;

create function app_private.finance_signal_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if old.source_kind='finance_signal' then delete from app_private.finance_notification_signals s where s.id=old.source_id
    and not exists(select 1 from app_private.domain_notification_events e where e.source_kind='finance_signal' and e.source_id=s.id);end if;
  return old;
end $$;
create trigger finance_signal_cleanup after delete on app_private.domain_notification_events for each row execute function app_private.finance_signal_cleanup();
create function app_private.finance_observation_privacy() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if new.kind='deletion' and new.status='access_revoked' and not app_private.privacy_has_hold(new.subject_id,'finance')
    and not app_private.privacy_has_hold(new.subject_id,'identity') then
    delete from app_private.finance_notification_observations where owner_id=new.subject_id;
  end if;return new;
end $$;
create trigger finance_observation_privacy before insert or update on app_private.privacy_lifecycle_jobs for each row execute function app_private.finance_observation_privacy();
-- Preserve013 cleanup while treating the new source as financial metadata, including finite holds.
create or replace function app_private.domain_notification_privacy_job() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.kind='deletion' and new.status='access_revoked' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update app_private.domain_notification_events set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where new.subject_id in(actor_id,recipient_id);
    delete from app_private.notification_outbox where domain_event_id in(select id from app_private.domain_notification_events where new.subject_id in(actor_id,recipient_id));
    delete from app_private.domain_notification_events e where new.subject_id in(e.actor_id,e.recipient_id)
      and not app_private.privacy_has_hold(e.actor_id,'messages') and not app_private.privacy_has_hold(e.recipient_id,'messages')
      and not app_private.privacy_has_hold(e.actor_id,'identity') and not app_private.privacy_has_hold(e.recipient_id,'identity')
      and (e.source_kind not in('finance','finance_signal') or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')));
    new.stages:=new.stages||array['domain_notifications_cancelled','own_unheld_domain_notification_metadata_erased'];
  end if;return new;
end $$;
create or replace function api.run_domain_notification_retention(p_subject_id uuid,p_operator_id uuid,p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];families uuid[];contacts uuid[];n int;extra int;
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
      and (e.source_kind not in('finance','finance_signal') or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')))
    order by e.created_at,e.id limit p_limit) ready;
  -- Hold creation uses the subject's retained membership/child families. Include observations even with no old events.
  select array_agg(family_id order by family_id) into families from (
    select unnest(coalesce(families,'{}'::uuid[])) family_id
    union select family_id from app_private.finance_notification_observations where owner_id=p_subject_id
    union select family_id from app_private.memberships where user_id=p_subject_id
    union select family_id from app_private.children where account_user_id=p_subject_id
  ) subject_families;
  perform app_private.domain_lock_scope(families,contacts);
  delete from app_private.domain_notification_events e where e.id=any(ids)
    and not app_private.privacy_has_hold(e.actor_id,'messages') and not app_private.privacy_has_hold(e.recipient_id,'messages')
    and not app_private.privacy_has_hold(e.actor_id,'identity') and not app_private.privacy_has_hold(e.recipient_id,'identity')
    and (e.source_kind not in('finance','finance_signal') or (not app_private.privacy_has_hold(e.actor_id,'finance') and not app_private.privacy_has_hold(e.recipient_id,'finance')));
  get diagnostics n=row_count;
  if n<p_limit then
    delete from app_private.finance_notification_observations where owner_id=p_subject_id
      and not app_private.privacy_has_hold(p_subject_id,'finance') and not app_private.privacy_has_hold(p_subject_id,'identity')
      and exists(select 1 from app_private.profiles where user_id=p_subject_id and state='closed');
    get diagnostics extra=row_count;n:=n+extra;
  end if;
  return jsonb_build_object('deleted',n,'allDataDeleted',false);
end $$;

alter function app_private.privacy_export_core(uuid) rename to privacy_export_core_before_finance_observations;
create function app_private.privacy_export_core(p_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;observations jsonb;
begin
  result:=app_private.privacy_export_core_before_finance_observations(p_subject);
  if (select count(*) from app_private.finance_notification_observations where owner_id=p_subject)>32 then
    raise exception 'export capacity review required' using errcode='54000';end if;
  select coalesce(jsonb_agg(jsonb_build_object('familyId',o.family_id,'childId',o.child_id,'goals',(
      select coalesce(jsonb_agg(jsonb_build_object('goalId',entry.key,'complete',entry.value->'complete','announced',entry.value->'announced') order by entry.key),'[]'::jsonb)
        from jsonb_each(o.goals) entry),'payoutLatched',o.payout_latched,'lastPayoutPeriod',o.last_payout_period) order by o.child_id),'[]'::jsonb)
    into observations from app_private.finance_notification_observations o where o.owner_id=p_subject;
  result:=result||jsonb_build_object('financeNotificationObservations',observations);
  if octet_length(result::text)>7340032 then raise exception 'export capacity review required' using errcode='54000';end if;
  return result;
end $$;

do $$ declare f record;begin
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('finance_signal_allowed','finance_notification_lock','finance_notification_projection_valid',
      'queue_finance_signal','authorize_notification_before_finance_signals','authorize_notification_receipt_before_finance_signals','finance_signal_cleanup','finance_observation_privacy',
      'privacy_export_core_before_finance_observations','privacy_export_core')) or
    (n.nspname='api' and p.proname in('finance_notification_scopes','finance_notification_snapshot','queue_finance_notifications',
      'authorize_notification','authorize_notification_receipt','finance_notification_delivery_snapshot','authorize_finance_notification')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
commit;
