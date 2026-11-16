-- Content-free operator telemetry; default-closed hosted growth circuit, not a billing guarantee.
begin;
create function app_private.resource_metrics_valid(p_metrics jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare fields text[]:=array['databaseBytes','uncachedEgressBytes','cachedEgressBytes','storageBytes','monthlyActiveUsers',
  'edgeInvocations','realtimeMessages','peakRealtimeConnections','realtimeMessagesPerSecond','channelJoinsPerSecond']; k text;n numeric;
begin
  if p_metrics is null or jsonb_typeof(p_metrics)<>'object' then return false;end if;
  if (select count(*) from jsonb_object_keys(p_metrics))<>10 or not p_metrics ?& fields then return false;end if;
  foreach k in array fields loop
    if jsonb_typeof(p_metrics->k) is distinct from 'number' then return false;end if;
    n:=(p_metrics->>k)::numeric;
    if n<0 or n>9007199254740991 then return false;end if;
  end loop;
  return true;
end $$;
create table app_private.resource_policy (
  singleton boolean primary key default true check(singleton),
  enforcement_enabled boolean not null default true check(enforcement_enabled),
  sample_max_age_seconds integer not null default 900 check(sample_max_age_seconds between 1 and 900),
  warning_percent integer not null default 50 check(warning_percent between 1 and 50),
  background_percent integer not null default 70 check(background_percent>warning_percent and background_percent<=70),
  growth_percent integer not null default 90 check(growth_percent>background_percent and growth_percent<=90)
);
insert into app_private.resource_policy(singleton) values(true);
create table app_private.resource_sample (
  singleton boolean primary key default true check(singleton),
  collected_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  project_available boolean not null,
  metrics jsonb not null check(app_private.resource_metrics_valid(metrics))
);
alter table app_private.resource_policy enable row level security;
alter table app_private.resource_sample enable row level security;
revoke all on app_private.resource_policy,app_private.resource_sample from public,anon,authenticated,service_role;

create function app_private.resource_band() returns integer
language plpgsql volatile security definer set search_path='' as $$
declare p app_private.resource_policy; s app_private.resource_sample; ratio numeric; observed timestamptz:=clock_timestamp();
begin
  -- This trusted deployment flag is unavailable to clients/service_role and forbidden in hosted release configuration.
  if exists(select 1 from app_private.deployment_policy where singleton and local_synthetic) then return 0;end if;
  -- No FOR UPDATE/advisory locks: callers may already hold family/relationship/session locks.
  select * into p from app_private.resource_policy where singleton;
  if not found or not p.enforcement_enabled then return 3;end if;
  select * into s from app_private.resource_sample where singleton;
  if not found or not s.project_available or not app_private.resource_metrics_valid(s.metrics)
    or s.collected_at>observed or s.collected_at<observed-make_interval(secs=>p.sample_max_age_seconds)
    or s.received_at>observed then return 3;end if;
  select max((s.metrics->>q.name)::numeric/q.quota) into ratio from (values
    ('databaseBytes',500000000::numeric),('uncachedEgressBytes',5000000000),('cachedEgressBytes',5000000000),
    ('storageBytes',1000000000),('monthlyActiveUsers',50000),('edgeInvocations',500000),('realtimeMessages',2000000),
    ('peakRealtimeConnections',200),('realtimeMessagesPerSecond',100),('channelJoinsPerSecond',100)) q(name,quota);
  if ratio is null or ratio*100>=p.growth_percent then return 3;
  elsif ratio*100>=p.background_percent then return 2;
  elsif ratio*100>=p.warning_percent then return 1;
  else return 0;end if;
end $$;

create function api.record_resource_sample(p_sample jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare metrics jsonb; n numeric; collected timestamptz; observed timestamptz:=clock_timestamp(); measured bigint;
begin
  if p_sample is null or jsonb_typeof(p_sample)<>'object' then raise exception 'invalid resource sample' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(p_sample))<>4 or not p_sample ?& array['plan','projectAvailable','collectedAtMs','metrics']
    or p_sample->>'plan' is distinct from 'free' or jsonb_typeof(p_sample->'projectAvailable') is distinct from 'boolean'
    or jsonb_typeof(p_sample->'collectedAtMs') is distinct from 'number'
    or jsonb_typeof(p_sample->'metrics') is distinct from 'object' then
    raise exception 'invalid resource sample' using errcode='22023';end if;
  metrics:=p_sample->'metrics';
  if not app_private.resource_metrics_valid(metrics) then
    raise exception 'invalid resource sample' using errcode='22023';end if;
  n:=(p_sample->>'collectedAtMs')::numeric;
  if n<0 or n>9007199254740991 or n<>trunc(n)
    or n>extract(epoch from observed)*1000 or n<extract(epoch from observed-interval '15 minutes')*1000 then
    raise exception 'invalid resource sample' using errcode='22023';end if;
  collected:=to_timestamp(n/1000);
  -- Operator cannot understate database size. Other metrics require a separately authorized real provider feed.
  measured:=pg_database_size(current_database());
  metrics:=jsonb_set(metrics,'{databaseBytes}',to_jsonb(measured));
  -- This function locks only its own singleton; it never obtains family, identity, relationship or finance locks.
  insert into app_private.resource_sample(singleton,collected_at,received_at,project_available,metrics)
    values(true,collected,observed,(p_sample->>'projectAvailable')::boolean,metrics)
    on conflict(singleton) do update set collected_at=excluded.collected_at,received_at=excluded.received_at,
      project_available=excluded.project_available,metrics=excluded.metrics
    where app_private.resource_sample.collected_at<=excluded.collected_at;
  if not found then raise exception 'stale resource sample' using errcode='22023';end if;
  return jsonb_build_object('recorded',true,'databaseBytes',measured,'state',
    (array['normal','warning','restricted','unavailable'])[app_private.resource_band()+1]);
end $$;

create function api.resource_status() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s app_private.resource_sample; b integer; local_mode boolean;
begin
  b:=app_private.resource_band();
  select exists(select 1 from app_private.deployment_policy where singleton and local_synthetic) into local_mode;
  select * into s from app_private.resource_sample where singleton;
  return jsonb_build_object('state',(array['normal','warning','restricted','unavailable'])[b+1],
    'localSyntheticBypass',local_mode,'allowGrowth',b<3,'allowNotificationLeases',b<2,
    'samplePresent',s.singleton is not null,'collectedAt',s.collected_at,'metrics',s.metrics,
    'measuredDatabaseBytes',pg_database_size(current_database()));
end $$;

create function app_private.guard_resource_growth() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  -- Exact no-op updates do not consume capacity; financial RPC replay returns before mutation.
  if tg_op='UPDATE' and new is not distinct from old then return new;end if;
  if app_private.resource_band()>=3 then
    raise exception 'Service is temporarily unavailable.' using errcode='PT503';end if;
  return new;
end $$;

create function app_private.guard_notification_resource_lease() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  if new.status='leased' and app_private.resource_band()>=2 then
    raise exception 'Service is temporarily unavailable.' using errcode='PT503';end if;
  return new;
end $$;

do $$ declare tab text;begin
  -- Audited named normal-growth tables only. Service-role/SECURITY DEFINER writes still execute triggers.
  foreach tab in array array['profiles','families','children','memberships','registration_intents','guardian_invites',
    'trusted_contacts','external_contact_invitations','conversations','messages','device_tokens',
    'checkin_schedules','checkin_invitations','finance_aggregates','finance_events','finance_commands'] loop
    execute format('create trigger resource_growth_before_insert before insert on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);
  end loop;
end $$;
create trigger resource_growth_before_update before update on app_private.finance_aggregates
  for each row execute function app_private.guard_resource_growth();
create trigger resource_notification_before_lease before insert or update on app_private.notification_outbox
  for each row execute function app_private.guard_notification_resource_lease();

-- Deliberate critical exceptions: blocks; existing consent withdrawal/revocation; account/session/token revocation;
-- confidential reports; privacy requests/jobs/reauth/export/delete/holds; audit and opaque invalidation hints;
-- notification bookkeeping/receipt reconciliation and check-in skip/defer. Existing authorization/quotas still apply.
-- Neutral notifications are never silently dropped: inserts remain recorded, but dispatch leases stop at 70%.
-- A leased item already in flight is not recalled. Sample lag means this is a circuit, not a hard provider cap.
-- No counter/usage data is returned to ordinary callers, and no RLS/auth/consent/journal or finance cap is relaxed.
revoke all on function app_private.resource_metrics_valid(jsonb),app_private.resource_band(),app_private.guard_resource_growth(),app_private.guard_notification_resource_lease()
  from public,anon,authenticated,service_role;
revoke all on function api.record_resource_sample(jsonb),api.resource_status() from public,anon,authenticated;
grant execute on function api.record_resource_sample(jsonb),api.resource_status() to service_role;
commit;
