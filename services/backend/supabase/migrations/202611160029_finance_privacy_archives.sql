begin;
lock table app_private.finance_aggregates,app_private.finance_events,app_private.finance_commands in share row exclusive mode;

-- Exact trusted projections are captured in the SAME transaction as the original command.
-- They are not reconstructed from pruned source lots or inferred from a percentage action.
create table app_private.finance_activity (
  family_id uuid not null,sequence integer not null,child_id uuid not null,event_id text not null,
  kind text not null,event_at text not null,actor_role text not null check(actor_role in('parent','child')),
  activity jsonb not null check(coalesce(jsonb_typeof(activity)='object' and octet_length(activity::text)<=16384
    and activity?&array['id','at','label','actorRole','referenceId']
    and activity-array['id','at','label','actorRole','referenceId','amountCents','note']='{}'::jsonb
    and activity->>'id'=event_id and activity->>'at'=event_at and activity->>'actorRole'=actor_role
    and jsonb_typeof(activity->'label')='string' and char_length(activity->>'label') between 1 and 160
    and jsonb_typeof(activity->'referenceId')='string' and char_length(activity->>'referenceId') between 1 and 512
    and app_private.finance_check_numbers(activity),false)),
  primary key(family_id,sequence),unique(family_id,event_id),
  foreign key(family_id,sequence) references app_private.finance_events(family_id,sequence),
  foreign key(child_id,family_id) references app_private.children(id,family_id)
);
create index finance_activity_child on app_private.finance_activity(family_id,child_id,sequence);
create index finance_activity_visible_export on app_private.finance_activity(family_id,child_id,sequence)
  where kind not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');
create index finance_events_visible_export on app_private.finance_events(family_id,child_id,sequence) include(event_id)
  where payload->>'kind' not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');
create index finance_commands_actor_export on app_private.finance_commands(actor_id,family_id);
create table app_private.finance_projection_snapshots (
  family_id uuid not null,child_id uuid not null,last_sequence integer not null,
  child_projection jsonb not null,parent_projection jsonb not null,
  child_projection_hash text not null check(child_projection_hash ~ '^[a-f0-9]{64}$'),
  parent_projection_hash text not null check(parent_projection_hash ~ '^[a-f0-9]{64}$'),updated_at timestamptz not null default clock_timestamp(),
  primary key(family_id,child_id),foreign key(child_id,family_id) references app_private.children(id,family_id),
  foreign key(family_id,last_sequence) references app_private.finance_events(family_id,sequence),
  check(jsonb_typeof(child_projection)='object' and jsonb_typeof(parent_projection)='object'
    and octet_length(child_projection::text)+octet_length(parent_projection::text)<=67108864)
);
alter table app_private.privacy_lifecycle_jobs add column finance_archive_mode text check(finance_archive_mode in('child','parent'));
alter table app_private.privacy_lifecycle_jobs add column finance_archive_source_hash text;
alter table app_private.privacy_lifecycle_jobs add column finance_archive_server_at timestamptz;

create function app_private.finance_export_pick(p_value jsonb,p_keys text[]) returns jsonb
language sql immutable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_value) where key=any(p_keys)
$$;
create function app_private.finance_export_safe(p_value jsonb,p_depth integer default 0) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare item record;v jsonb;begin
  if p_value is null or p_depth>18 then return false;end if;
  if jsonb_typeof(p_value)='object' then
    for item in select * from jsonb_each(p_value) loop
      if item.key in('events','effects','fingerprint','revision','sequence','sourceHash','state','checkpoint','hash','lots','sourceCents',
        'invalidatedCents','eligibleBaseCents','matchAllocationId','archivedPaidCents','archivedBudget','archivedMatches','journal','reports','checkins')
        or not app_private.finance_export_safe(item.value,p_depth+1) then return false;end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for v in select * from jsonb_array_elements(p_value) loop if not app_private.finance_export_safe(v,p_depth+1) then return false;end if;end loop;
  elsif jsonb_typeof(p_value)='number' then
    if p_value::numeric<>trunc(p_value::numeric) or p_value::numeric not between 0 and 9007199254740991 then return false;end if;
  end if;
  return true;
exception when others then return false;end $$;
create function app_private.finance_export_projection_safe(p_view jsonb,p_child uuid,p_parent boolean) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare k text;begin
  if jsonb_typeof(p_view) is distinct from 'object' or p_view->>'childId' is distinct from p_child::text
    or p_view-array['childId','childName','timezone','plan','occurrences','goals','savingsRules','payouts','balances','payout','activity','matching']<>'{}'::jsonb
    or not app_private.finance_export_safe(p_view) or(not p_parent and(p_view?'matching' or not app_private.privacy_projection_safe(p_view))) then return false;end if;
  foreach k in array array['occurrences','goals','savingsRules','payouts','activity'] loop
    if jsonb_typeof(p_view->k) is distinct from 'array' then return false;end if;
  end loop;
  return jsonb_typeof(p_view->'balances')='object' and jsonb_typeof(p_view->'payout')='object'
    and(not(p_view?'matching') or(p_parent and jsonb_typeof(p_view->'matching')='object'));
