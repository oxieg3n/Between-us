begin;
lock table app_private.finance_events,app_private.finance_commands in share row exclusive mode;
-- Accepted event times are server-assigned strict UTC ISO strings; text prefixes avoid nonimmutable timestamp casts.
create index finance_events_admission_minute on app_private.finance_events(family_id,child_id,
  ((payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')),
  (left(payload->>'at',16)),(split_part(event_id,':',1)));
create index finance_events_admission_day on app_private.finance_events(family_id,child_id,
  ((payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')),
  (left(payload->>'at',10)));

create function app_private.finance_write_admit(p_family uuid,p_child uuid,p_actor uuid,p_sequence integer) returns void
language plpgsql volatile security definer set search_path='' as $$
declare e app_private.finance_events;hidden boolean;minute_key text;day_key text;used integer;day_limit integer;begin
  -- Trusted local bulk fixtures only. Hosted/client/service callers cannot change this policy flag.
  if exists(select 1 from app_private.deployment_policy where singleton and local_synthetic) then return;end if;
  -- The core already holds this reentrant family lock; retain it through admission and transaction completion.
  perform app_private.lock_family(p_family);
  select * into e from app_private.finance_events where family_id=p_family and child_id=p_child and sequence=p_sequence;
  if not found or split_part(e.event_id,':',1) is distinct from p_actor::text
    or coalesce(e.payload->>'at','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
    or not exists(select 1 from app_private.finance_commands where family_id=p_family and actor_id=p_actor and event_sequence=p_sequence) then
    raise exception 'financial admission source unavailable' using errcode='XX001';end if;
  hidden:=(e.payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');
  minute_key:=left(e.payload->>'at',16);day_key:=left(e.payload->>'at',10);day_limit:=case when hidden then 200 else 1000 end;
  select count(*) into used from(select 1 from app_private.finance_events x where x.family_id=p_family and x.child_id=p_child
    and((x.payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))=hidden
    and left(x.payload->>'at',16)=minute_key and split_part(x.event_id,':',1)=p_actor::text limit 61) bounded;
  if used>60 then raise exception 'Too many financial actions. Try again later.' using errcode='PT429';end if;
  if hidden then
    select count(*) into used from(select 1 from app_private.finance_events x where x.family_id=p_family and x.child_id=p_child
      and((x.payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))=true
      and left(x.payload->>'at',10)=day_key limit 201) bounded;
  else
    select count(*) into used from(select 1 from app_private.finance_events x where x.family_id=p_family and x.child_id=p_child
      and((x.payload->>'kind') in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))=false
      and left(x.payload->>'at',10)=day_key limit 1001) bounded;
  end if;
  if used>day_limit then raise exception 'Too many financial actions. Try again later.' using errcode='PT429';end if;
end $$;

alter function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) set schema app_private;
alter function app_private.finance_commit(jsonb,uuid,text,bigint,jsonb,text) rename to finance_commit_projection_core;
revoke all on function app_private.finance_commit_projection_core(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated,service_role;
create function api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;sequence integer;begin
  result:=app_private.finance_commit_projection_core(p_scope,p_operation_id,p_fingerprint,p_expected_revision,p_state,p_server_at);
  if result->>'status'<>'committed' then return result;end if;
  select event_sequence into sequence from app_private.finance_commands where family_id=(p_scope->>'familyId')::uuid
    and actor_id=(p_scope->>'actorId')::uuid and operation_id=p_operation_id;
  perform app_private.finance_write_admit((p_scope->>'familyId')::uuid,(p_scope->>'childId')::uuid,(p_scope->>'actorId')::uuid,sequence);
  -- The service already holds this exact validated immutable candidate. Avoid returning
  -- another full family aggregate on a successful new envelope; racing retries above
  -- still need the latest database state. Legacy bare-state callers remain compatible.
  return case when p_state?'state' then result-'state' else result end;
end $$;
revoke all on function app_private.finance_write_admit(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) to service_role;
-- Conservative new work budgets (about25events/week in the52-week realistic fixture), not a database-size guarantee.
-- The original128visible/32private tail limits, immutable ledger/UUID retention and resource circuit are unchanged.
commit;