exception when others then return false;end $$;
create function app_private.finance_activity_capture(p_family uuid,p_activity jsonb) returns void
language plpgsql volatile security definer set search_path='' as $$
declare e app_private.finance_events;old jsonb;ref text;label text;begin
  if jsonb_typeof(p_activity) is distinct from 'object' or p_activity-array['id','at','label','actorRole','referenceId','amountCents','note']<>'{}'::jsonb
    or not(p_activity?&array['id','at','label','actorRole','referenceId']) or octet_length(p_activity::text)>16384
    or not app_private.finance_export_safe(p_activity) then raise exception 'invalid financial activity capture' using errcode='22023';end if;
  select * into e from app_private.finance_events where family_id=p_family and event_id=p_activity->>'id';
  if not found then raise exception 'activity source is not an accepted event' using errcode='22023';end if;
  label:=case e.payload->>'kind'
    when 'configure_plan' then 'Allowance plan updated' when 'assign_chore' then 'Chore assigned' when 'edit_chore' then 'Future chore updated'
    when 'submit_chore' then 'Chore submitted for review' when 'review_chore' then 'Chore reviewed' when 'close_chore' then 'Chore closed'
    when 'reverse_earning' then 'Earning corrected' when 'create_goal' then 'Savings goal created' when 'edit_goal' then 'Savings goal updated'
    when 'cancel_goal' then 'Savings goal cancelled' when 'allocate' then 'Own earnings earmarked' when 'transfer_goal' then 'Own savings moved between goals'
    when 'release_goal' then 'Own savings released' when 'set_savings_rule' then 'Savings rule updated' when 'mark_held' then 'Parent reports savings held'
    when 'request_payout' then 'Cash-out requested' when 'prepare_payout' then 'Manual payout prepared' when 'cancel_payout' then 'Unpaid payout remainder cancelled'
    when 'report_payment' then 'Parent reported payment — transfer not verified' when 'acknowledge_payment' then 'Child confirmed receipt — transfer not verified'
    when 'reverse_payment' then 'Parent payment report corrected' when 'configure_matching' then 'Prospective matching rule updated'
    when 'reveal_match' then 'Parent contribution revealed' when 'fund_match' then 'Parent reported contribution — transfer not verified'
    when 'reverse_match' then 'Parent match corrected' when 'reconcile_match' then 'Parent reported funding reconciliation — transfer not verified' end;
  ref:=coalesce(e.payload->>'occurrenceId',e.payload->>'goalId',e.payload->>'matchId',e.payload->>'payoutId',e.payload->>'paymentId',e.payload->>'choreId',e.payload->>'fromGoalId',e.child_id::text);
  if p_activity->>'at' is distinct from e.payload->>'at' or p_activity->>'actorRole' is distinct from e.payload->'actor'->>'role'
    or p_activity->>'referenceId' is distinct from ref or jsonb_typeof(p_activity->'label') is distinct from 'string'
    or p_activity->>'label' is distinct from label or label is null
    or(p_activity?'amountCents' and jsonb_typeof(p_activity->'amountCents') is distinct from 'number')
    or(p_activity?'note' and(jsonb_typeof(p_activity->'note') is distinct from 'string' or char_length(p_activity->>'note')>500))
    or coalesce(p_activity->'note','null'::jsonb) is distinct from coalesce(e.payload->'note','null'::jsonb) then
    raise exception 'activity does not bind its accepted event' using errcode='22023';end if;
  select activity into old from app_private.finance_activity where family_id=p_family and sequence=e.sequence;
  if found then
    if old is distinct from p_activity then raise exception 'financial activity is immutable' using errcode='22023';end if;
    return;
  end if;
  insert into app_private.finance_activity(family_id,sequence,child_id,event_id,kind,event_at,actor_role,activity)
    values(p_family,e.sequence,e.child_id,e.event_id,e.payload->>'kind',e.payload->>'at',e.payload->'actor'->>'role',p_activity);
end $$;

-- A bounded, derived cache can be warmed for a pre-capture sibling without inventing
-- another financial command. Existing snapshots, including damaged ones, are never repaired here.
create function api.finance_capture_legacy_snapshot(p_scope jsonb,p_expected_revision bigint,p_expected_state_hash text,
  p_child_projection jsonb,p_parent_projection jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare family uuid:=(p_scope->>'familyId')::uuid;child uuid:=(p_scope->>'childId')::uuid;
  aggregate_row app_private.finance_aggregates;snapshot_row app_private.finance_projection_snapshots;entry record;
  total integer:=0;visible integer:=0;hidden integer:=0;latest integer;begin
  perform app_private.finance_authorize(p_scope);
  perform app_private.finance_verify_source(family);
  select * into aggregate_row from app_private.finance_aggregates where family_id=family;
  if not found or aggregate_row.revision is distinct from p_expected_revision
    or app_private.finance_state_hash(aggregate_row.state) is distinct from p_expected_state_hash then
    return jsonb_build_object('status','conflict');end if;
  select * into snapshot_row from app_private.finance_projection_snapshots where family_id=family and child_id=child;
  if found then
    if snapshot_row.child_projection_hash is distinct from app_private.finance_state_hash(snapshot_row.child_projection)
      or snapshot_row.parent_projection_hash is distinct from app_private.finance_state_hash(snapshot_row.parent_projection)
      or not app_private.finance_export_projection_safe(snapshot_row.child_projection,child,false)
      or not app_private.finance_export_projection_safe(snapshot_row.parent_projection,child,true) then
      raise exception 'financial snapshot unavailable' using errcode='XX001';end if;
    return jsonb_build_object('status','present');
  end if;
  for entry in select e.sequence,e.event_id,e.payload->>'kind' as kind,
    (x.sequence is not null and x.child_id=e.child_id and x.event_id=e.event_id and x.kind=e.payload->>'kind'
      and x.event_at=e.payload->>'at' and x.actor_role=e.payload->'actor'->>'role') as covered
    from(select sequence,event_id,child_id,payload from app_private.finance_events
      where family_id=family and child_id=child order by sequence limit 161) e
    left join app_private.finance_activity x on x.family_id=family and x.sequence=e.sequence order by e.sequence loop
    total:=total+1;latest:=entry.sequence;
    if entry.kind in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match') then hidden:=hidden+1;
    else visible:=visible+1;end if;
    if total>160 or visible>128 or hidden>32 or not coalesce(entry.covered,false) then
      return jsonb_build_object('status','review');end if;
  end loop;
  if total=0 then return jsonb_build_object('status','review');end if;
  if not app_private.finance_export_projection_safe(p_child_projection,child,false)
    or not app_private.finance_export_projection_safe(p_parent_projection,child,true) then
    raise exception 'complete safe financial projection capture required' using errcode='22023';end if;
  insert into app_private.finance_projection_snapshots(family_id,child_id,last_sequence,child_projection,parent_projection,child_projection_hash,parent_projection_hash)
    values(family,child,latest,p_child_projection,p_parent_projection,
      app_private.finance_state_hash(p_child_projection),app_private.finance_state_hash(p_parent_projection));
  return jsonb_build_object('status','captured');
end $$;

alter function api.finance_load(jsonb,uuid,text) set schema app_private;
alter function app_private.finance_load(jsonb,uuid,text) rename to finance_load_archive_core;
revoke all on function app_private.finance_load_archive_core(jsonb,uuid,text) from public,anon,authenticated,service_role;
create function api.finance_load(p_scope jsonb,p_operation_id uuid default null,p_fingerprint text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;family uuid:=(p_scope->>'familyId')::uuid;child uuid:=(p_scope->>'childId')::uuid;begin
  result:=app_private.finance_load_archive_core(p_scope,p_operation_id,p_fingerprint);
  return result||jsonb_build_object('legacyProjectionMissing',
    not exists(select 1 from app_private.finance_projection_snapshots where family_id=family and child_id=child)
    and exists(select 1 from app_private.finance_events where family_id=family and child_id=child));
end $$;

alter function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) set schema app_private;
alter function app_private.finance_commit(jsonb,uuid,text,bigint,jsonb,text) rename to finance_commit_archive_core;
revoke all on function app_private.finance_commit_archive_core(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated,service_role;
create function api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;item jsonb;family uuid:=(p_scope->>'familyId')::uuid;child uuid:=(p_scope->>'childId')::uuid;seq integer;begin
  result:=app_private.finance_commit_archive_core(p_scope,p_operation_id,p_fingerprint,p_expected_revision,
    p_state-array['eventActivity','coveredActivity','childProjection','parentProjection'],p_server_at);
  if result->>'status'<>'committed' then return result;end if;
  -- Legacy SQL fixtures remain valid writes; archive-aware exports require complete capture.
  if not(p_state?|array['eventActivity','coveredActivity','childProjection','parentProjection']) then return result;end if;
  if not(p_state?&array['eventActivity','coveredActivity','childProjection','parentProjection'])
    or jsonb_typeof(p_state->'coveredActivity') is distinct from 'array' or jsonb_array_length(p_state->'coveredActivity')>4096
    or not app_private.finance_export_projection_safe(p_state->'childProjection',child,false)
    or not app_private.finance_export_projection_safe(p_state->'parentProjection',child,true) then
    raise exception 'complete safe financial projection capture required' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_state->'coveredActivity') loop perform app_private.finance_activity_capture(family,item);end loop;
  if p_state->'eventActivity'->>'id' is distinct from p_state->'event'->>'id' then
    raise exception 'current financial activity required' using errcode='22023';end if;
  perform app_private.finance_activity_capture(family,p_state->'eventActivity');
  select event_sequence into seq from app_private.finance_commands where family_id=family and actor_id=(p_scope->>'actorId')::uuid and operation_id=p_operation_id;
  if seq is null then raise exception 'financial capture source missing' using errcode='XX001';end if;
  insert into app_private.finance_projection_snapshots(family_id,child_id,last_sequence,child_projection,parent_projection,child_projection_hash,parent_projection_hash)
    values(family,child,seq,p_state->'childProjection',p_state->'parentProjection',
      app_private.finance_state_hash(p_state->'childProjection'),app_private.finance_state_hash(p_state->'parentProjection'))
    on conflict(family_id,child_id) do update set last_sequence=excluded.last_sequence,child_projection=excluded.child_projection,
      parent_projection=excluded.parent_projection,child_projection_hash=excluded.child_projection_hash,parent_projection_hash=excluded.parent_projection_hash,updated_at=clock_timestamp();
  return result;
end $$;

create function app_private.finance_export_legacy(p_subject uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare families uuid[];begin
  select coalesce(array_agg(distinct family_id),'{}'::uuid[]) into families from(
    select family_id from app_private.memberships where user_id=p_subject
    union select family_id from app_private.children where account_user_id=p_subject
    union select family_id from app_private.finance_commands where actor_id=p_subject) scopes;
  return not exists(select 1 from app_private.finance_aggregates where family_id=any(families) and state?'checkpoint')
    and not exists(select 1 from app_private.finance_aggregates where family_id=any(families)
      and(jsonb_typeof(state->'events') is distinct from 'array' or jsonb_array_length(case when jsonb_typeof(state->'events')='array' then state->'events' else '[]'::jsonb end)>1920))
    and not exists(select 1 from app_private.finance_aggregates agg cross join lateral jsonb_array_elements(
      case when jsonb_typeof(agg.state->'events')='array' then agg.state->'events' else '[]'::jsonb end) item
      where agg.family_id=any(families) group by agg.family_id,item->>'childId' having
        count(*) filter(where not coalesce(item->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'),false))>128
        or count(*) filter(where item->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))>32)
    and not exists(select 1 from app_private.finance_checkpoints where family_id=any(families))
    and not exists(select 1 from app_private.finance_archive_capsules where family_id=any(families))
    and not exists(select 1 from app_private.finance_private_match_capsules where family_id=any(families))
    and not exists(select 1 from app_private.finance_events where family_id=any(families) group by family_id,child_id having
      count(*) filter(where payload->>'kind' not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))>128
      or count(*) filter(where payload->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))>32);
end $$;
create function app_private.finance_export_payout(p_value jsonb) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare paid numeric;remaining numeric;payments jsonb;status text;begin
  select coalesce(sum((v->>'amountCents')::numeric) filter(where not(v->>'reversed')::boolean),0),
    coalesce(jsonb_agg(app_private.finance_export_pick(v,array['id','amountCents','method','paidAt','note','childAcknowledged','reversed']) order by ord),'[]')
    into paid,payments from jsonb_array_elements(p_value->'payments') with ordinality payment_rows(v,ord);
  select coalesce(sum((v->>'cents')::numeric),0) into remaining from jsonb_array_elements(p_value->'lots') v;
  status:=case when(p_value->>'cancelled')::boolean then 'cancelled' when paid>0 and remaining>0 then 'partially_paid'
    when paid>0 then 'parent_reported_paid' when remaining=0 then 'corrected' when(p_value->>'prepared')::boolean then 'prepared' else 'requested' end;
  return jsonb_build_object('id',p_value->>'id','createdAt',p_value->>'createdAt','amountCents',p_value->'amountCents',
    'remainingCents',remaining,'paidCents',paid,'status',status,'payments',payments);
end $$;
create function app_private.finance_export_visible_capsule(p_payload jsonb) returns jsonb
language sql immutable security definer set search_path='' as $$
  select jsonb_build_object('occurrences',coalesce((select jsonb_agg(app_private.finance_export_pick(o,array['id','choreId','title','instructions','dueDate','rewardCents','status','note','approvedAt','reversed','recurrence','evidenceRequired'])) from jsonb_array_elements(p_payload->'occurrences') o),'[]'),
    'payouts',coalesce((select jsonb_agg(app_private.finance_export_payout(p)) from jsonb_array_elements(p_payload->'payouts') p),'[]'))
$$;
create function app_private.finance_export_static(p_projection jsonb,p_parent boolean) returns jsonb
language plpgsql immutable security definer set search_path='' as $$
declare result jsonb:=p_projection;begin
  if result?'payout' then result:=jsonb_set(result,'{payout}',(result->'payout')-array['due','eligibleCents','periodKey']);end if;
  if p_parent and result?'matching' then
    result:=jsonb_set(result,'{matching}',(result->'matching')-array['month','usedCents','remainingCents','parentBudgetRemainingCents']);end if;
  return result;
end $$;

-- Separate static role predicates let the child use visible-only indexes, rather than
-- scanning an arbitrarily long private history before applying a row/byte budget.
create function app_private.finance_export_event_rows(p_family uuid,p_child uuid,p_parent boolean,p_limit integer)
returns table(sequence integer,event_id text,child_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit not between 1 and 131073 then raise exception 'invalid export source bound' using errcode='22023';end if;
  if p_parent then return query select e.sequence,e.event_id,e.child_id from app_private.finance_events e
    where e.family_id=p_family and e.child_id=p_child order by e.sequence limit p_limit;
  else return query select e.sequence,e.event_id,e.child_id from app_private.finance_events e
    where e.family_id=p_family and e.child_id=p_child and e.payload->>'kind' not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')
    order by e.sequence limit p_limit;end if;
end $$;
create function app_private.finance_export_current_state(p_family uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;roster jsonb;extra jsonb;begin
  select state into result from app_private.finance_aggregates where family_id=p_family;
  if not found then return null;end if;
  roster:=coalesce(result->'children','[]');
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.id),'[]') into extra
    from app_private.children c where c.family_id=p_family and c.state<>'closed'
      and not exists(select 1 from jsonb_array_elements(roster) old_child where old_child->>'id'=c.id::text);
  return jsonb_set(result,'{children}',roster||extra);
end $$;

-- A source bundle contains only logical projected financial data. Physical capsule IDs,
-- private state hashes, global sequences and temporal counters never enter a child stamp.
create function app_private.finance_export_scope(p_family uuid,p_child uuid,p_parent boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s app_private.finance_projection_snapshots;a app_private.finance_aggregates;cap record;entry record;projected jsonb;
  view jsonb;occurrences jsonb;payouts jsonb;activity jsonb;matching jsonb;counted bigint:=0;raw bigint:=0;ceiling integer;
  latest integer;child_name text;zone text;source_sql text;activity_count integer:=0;begin
  ceiling:=case when p_parent then 8388608 else 1048576 end;
  select * into a from app_private.finance_aggregates where family_id=p_family;
  if found then perform app_private.finance_verify_source(p_family);end if;
  select max(sequence) into latest from app_private.finance_events where family_id=p_family and child_id=p_child;
  select * into s from app_private.finance_projection_snapshots where family_id=p_family and child_id=p_child;
  if latest is not null and(not found or s.last_sequence<>latest) then
    raise exception 'financial projection capture requires review' using errcode='55000';end if;
  if latest is null then
    select c.name,f.timezone into child_name,zone from app_private.children c join app_private.families f on f.id=c.family_id where c.id=p_child and c.family_id=p_family;
    if not found then raise exception 'financial scope unavailable' using errcode='42501';end if;
    view:=jsonb_build_object('childId',p_child,'childName',child_name,'timezone',zone,'occurrences','[]'::jsonb,'goals','[]'::jsonb,'savingsRules','[]'::jsonb,
      'payouts','[]'::jsonb,'activity','[]'::jsonb,'balances',jsonb_build_object('plannedCents',0,'pendingCents',0,'earnedCents',0,'availableCents',0,
        'earmarkedCents',0,'heldPayoutCents',0,'paidCents',0,'unpaidCents',0,'correctionDueCents',0),
      'payout',jsonb_build_object('due',false,'eligibleCents',0,'periodKey','','label','Manual execution only; schedules are payment reminders.'));
    if p_parent then view:=view||jsonb_build_object('matching',jsonb_build_object('rule',jsonb_build_object('enabled',false,'percent',100,'monthlyCapCents',2000,'parentBudgetCents',2000,'surprise',true),
      'commitments','[]'::jsonb,'month',to_char(clock_timestamp() at time zone zone,'YYYY-MM'),'usedCents',0,'remainingCents',2000,'parentBudgetRemainingCents',2000));end if;
  else
    view:=case when p_parent then s.parent_projection else s.child_projection end;
    if(case when p_parent then s.parent_projection_hash else s.child_projection_hash end) is distinct from app_private.finance_state_hash(view) then
      raise exception 'financial snapshot unavailable' using errcode='XX001';end if;
  end if;
  if not app_private.finance_export_projection_safe(view,p_child,p_parent) then raise exception 'unsafe financial snapshot' using errcode='XX001';end if;
  -- Coverage and bounds filter hidden kinds BEFORE evaluating child counts/bytes.
  -- A direct cursor stops as soon as the projected byte budget is exhausted. A payload
  -- SRF would materialize its whole row limit before the caller could stop reading.
  source_sql:=$q$select x.activity,(e.event_id=x.event_id and e.child_id=x.child_id) as valid from app_private.finance_activity x
    join app_private.finance_events e on e.family_id=x.family_id and e.sequence=x.sequence where x.family_id=$1 and x.child_id=$2$q$
    ||case when p_parent then '' else $q$ and x.kind not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')$q$ end
    ||' order by x.sequence limit $3';
  for entry in execute source_sql using p_family,p_child,ceiling/64+1 loop
    if not entry.valid then raise exception 'financial activity binding unavailable' using errcode='XX001';end if;
    activity_count:=activity_count+1;
    counted:=counted+octet_length(entry.activity::text)+1;if counted>ceiling then raise exception 'export capacity review required' using errcode='54000';end if;
  end loop;
  if exists(select 1 from app_private.finance_export_event_rows(p_family,p_child,p_parent,activity_count+1) e
    left join app_private.finance_activity x on x.family_id=p_family and x.sequence=e.sequence
    where x.sequence is null or x.event_id<>e.event_id or x.child_id<>e.child_id
      or(not p_parent and x.kind in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))) then
    raise exception 'financial activity coverage requires review' using errcode='55000';end if;
  for cap in select c.payload,c.hash from app_private.finance_archive_capsules c join app_private.finance_archive_residency r on r.capsule_id=c.id and r.active
    where r.family_id=p_family and r.child_id=p_child and c.family_id=p_family and c.child_id=p_child order by c.id loop
    raw:=raw+octet_length(cap.payload::text);if raw>67108864 then raise exception 'export source capacity review required' using errcode='54000';end if;
    if cap.hash is distinct from app_private.finance_state_hash(cap.payload) or cap.payload->>'childId' is distinct from p_child::text then
      raise exception 'financial archive unavailable' using errcode='XX001';end if;
    projected:=app_private.finance_export_visible_capsule(cap.payload);counted:=counted+octet_length(projected::text);
    if counted>ceiling then raise exception 'export capacity review required' using errcode='54000';end if;
  end loop;
  select coalesce(jsonb_agg(o order by o->>'id' collate "C"),'[]') into occurrences from(
    select o from jsonb_array_elements(view->'occurrences') o union all
    select o from app_private.finance_archive_capsules c join app_private.finance_archive_residency r on r.capsule_id=c.id and r.active
      cross join lateral jsonb_array_elements(app_private.finance_export_visible_capsule(c.payload)->'occurrences') o where r.family_id=p_family and r.child_id=p_child and c.family_id=p_family and c.child_id=p_child) all_occurrences;
  select coalesce(jsonb_agg(p order by p->>'id' collate "C"),'[]') into payouts from(
    select p from jsonb_array_elements(view->'payouts') p union all
    select p from app_private.finance_archive_capsules c join app_private.finance_archive_residency r on r.capsule_id=c.id and r.active
      cross join lateral jsonb_array_elements(app_private.finance_export_visible_capsule(c.payload)->'payouts') p where r.family_id=p_family and r.child_id=p_child and c.family_id=p_family and c.child_id=p_child) all_payouts;
  if jsonb_array_length(occurrences)<>(select count(distinct o->>'id') from jsonb_array_elements(occurrences) o)
    or jsonb_array_length(payouts)<>(select count(distinct p->>'id') from jsonb_array_elements(payouts) p) then raise exception 'duplicate financial archive entity' using errcode='XX001';end if;
  if p_parent then select coalesce(jsonb_agg(x.activity order by x.sequence),'[]') into activity from app_private.finance_activity x
    where x.family_id=p_family and x.child_id=p_child;
  else select coalesce(jsonb_agg(x.activity order by x.sequence),'[]') into activity from app_private.finance_activity x
    where x.family_id=p_family and x.child_id=p_child and x.kind not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');end if;
  matching:='[]';
  if p_parent then
    for cap in select c.payload,c.hash from app_private.finance_private_match_capsules c join app_private.finance_private_match_residency r on r.capsule_id=c.id and r.active
      where r.family_id=p_family and r.child_id=p_child and c.family_id=p_family and c.child_id=p_child order by c.id loop
      if cap.hash is distinct from app_private.finance_state_hash(cap.payload) or not app_private.finance_private_capsule_safe(cap.payload,p_child) then
        raise exception 'private financial archive unavailable' using errcode='XX001';end if;
      projected:=(cap.payload->'match')-array['sourceCents','invalidatedCents','eligibleBaseCents'];counted:=counted+octet_length(projected::text)+1;
      if counted>ceiling then raise exception 'export capacity review required' using errcode='54000';end if;
    end loop;
    select coalesce(jsonb_agg(m order by m->>'id' collate "C"),'[]') into matching from(
      select m from jsonb_array_elements(coalesce(view->'matching'->'commitments','[]')) m union all
      select (c.payload->'match')-array['sourceCents','invalidatedCents','eligibleBaseCents'] m from app_private.finance_private_match_capsules c
        join app_private.finance_private_match_residency r on r.capsule_id=c.id and r.active where r.family_id=p_family and r.child_id=p_child and c.family_id=p_family and c.child_id=p_child) matches;
    if jsonb_array_length(matching)<>(select count(distinct m->>'id') from jsonb_array_elements(matching) m) then raise exception 'duplicate private archive entity' using errcode='XX001';end if;
  end if;
  projected:=jsonb_set(jsonb_set(jsonb_set(view,'{occurrences}',occurrences),'{payouts}',payouts),'{activity}',activity);
  if p_parent and projected?'matching' then projected:=jsonb_set(projected,'{matching,commitments}',matching);end if;
  if octet_length(projected::text)>ceiling or not app_private.finance_export_projection_safe(projected,p_child,p_parent) then
    raise exception 'export capacity review required' using errcode='54000';end if;
  return jsonb_build_object('familyId',p_family,'childId',p_child,'projection',view,
    'archivedOccurrences',(select coalesce(jsonb_agg(o order by o->>'id' collate "C"),'[]') from jsonb_array_elements(occurrences) o where not exists(select 1 from jsonb_array_elements(view->'occurrences') h where h->>'id'=o->>'id')),
    'archivedPayouts',(select coalesce(jsonb_agg(p order by p->>'id' collate "C"),'[]') from jsonb_array_elements(payouts) p where not exists(select 1 from jsonb_array_elements(view->'payouts') h where h->>'id'=p->>'id')),
    'activity',activity,'archivedMatching',case when p_parent then(select coalesce(jsonb_agg(m order by m->>'id' collate "C"),'[]') from jsonb_array_elements(matching) m
      where not exists(select 1 from jsonb_array_elements(coalesce(view->'matching'->'commitments','[]')) h where h->>'id'=m->>'id')) else '[]'::jsonb end,
    'logicalProjection',app_private.finance_export_static(projected,p_parent));
end $$;

create function app_private.finance_export_child_lock(p_job uuid,p_operator uuid) returns app_private.privacy_lifecycle_jobs
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job;
  if not found or j.requester_id<>j.subject_id then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.assert_live_session(j.requester_id,j.requested_session);
  perform app_private.privacy_lock_families(j.subject_id);
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job for update;
  if not found or j.kind<>'export' or j.requester_id<>j.subject_id or j.review_operator is distinct from p_operator
    or not app_private.privacy_operator(p_operator,j.requester_id,j.subject_id) or j.status not in('partial_ready','ready')
    or not coalesce(j.artifact_expires_at>clock_timestamp(),false) or not app_private.privacy_policy_allows(j.subject_id)
    or not exists(select 1 from auth.users u join app_private.profiles p on p.user_id=u.id where u.id=j.subject_id and u.deleted_at is null
      and(u.banned_until is null or u.banned_until<=clock_timestamp()) and p.kind='child' and p.state in('active','closed')
      and(u.email_confirmed_at is not null or p.auth_alias))
    or not exists(select 1 from app_private.privacy_reauthentication r where r.id=j.reauth_id and r.user_id=j.requester_id
      and r.session_id=j.requested_session and r.expires_at>clock_timestamp()) then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.assert_live_session(j.requester_id,j.requested_session);
  return j;
end $$;
create function app_private.finance_export_review(p_job uuid,p_capacity boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  update app_private.privacy_lifecycle_jobs set status='blocked',public_blockers=array[case when p_capacity then 'export_capacity_review_required' else 'financial_source_review_required' end]
    where id=p_job;
  return jsonb_build_object('id',p_job,'status','blocked','completed',false,'journalIncluded',false);
end $$;
create function app_private.finance_export_parent_bundle(p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare family_row record;child_row record;scope jsonb;scopes jsonb:='[]';logical jsonb:='[]';families jsonb:='[]';review boolean;begin
  if(select count(*) from app_private.finance_aggregates agg where app_private.is_guardian(agg.family_id,p_subject))>4 then
    raise exception 'export capacity review required' using errcode='54000';end if;
  for family_row in select agg.family_id from app_private.finance_aggregates agg where app_private.is_guardian(agg.family_id,p_subject) order by agg.family_id loop
    perform app_private.finance_verify_source(family_row.family_id);
    families:=families||jsonb_build_array(jsonb_build_object('familyId',family_row.family_id,'state',app_private.finance_export_current_state(family_row.family_id)));
    if octet_length(families::text)>67108864 then raise exception 'export source capacity review required' using errcode='54000';end if;
    for child_row in select id from app_private.children where family_id=family_row.family_id and state<>'closed' order by id loop
      scope:=app_private.finance_export_scope(family_row.family_id,child_row.id,true);
      scopes:=scopes||jsonb_build_array(scope-'logicalProjection');
      logical:=logical||jsonb_build_array(jsonb_build_object('familyId',family_row.family_id,'childId',child_row.id,'projection',scope->'logicalProjection'));
      if octet_length(logical::text)>8388608 then raise exception 'export capacity review required' using errcode='54000';end if;
    end loop;
  end loop;
  select exists(select 1 from app_private.memberships m join app_private.finance_aggregates a on a.family_id=m.family_id
    where m.user_id=p_subject and m.role='guardian' and not app_private.is_guardian(m.family_id,p_subject))
    or exists(select 1 from app_private.finance_commands where actor_id=p_subject and not app_private.is_guardian(family_id,p_subject))
    or exists(select 1 from app_private.finance_aggregates a cross join lateral jsonb_array_elements(coalesce(a.state->'children','[]')) roster
      where app_private.is_guardian(a.family_id,p_subject) and not exists(select 1 from app_private.children c where c.family_id=a.family_id and c.state<>'closed' and c.id::text=roster->>'id')) into review;
  return jsonb_build_object('scopes',scopes,'families',families,'logical',logical,'reviewRequired',review);
end $$;

-- Preserve the exact bounded legacy implementations and keep their execution private.
alter function api.privacy_finance_sources(uuid,uuid) set schema app_private;
alter function app_private.privacy_finance_sources(uuid,uuid) rename to privacy_finance_sources_legacy;
alter function api.attach_privacy_finance_projection(uuid,uuid,text,jsonb) set schema app_private;
alter function app_private.attach_privacy_finance_projection(uuid,uuid,text,jsonb) rename to attach_privacy_finance_projection_legacy;
alter function api.privacy_parent_finance_sources(uuid,uuid) set schema app_private;
alter function app_private.privacy_parent_finance_sources(uuid,uuid) rename to privacy_parent_finance_sources_legacy;
alter function api.attach_privacy_parent_finance_projections(uuid,uuid,text,jsonb) set schema app_private;
alter function app_private.attach_privacy_parent_finance_projections(uuid,uuid,text,jsonb) rename to attach_privacy_parent_finance_projections_legacy;

-- Avoid the old parent trigger materializing a raw full-family bundle for captured exports.
-- The legacy branch below intentionally retains its prior behavior and capacity decisions.
create or replace function app_private.parent_finance_export_job() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare bundle jsonb;scopes jsonb;review boolean;begin
  if new.kind='export' and new.subject_id=new.requester_id and new.artifact is not null and not new.parent_finance_initialized
    and exists(select 1 from app_private.profiles where user_id=new.subject_id and kind='parent') then
    new.parent_finance_initialized:=true;new.artifact:=jsonb_set(new.artifact,'{finance}','[]');
    if app_private.finance_export_legacy(new.subject_id) then
      begin bundle:=app_private.privacy_parent_bundle(new.subject_id);
      exception when sqlstate '54000' then
        new.status:='blocked';new.public_blockers:=array['export_capacity_review_required'];
        new.internal_blockers:=array_append(new.internal_blockers,'parent_finance_capacity_review');return new;
      end;
      scopes:=bundle->'scopes';review:=(bundle->>'reviewRequired')::boolean;
    else
      select coalesce(jsonb_agg(jsonb_build_object('familyId',a.family_id,'childId',c.id) order by a.family_id,c.id),'[]') into scopes
        from app_private.finance_aggregates a join app_private.children c on c.family_id=a.family_id and c.state<>'closed' where app_private.is_guardian(a.family_id,new.subject_id);
      select exists(select 1 from app_private.finance_commands where actor_id=new.subject_id and not app_private.is_guardian(family_id,new.subject_id))
        or exists(select 1 from app_private.memberships m join app_private.finance_aggregates a on a.family_id=m.family_id
          where m.user_id=new.subject_id and m.role='guardian' and not app_private.is_guardian(m.family_id,new.subject_id))
        or exists(select 1 from app_private.finance_aggregates a cross join lateral jsonb_array_elements(coalesce(a.state->'children','[]')) roster
          where app_private.is_guardian(a.family_id,new.subject_id) and not exists(select 1 from app_private.children c where c.family_id=a.family_id and c.state<>'closed' and c.id::text=roster->>'id')) into review;
    end if;
    new.finance_manifest:=scopes;
    if jsonb_array_length(scopes)>0 or review then
      new.status:='partial_ready';new.public_blockers:='{}';
      if jsonb_array_length(scopes)>0 then new.public_blockers:=array_append(new.public_blockers,'parent_finance_projection_pending');end if;
      if review then new.public_blockers:=array_append(new.public_blockers,'financial_scope_review_required');end if;
      new.stages:=array_append(new.stages,'parent_finance_scope_manifest_prepared');
    end if;
  end if;
  return new;
end $$;

create function api.privacy_finance_sources(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;c app_private.children;bundle jsonb;hash text;at timestamptz;state jsonb;begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  if app_private.finance_export_legacy(j.subject_id) then return app_private.privacy_finance_sources_legacy(p_job_id,p_operator_id);end if;
  j:=app_private.finance_export_child_lock(p_job_id,p_operator_id);
  if j.status='ready' then return jsonb_build_object('id',j.id,'status','ready','completed',true);end if;
  select * into c from app_private.children where account_user_id=j.subject_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  begin bundle:=app_private.finance_export_scope(c.family_id,c.id,false);
  exception when sqlstate '54000' then return app_private.finance_export_review(j.id,true);
    when sqlstate '55000' or sqlstate 'XX001' then return app_private.finance_export_review(j.id,false);end;
  hash:=app_private.finance_state_hash(jsonb_build_object('familyId',c.family_id,'childId',c.id,'projection',bundle->'logicalProjection'));
  at:=case when j.finance_archive_mode='child' and j.finance_archive_source_hash=hash and j.finance_archive_server_at is not null
    then j.finance_archive_server_at else clock_timestamp() end;
  state:=app_private.finance_export_current_state(c.family_id);
  update app_private.privacy_lifecycle_jobs set finance_archive_mode='child',finance_archive_source_hash=hash,finance_archive_server_at=at,
    finance_manifest=jsonb_build_array(jsonb_build_object('familyId',c.family_id,'childId',c.id,'sourceHash',hash)) where id=j.id;
  return(bundle-array['logicalProjection','archivedMatching'])||jsonb_build_object('id',j.id,'status','partial_ready','actor',jsonb_build_object('role','child','childId',c.id),
    'state',state,'sourceHash',hash,'serverAt',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;
create function api.attach_privacy_finance_projection(p_job_id uuid,p_operator_id uuid,p_source_hash text,p_projection jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;c app_private.children;bundle jsonb;hash text;candidate jsonb;begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  if j.finance_archive_mode is null and app_private.finance_export_legacy(j.subject_id) then
    return app_private.attach_privacy_finance_projection_legacy(p_job_id,p_operator_id,p_source_hash,p_projection);end if;
  j:=app_private.finance_export_child_lock(p_job_id,p_operator_id);
  if j.finance_archive_mode is distinct from 'child' then return app_private.finance_export_review(j.id,false);end if;
  select * into c from app_private.children where account_user_id=j.subject_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  begin bundle:=app_private.finance_export_scope(c.family_id,c.id,false);
  exception when sqlstate '54000' then return app_private.finance_export_review(j.id,true);
    when sqlstate '55000' or sqlstate 'XX001' then return app_private.finance_export_review(j.id,false);end;
  hash:=app_private.finance_state_hash(jsonb_build_object('familyId',c.family_id,'childId',c.id,'projection',bundle->'logicalProjection'));
  if p_source_hash is distinct from hash or j.finance_archive_source_hash is distinct from hash then return jsonb_build_object('status','conflict');end if;
  if not app_private.finance_export_projection_safe(p_projection,c.id,false)
    or app_private.finance_export_static(p_projection,false) is distinct from bundle->'logicalProjection' then
    raise exception 'unsafe or incomplete child finance projection' using errcode='22023';end if;
  if j.status='ready' then
    if j.artifact->'finance' is not distinct from jsonb_build_array(p_projection) then return jsonb_build_object('id',j.id,'status','ready','completed',true,'journalIncluded',false);end if;
    raise exception 'idempotency conflict' using errcode='22023';end if;
  candidate:=jsonb_set(j.artifact,'{finance}',jsonb_build_array(p_projection));
  if octet_length(candidate::text)>1048576 then return app_private.finance_export_review(j.id,true);end if;
  update app_private.privacy_lifecycle_jobs set artifact=candidate,status='ready',public_blockers='{}',
    stages=array_append(stages,'own_child_finance_projection_attached') where id=j.id;
  return jsonb_build_object('id',j.id,'status','ready','completed',true,'journalIncluded',false);
end $$;
create function api.privacy_parent_finance_sources(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;bundle jsonb;hash text;at timestamptz;manifest jsonb;begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  if app_private.finance_export_legacy(j.subject_id) then return app_private.privacy_parent_finance_sources_legacy(p_job_id,p_operator_id);end if;
  j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  if j.status not in('partial_ready','ready') then raise exception 'export execution required' using errcode='42501';end if;
  if j.status='ready' then return jsonb_build_object('id',j.id,'status','ready','completed',true);end if;
  begin bundle:=app_private.finance_export_parent_bundle(j.subject_id);
  exception when sqlstate '54000' then return app_private.finance_export_review(j.id,true);
    when sqlstate '55000' or sqlstate 'XX001' then return app_private.finance_export_review(j.id,false);end;
  hash:=app_private.finance_state_hash(bundle->'logical');
  at:=case when j.finance_archive_mode='parent' and j.finance_archive_source_hash=hash and j.finance_archive_server_at is not null
    then j.finance_archive_server_at else clock_timestamp() end;
  select coalesce(jsonb_agg(jsonb_build_object('familyId',s->'familyId','childId',s->'childId') order by s->>'familyId',s->>'childId'),'[]') into manifest from jsonb_array_elements(bundle->'scopes') s;
  update app_private.privacy_lifecycle_jobs set finance_archive_mode='parent',finance_archive_source_hash=hash,finance_archive_server_at=at,
    finance_manifest=manifest,parent_finance_source_hash=hash,parent_finance_server_at=at where id=j.id;
  return(bundle-'logical')||jsonb_build_object('id',j.id,'status','partial_ready','actor',jsonb_build_object('role','parent'),
    'sourceHash',hash,'serverAt',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;
create function api.attach_privacy_parent_finance_projections(p_job_id uuid,p_operator_id uuid,p_source_hash text,p_projections jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j app_private.privacy_lifecycle_jobs;bundle jsonb;hash text;item jsonb;scope jsonb;candidate jsonb;final_status text;blockers text[]:='{}';begin
  select * into j from app_private.privacy_lifecycle_jobs where id=p_job_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  if j.finance_archive_mode is null and app_private.finance_export_legacy(j.subject_id) then
    return app_private.attach_privacy_parent_finance_projections_legacy(p_job_id,p_operator_id,p_source_hash,p_projections);end if;
  j:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  if j.status not in('partial_ready','ready') then raise exception 'export execution required' using errcode='42501';end if;
  if j.finance_archive_mode is distinct from 'parent' then return app_private.finance_export_review(j.id,false);end if;
  begin bundle:=app_private.finance_export_parent_bundle(j.subject_id);
  exception when sqlstate '54000' then return app_private.finance_export_review(j.id,true);
    when sqlstate '55000' or sqlstate 'XX001' then return app_private.finance_export_review(j.id,false);end;
  hash:=app_private.finance_state_hash(bundle->'logical');
  if hash is distinct from p_source_hash or hash is distinct from j.finance_archive_source_hash then return jsonb_build_object('status','conflict');end if;
  if jsonb_typeof(p_projections) is distinct from 'array' or jsonb_array_length(p_projections)<>jsonb_array_length(bundle->'scopes') then
    raise exception 'all authorized finance scopes required' using errcode='22023';end if;
  for item in select * from jsonb_array_elements(p_projections) loop
    if jsonb_typeof(item) is distinct from 'object' or item-array['familyId','childId','view']<>'{}'::jsonb
      or(select count(*) from jsonb_array_elements(p_projections) duplicate where duplicate->>'familyId'=item->>'familyId' and duplicate->>'childId'=item->>'childId')<>1 then
      raise exception 'unsafe parent finance scope' using errcode='22023';end if;
    select s into scope from jsonb_array_elements(bundle->'scopes') s where s->>'familyId'=item->>'familyId' and s->>'childId'=item->>'childId';
    if not found or not app_private.finance_export_projection_safe(item->'view',(scope->>'childId')::uuid,true)
      or app_private.finance_export_static(item->'view',true) is distinct from(
        select l->'projection' from jsonb_array_elements(bundle->'logical') l where l->>'familyId'=scope->>'familyId' and l->>'childId'=scope->>'childId') then
      raise exception 'unsafe or incomplete parent finance projection' using errcode='22023';end if;
  end loop;
  if j.status='ready' then
    if j.artifact->'finance' is not distinct from p_projections then return jsonb_build_object('id',j.id,'status','ready','completed',true,'journalIncluded',false);end if;
    raise exception 'idempotency conflict' using errcode='22023';end if;
  candidate:=jsonb_set(jsonb_set(j.artifact,'{finance}',p_projections),'{checkins}',app_private.checkin_own_export(j.subject_id));
  if octet_length(candidate::text)>8388608 then return app_private.finance_export_review(j.id,true);end if;
  if(bundle->>'reviewRequired')::boolean then blockers:=array['financial_scope_review_required'];end if;
  final_status:=case when cardinality(blockers)=0 then 'ready' else 'partial_ready' end;
  update app_private.privacy_lifecycle_jobs set artifact=candidate,status=final_status,public_blockers=blockers,
    stages=array_append(stages,'own_parent_finance_projections_attached') where id=j.id;
  return jsonb_build_object('id',j.id,'status',final_status,'completed',final_status='ready','journalIncluded',false);
end $$;

-- An artifact made by an older hot-only path must not remain falsely complete after
-- archive introduction. Preserve other own data and the historical job, but require review.
update app_private.privacy_lifecycle_jobs set artifact=jsonb_set(artifact,'{finance}','[]'),status='partial_ready',
  public_blockers=array['financial_source_review_required']
  where kind='export' and status='ready' and artifact is not null and artifact_expires_at>clock_timestamp()
    and finance_archive_mode is null and not app_private.finance_export_legacy(subject_id);

do $$ declare tab text;f record;begin
  foreach tab in array array['finance_activity','finance_projection_snapshots'] loop
    execute format('alter table app_private.%I enable row level security',tab);
    execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',tab);
    execute format('create trigger resource_growth_before_insert before insert on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);
  end loop;
  create trigger immutable_history before update or delete on app_private.finance_activity for each row execute function app_private.finance_immutable();
  create trigger resource_growth_before_update before update on app_private.finance_projection_snapshots for each row execute function app_private.guard_resource_growth();
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('finance_export_pick','finance_export_safe','finance_export_projection_safe','finance_activity_capture',
      'finance_commit_archive_core','finance_load_archive_core','finance_export_legacy','finance_export_payout','finance_export_visible_capsule','finance_export_static','finance_export_scope',
      'finance_export_event_rows','finance_export_current_state',
      'finance_export_child_lock','finance_export_review','finance_export_parent_bundle','privacy_finance_sources_legacy','attach_privacy_finance_projection_legacy',
      'privacy_parent_finance_sources_legacy','attach_privacy_parent_finance_projections_legacy','parent_finance_export_job'))
    or(n.nspname='api' and p.proname in('finance_load','finance_capture_legacy_snapshot','finance_commit','privacy_finance_sources','attach_privacy_finance_projection','privacy_parent_finance_sources','attach_privacy_parent_finance_projections')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
commit;
