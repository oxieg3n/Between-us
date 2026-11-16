begin;
-- Serialize the storage transition without rewriting existing events, commands or aggregate history.
lock table app_private.finance_aggregates,app_private.finance_events,app_private.finance_commands in share row exclusive mode;

create table app_private.finance_checkpoints (
  id uuid primary key default gen_random_uuid(),family_id uuid not null references app_private.families(id),
  through_sequence integer not null check(through_sequence>=0),aggregate_revision bigint not null check(aggregate_revision>0),
  previous_id uuid references app_private.finance_checkpoints(id),
  previous_state_hash text not null check(previous_state_hash ~ '^[a-f0-9]{64}$'),
  state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
  covered_events_hash text not null check(covered_events_hash ~ '^[a-f0-9]{64}$'),covered_count integer not null check(covered_count>=0),
  checkpoint jsonb not null check(jsonb_typeof(checkpoint)='object'),created_at timestamptz not null default clock_timestamp(),
  unique(family_id,aggregate_revision)
);
create table app_private.finance_entity_ids (
  family_id uuid not null,child_id uuid not null,kind text not null check(kind in('chore','goal','occurrence','payout','payment','allocation')),
  entity_id text not null check(char_length(entity_id) between 1 and 250),source_sequence integer not null,
  primary key(family_id,child_id,kind,entity_id),
  foreign key(child_id,family_id) references app_private.children(id,family_id),
  foreign key(family_id,source_sequence) references app_private.finance_events(family_id,sequence)
);
create table app_private.finance_archive_capsules (
  id uuid primary key default gen_random_uuid(),family_id uuid not null,child_id uuid not null,source_sequence integer not null,
  checkpoint_id uuid not null references app_private.finance_checkpoints(id),
  previous_state_hash text not null check(previous_state_hash ~ '^[a-f0-9]{64}$'),
  hash text not null check(hash ~ '^[a-f0-9]{64}$'),payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(child_id,family_id) references app_private.children(id,family_id),
  foreign key(family_id,source_sequence) references app_private.finance_events(family_id,sequence),
  unique(id,family_id,child_id),
  check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576)
);
create table app_private.finance_archive_residency (
  capsule_id uuid primary key,family_id uuid not null,child_id uuid not null,
  active boolean not null default true,hydrated_sequence integer,
  foreign key(capsule_id,family_id,child_id) references app_private.finance_archive_capsules(id,family_id,child_id),
  check((active and hydrated_sequence is null) or(not active and hydrated_sequence is not null))
);
create index finance_archive_active_page on app_private.finance_archive_residency(family_id,child_id,capsule_id) where active;
create table app_private.finance_archive_entity_keys (
  family_id uuid not null,child_id uuid not null,kind text not null check(kind in('occurrence','payout','payment','allocation')),
  entity_id text not null check(char_length(entity_id) between 1 and 250),capsule_id uuid not null references app_private.finance_archive_capsules(id),
  source_sequence integer not null,primary key(family_id,child_id,kind,entity_id,capsule_id),
  foreign key(family_id,child_id,kind,entity_id) references app_private.finance_entity_ids(family_id,child_id,kind,entity_id)
);
create index finance_archive_entity_latest on app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,source_sequence desc);
create index finance_archive_entity_capsule on app_private.finance_archive_entity_keys(capsule_id);
-- A mutable current pointer avoids searching lifetime inactive capsule versions for a correction.
create table app_private.finance_archive_current_entities (
  family_id uuid not null,child_id uuid not null,kind text not null,entity_id text not null,capsule_id uuid not null,
  primary key(family_id,child_id,kind,entity_id),
  foreign key(family_id,child_id,kind,entity_id,capsule_id)
    references app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,capsule_id)
);
create index finance_archive_current_capsule on app_private.finance_archive_current_entities(capsule_id);
create index finance_archive_capsule_page on app_private.finance_archive_capsules(family_id,child_id,id);
create index finance_events_child_sequence on app_private.finance_events(family_id,child_id,sequence);
create table app_private.finance_archived_occurrences (
  family_id uuid not null,child_id uuid not null,occurrence_id text not null,chore_id text not null,due_date date not null,
  reward_cents bigint not null check(reward_cents between 1 and 9007199254740991),
  budget_cents bigint not null check(budget_cents between 0 and 9007199254740991),source_sequence integer not null,
  kind text not null default 'occurrence' check(kind='occurrence'),primary key(family_id,child_id,occurrence_id),
  foreign key(family_id,child_id,kind,occurrence_id) references app_private.finance_entity_ids(family_id,child_id,kind,entity_id),
  foreign key(family_id,source_sequence) references app_private.finance_events(family_id,sequence)
);
create index finance_archived_occurrence_dates on app_private.finance_archived_occurrences(family_id,child_id,due_date);
-- These two tables are derived caches. Reindexing them never removes original occurrence/capsule/event history.
create table app_private.finance_archive_budget_heads (
  family_id uuid not null,child_id uuid not null,period text not null check(period in('weekly','biweekly','monthly')),
  anchor_date date not null,primary key(family_id,child_id),
  foreign key(child_id,family_id) references app_private.children(id,family_id)
);
create table app_private.finance_archive_budget_periods (
  family_id uuid not null,child_id uuid not null,period_key text not null,total_cents bigint not null check(total_cents between 0 and 9007199254740991),
  primary key(family_id,child_id,period_key),foreign key(family_id,child_id) references app_private.finance_archive_budget_heads(family_id,child_id)
);
create index finance_archive_budget_maximum on app_private.finance_archive_budget_periods(family_id,child_id,total_cents desc);

create function app_private.finance_state_hash(p_state jsonb) returns text
language sql immutable security definer set search_path='' as $$
  select encode(extensions.digest(app_private.finance_canonical(p_state),'sha256'),'hex')
$$;
create function app_private.finance_budget_period(p_day date,p_period text,p_anchor date) returns text
language plpgsql immutable security definer set search_path='' as $$
begin
  if p_period='monthly' then return to_char(p_day,'YYYY-MM');end if;
  if p_period not in('weekly','biweekly') or p_day is null or p_anchor is null then raise exception 'invalid budget basis' using errcode='22023';end if;
  return p_anchor::text||'/'||case when p_period='weekly' then '7' else '14' end||'/'||floor((p_day-p_anchor)::numeric/case when p_period='weekly' then 7 else 14 end)::text;
end $$;
create function app_private.finance_register_entity(p_family uuid,p_child uuid,p_kind text,p_id text,p_sequence integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(char_length(p_id),0) not between 1 and 250 then raise exception 'invalid financial entity' using errcode='22023';end if;
  insert into app_private.finance_entity_ids(family_id,child_id,kind,entity_id,source_sequence)
    values(p_family,p_child,p_kind,p_id,p_sequence) on conflict do nothing;
end $$;
create function app_private.finance_register_event(p_family uuid,p_child uuid,p_sequence integer,p_event jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare day text;effect jsonb;
begin
  if p_event->>'kind'='assign_chore' then
    perform app_private.finance_register_entity(p_family,p_child,'chore',p_event->>'choreId',p_sequence);
    for day in select jsonb_array_elements_text(p_event->'dates') loop
      perform app_private.finance_register_entity(p_family,p_child,'occurrence',(p_event->>'choreId')||':'||day,p_sequence);
    end loop;
  elsif p_event->>'kind'='create_goal' then perform app_private.finance_register_entity(p_family,p_child,'goal',p_event->>'goalId',p_sequence);
  elsif p_event->>'kind' in('request_payout','prepare_payout') then perform app_private.finance_register_entity(p_family,p_child,'payout',p_event->>'id',p_sequence);
  elsif p_event->>'kind'='report_payment' then perform app_private.finance_register_entity(p_family,p_child,'payment',p_event->>'id',p_sequence);
  elsif p_event->>'kind'='allocate' then perform app_private.finance_register_entity(p_family,p_child,'allocation',p_event->>'id',p_sequence);end if;
  for effect in select * from jsonb_array_elements(coalesce(p_event->'effects','[]')) loop
    if effect->>'kind'='automatic_allocation' then perform app_private.finance_register_entity(p_family,p_child,'allocation',effect->>'referenceId',p_sequence);end if;
  end loop;
end $$;
do $$ declare event record;begin
  for event in select family_id,child_id,sequence,payload from app_private.finance_events order by family_id,sequence loop
    perform app_private.finance_register_event(event.family_id,event.child_id,event.sequence,event.payload);
  end loop;
end $$;

create function app_private.finance_checkpoint_safe(p_checkpoint jsonb,p_children jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare item record;book jsonb;cache jsonb;field text;child jsonb;
begin
  if jsonb_typeof(p_checkpoint) is distinct from 'object' or p_checkpoint-array['version','lastEventAt','books','activity']<>'{}'::jsonb
    or p_checkpoint->'version' is distinct from '1'::jsonb or jsonb_typeof(p_checkpoint->'books') is distinct from 'object'
    or jsonb_typeof(p_checkpoint->'activity') is distinct from 'object' then return false;end if;
  for item in select * from jsonb_each(p_checkpoint->'books') loop
    if not exists(select 1 from jsonb_array_elements(p_children) c where c->>'id'=item.key) then return false;end if;
    book:=item.value;
    if jsonb_typeof(book) is distinct from 'object' or book-array['plan','occurrences','goals','free','allocations','payouts','matches','savingsRules',
      'matchingRule','earnedCents','correctionDueCents','archivedPaidCents','archivedBudget','archivedMatches']<>'{}'::jsonb then return false;end if;
    foreach field in array array['occurrences','goals','free','allocations','payouts','matches','savingsRules'] loop
      if jsonb_typeof(book->field) is distinct from 'array' then return false;end if;
    end loop;
    foreach field in array array['occurrences','goals','allocations','payouts','matches','savingsRules'] loop
      if jsonb_array_length(book->field)<>(select count(distinct e->>'id') from jsonb_array_elements(book->field) e) then return false;end if;
    end loop;
    if jsonb_array_length(book->'occurrences')>100 or jsonb_array_length(book->'payouts')>32
      or jsonb_array_length(book->'allocations')>512 or jsonb_array_length(book->'free')>512 or jsonb_array_length(book->'matches')>2048
      or jsonb_array_length(book->'goals')>32 or jsonb_array_length(book->'savingsRules')>8
      or exists(select 1 from jsonb_array_elements(book->'payouts') p where jsonb_typeof(p->'payments') is distinct from 'array' or jsonb_array_length(p->'payments')>32)
      or jsonb_typeof(book->'matchingRule') is distinct from 'object' or jsonb_typeof(book->'earnedCents') is distinct from 'number'
      or jsonb_typeof(book->'correctionDueCents') is distinct from 'number' then return false;end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(p_checkpoint->'activity') key where not exists(select 1 from jsonb_array_elements(p_children) c where c->>'id'=key)) then return false;end if;
  for child in select * from jsonb_array_elements(p_children) loop
    if not(p_checkpoint->'books' ? (child->>'id')) or not(p_checkpoint->'activity' ? (child->>'id')) then return false;end if;
    cache:=p_checkpoint->'activity'->(child->>'id');
    if jsonb_typeof(cache) is distinct from 'object' or cache-array['visible','parent']<>'{}'::jsonb
      or jsonb_typeof(cache->'visible') is distinct from 'array' or jsonb_typeof(cache->'parent') is distinct from 'array'
      or jsonb_array_length(cache->'visible')>100 or jsonb_array_length(cache->'parent')>100 then return false;end if;
  end loop;
  return app_private.finance_check_numbers(p_checkpoint);
exception when others then return false;
end $$;

create function app_private.finance_verify_source(p_family uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare a app_private.finance_aggregates;c app_private.finance_checkpoints;boundary integer:=0;last_sequence integer;tail jsonb;begin
  select * into a from app_private.finance_aggregates where family_id=p_family;
  if not found or jsonb_typeof(a.state->'events') is distinct from 'array' then raise exception 'financial data unavailable' using errcode='XX001';end if;
  select * into c from app_private.finance_checkpoints where family_id=p_family order by aggregate_revision desc limit 1;
  if a.state?'checkpoint' then
    if not found or c.checkpoint is distinct from a.state->'checkpoint' or c.state_hash is distinct from app_private.finance_state_hash(c.checkpoint)
      then raise exception 'financial data unavailable' using errcode='XX001';end if;
    boundary:=c.through_sequence;
  elsif found then raise exception 'financial data unavailable' using errcode='XX001';end if;
  select coalesce(max(sequence),0) into last_sequence from app_private.finance_events where family_id=p_family;
  -- Both the legacy cap and checkpoint tail are below this fixed bound. Never replay the full ledger on corruption.
  if last_sequence-boundary not between 0 and 4096 or jsonb_array_length(a.state->'events')<>last_sequence-boundary then
    raise exception 'financial data unavailable' using errcode='XX001';end if;
  select coalesce(jsonb_agg(payload order by sequence),'[]') into tail from app_private.finance_events where family_id=p_family and sequence>boundary;
  if tail is distinct from a.state->'events' then raise exception 'financial data unavailable' using errcode='XX001';end if;
end $$;

create or replace function api.finance_load(p_scope jsonb,p_operation_id uuid default null,p_fingerprint text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare family uuid:=(p_scope->>'familyId')::uuid;actor uuid:=(p_scope->>'actorId')::uuid;child uuid:=(p_scope->>'childId')::uuid;
  aggregate app_private.finance_aggregates;command app_private.finance_commands;at text;through_sequence integer;replay boolean:=false;
begin
  perform app_private.finance_authorize(p_scope);perform app_private.finance_sync(family);
  perform app_private.finance_verify_source(family);
  select * into aggregate from app_private.finance_aggregates where family_id=family;
  select coalesce(max(sequence),0) into through_sequence from app_private.finance_events where family_id=family;
  at:=to_char(greatest(clock_timestamp(),coalesce((aggregate.state->'events'->-1->>'at')::timestamptz,
    (aggregate.state->'checkpoint'->>'lastEventAt')::timestamptz,'epoch'::timestamptz)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation_id is not null then
    if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid fingerprint' using errcode='22023';end if;
    select * into command from app_private.finance_commands where family_id=family and actor_id=actor and operation_id=p_operation_id;
    if found then
      if command.fingerprint<>p_fingerprint or command.child_id<>child then raise exception 'operation identity conflict' using errcode='22023';end if;
      replay:=true;
    end if;
  end if;
  return jsonb_build_object('state',aggregate.state,'revision',aggregate.revision,'serverAt',at,'replay',replay,
    'stateHash',app_private.finance_state_hash(aggregate.state),'throughSequence',through_sequence);
end $$;

create function app_private.finance_budget_basis(p_family uuid,p_child uuid,p_period text,p_anchor text,p_keys text[],p_hot text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare anchor date;head app_private.finance_archive_budget_heads;total integer;periods jsonb;v_excluded jsonb;maximum bigint;
begin
  begin anchor:=p_anchor::date;exception when others then raise exception 'invalid budget basis' using errcode='22023';end;
  if p_period is null or p_period not in('weekly','biweekly','monthly') or p_anchor is distinct from anchor::text or anchor is null
    or p_keys is null or cardinality(p_keys)>256 or array_position(p_keys,null) is not null
    or p_hot is null or cardinality(p_hot)>256 or array_position(p_hot,null) is not null
    or exists(select 1 from unnest(p_keys) k where char_length(k)>80)
    or exists(select 1 from unnest(p_hot) k where char_length(k) not between 1 and 250) then raise exception 'invalid budget basis' using errcode='22023';end if;
  select * into head from app_private.finance_archive_budget_heads where family_id=p_family and child_id=p_child;
  if not found or head.period is distinct from p_period or head.anchor_date is distinct from anchor then
    select count(*) into total from(select 1 from app_private.finance_archived_occurrences where family_id=p_family and child_id=p_child limit 10001) bounded;
    if total>10000 then raise exception 'budget reindex capacity review required' using errcode='54000';end if;
    delete from app_private.finance_archive_budget_periods where family_id=p_family and child_id=p_child;
    insert into app_private.finance_archive_budget_heads(family_id,child_id,period,anchor_date) values(p_family,p_child,p_period,anchor)
      on conflict(family_id,child_id) do update set period=excluded.period,anchor_date=excluded.anchor_date;
    insert into app_private.finance_archive_budget_periods(family_id,child_id,period_key,total_cents)
      select p_family,p_child,app_private.finance_budget_period(due_date,p_period,anchor),sum(budget_cents)::bigint
      from app_private.finance_archived_occurrences where family_id=p_family and child_id=p_child
      group by app_private.finance_budget_period(due_date,p_period,anchor);
  end if;
  select coalesce(jsonb_object_agg(k,coalesce(p.total_cents,0)),'{}') into periods from(select distinct unnest(p_keys) k) keys
    left join app_private.finance_archive_budget_periods p on p.family_id=p_family and p.child_id=p_child and p.period_key=keys.k;
  select coalesce(jsonb_agg(occurrence_id order by occurrence_id),'[]') into v_excluded from app_private.finance_archived_occurrences
    where family_id=p_family and child_id=p_child and occurrence_id=any(p_hot);
  select coalesce((select total_cents from app_private.finance_archive_budget_periods where family_id=p_family and child_id=p_child order by total_cents desc limit 1),0) into maximum;
  return jsonb_build_object('period',p_period,'anchorDate',p_anchor,'maximumCents',maximum,'byPeriod',periods,'excludedOccurrenceIds',v_excluded);
end $$;
create function api.finance_archive_budget(p_scope jsonb,p_period text,p_anchor_date text,p_period_keys text[],p_hot_occurrence_ids text[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a app_private.finance_aggregates;result jsonb;
begin
  perform app_private.finance_authorize(p_scope);perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  select * into a from app_private.finance_aggregates where family_id=(p_scope->>'familyId')::uuid;
  result:=app_private.finance_budget_basis(a.family_id,(p_scope->>'childId')::uuid,p_period,p_anchor_date,p_period_keys,p_hot_occurrence_ids);
  return result||jsonb_build_object('revision',a.revision,'stateHash',app_private.finance_state_hash(a.state));
end $$;
create function api.finance_archive_lookup(p_scope jsonb,p_entity_kind text,p_entity_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a app_private.finance_aggregates;capsule app_private.finance_archive_capsules;current_id uuid;
begin
  perform app_private.finance_authorize(p_scope);perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if p_entity_kind not in('occurrence','payout','payment','allocation') or coalesce(char_length(p_entity_id),0) not between 1 and 250 then
    raise exception 'invalid archive lookup' using errcode='22023';end if;
  select * into a from app_private.finance_aggregates where family_id=(p_scope->>'familyId')::uuid;
  select capsule_id into current_id from app_private.finance_archive_current_entities
    where family_id=a.family_id and child_id=(p_scope->>'childId')::uuid and kind=p_entity_kind and entity_id=p_entity_id;
  if not found then return null;end if;
  select c.* into capsule from app_private.finance_archive_capsules c join app_private.finance_archive_residency r on r.capsule_id=c.id and r.active
    where c.id=current_id and c.family_id=a.family_id and c.child_id=(p_scope->>'childId')::uuid;
  if not found then raise exception 'financial data unavailable' using errcode='XX001';end if;
  if capsule.hash is distinct from app_private.finance_state_hash(capsule.payload) then raise exception 'financial data unavailable' using errcode='XX001';end if;
  return jsonb_build_object('capsule',capsule.payload,'id',capsule.id,'hash',capsule.hash,'revision',a.revision,'stateHash',app_private.finance_state_hash(a.state));
end $$;
create function api.finance_archive_page(p_scope jsonb,p_after_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;more boolean;
begin
  perform app_private.finance_authorize(p_scope);
  perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid archive page' using errcode='22023';end if;
  if p_after_id is not null and not exists(select 1 from app_private.finance_archive_capsules where id=p_after_id
    and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid) then raise exception 'invalid archive page' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'capsule',payload) order by id),'[]') into rows from(
    select c.id,c.payload from(select capsule_id from app_private.finance_archive_residency
      where family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid and active
        and(p_after_id is null or capsule_id>p_after_id) order by capsule_id limit p_limit+1) active_page
      join app_private.finance_archive_capsules c on c.id=active_page.capsule_id) page;
  more:=jsonb_array_length(rows)>p_limit;if more then rows:=rows-(jsonb_array_length(rows)-1);end if;
  if exists(select 1 from jsonb_array_elements(rows) row_data join app_private.finance_archive_capsules c on c.id=(row_data->>'id')::uuid
    where c.hash is distinct from app_private.finance_state_hash(c.payload)) then raise exception 'financial data unavailable' using errcode='XX001';end if;
  if octet_length(rows::text)>8388608 then raise exception 'archive page capacity review required' using errcode='54000';end if;
  return jsonb_build_object('items',rows,'nextAfterId',case when more then rows->-1->>'id' else null end);
end $$;

create function app_private.finance_archive_store(p_family uuid,p_child uuid,p_sequence integer,p_checkpoint uuid,p_previous_hash text,p_capsule jsonb,p_book jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_capsule_id uuid;occurrence jsonb;payout jsonb;payment jsonb;allocation jsonb;source_key text;lot jsonb;paid numeric:=0;cost bigint;
  existing app_private.finance_archived_occurrences;head app_private.finance_archive_budget_heads;key text;inserted integer;
begin
  if jsonb_typeof(p_capsule) is distinct from 'object' or p_capsule-array['version','childId','occurrences','payouts','allocations','paidCents']<>'{}'::jsonb
    or p_capsule->'version' is distinct from '1'::jsonb or p_capsule->>'childId' is distinct from p_child::text
    or jsonb_typeof(p_capsule->'occurrences') is distinct from 'array' or jsonb_typeof(p_capsule->'payouts') is distinct from 'array'
    or jsonb_typeof(p_capsule->'allocations') is distinct from 'array' or jsonb_array_length(p_capsule->'allocations')>512
    or jsonb_array_length(p_capsule->'occurrences')>100 or jsonb_array_length(p_capsule->'payouts')>32
    or jsonb_array_length(p_capsule->'occurrences')+jsonb_array_length(p_capsule->'payouts')=0
    or jsonb_typeof(p_capsule->'paidCents') is distinct from 'number' or not app_private.finance_check_numbers(p_capsule) then
    raise exception 'invalid archive capsule' using errcode='22023';end if;
  if (select count(*) from jsonb_array_elements(p_capsule->'occurrences'))<>(select count(distinct o->>'id') from jsonb_array_elements(p_capsule->'occurrences') o)
    or (select count(*) from jsonb_array_elements(p_capsule->'payouts'))<>(select count(distinct p->>'id') from jsonb_array_elements(p_capsule->'payouts') p) then
    raise exception 'duplicate archive entity' using errcode='22023';end if;
  insert into app_private.finance_archive_capsules(family_id,child_id,source_sequence,checkpoint_id,previous_state_hash,hash,payload)
    values(p_family,p_child,p_sequence,p_checkpoint,p_previous_hash,app_private.finance_state_hash(p_capsule),p_capsule) returning id into v_capsule_id;
  insert into app_private.finance_archive_residency(capsule_id,family_id,child_id) values(v_capsule_id,p_family,p_child);
  for occurrence in select * from jsonb_array_elements(p_capsule->'occurrences') loop
    if occurrence->>'id' is distinct from (occurrence->>'choreId')||':'||(occurrence->>'dueDate')
      or occurrence->>'status' not in('approved','cancelled','expired','declined')
      or not exists(select 1 from app_private.finance_entity_ids where family_id=p_family and child_id=p_child and kind='occurrence' and entity_id=occurrence->>'id')
      or exists(select 1 from jsonb_array_elements(p_book->'occurrences') hot where hot->>'id'=occurrence->>'id') then
      raise exception 'invalid archived occurrence' using errcode='22023';end if;
    -- Outstanding visible source dependencies must remain hot. Private matching is deliberately not consulted.
    if exists(select 1 from jsonb_array_elements(p_book->'free') l where l->>'earningId'=occurrence->>'id' and(l->>'cents')::numeric>0)
      or exists(select 1 from jsonb_array_elements(p_book->'allocations') a cross join lateral jsonb_array_elements(a->'lots') l
        where l->>'earningId'=occurrence->>'id' and(l->>'cents')::numeric>0)
      or exists(select 1 from jsonb_array_elements(p_book->'payouts') p cross join lateral jsonb_array_elements(p->'lots') l
        where l->>'earningId'=occurrence->>'id' and(l->>'cents')::numeric>0)
      or exists(select 1 from jsonb_array_elements(p_book->'payouts') p cross join lateral jsonb_array_elements(p->'payments') pay_record
        cross join lateral jsonb_array_elements(pay_record->'lots') l where l->>'earningId'=occurrence->>'id' and(l->>'cents')::numeric>0) then
      raise exception 'archive source remains hot' using errcode='22023';end if;
    cost:=case when occurrence->>'status'='approved' then(occurrence->>'rewardCents')::bigint else 0 end;
    select * into existing from app_private.finance_archived_occurrences where family_id=p_family and child_id=p_child and occurrence_id=occurrence->>'id';
    if found then
      if existing.chore_id is distinct from occurrence->>'choreId' or existing.due_date::text is distinct from occurrence->>'dueDate'
        or existing.reward_cents is distinct from(occurrence->>'rewardCents')::bigint or existing.budget_cents<>cost then
        raise exception 'archived occurrence identity conflict' using errcode='22023';end if;
    else
      insert into app_private.finance_archived_occurrences(family_id,child_id,occurrence_id,chore_id,due_date,reward_cents,budget_cents,source_sequence)
        values(p_family,p_child,occurrence->>'id',occurrence->>'choreId',(occurrence->>'dueDate')::date,(occurrence->>'rewardCents')::bigint,cost,p_sequence);
      select * into head from app_private.finance_archive_budget_heads where family_id=p_family and child_id=p_child;
      if found then
        key:=app_private.finance_budget_period((occurrence->>'dueDate')::date,head.period,head.anchor_date);
        insert into app_private.finance_archive_budget_periods(family_id,child_id,period_key,total_cents) values(p_family,p_child,key,cost)
          on conflict(family_id,child_id,period_key) do update set total_cents=app_private.finance_archive_budget_periods.total_cents+excluded.total_cents;
      end if;
    end if;
    insert into app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,capsule_id,source_sequence)
      values(p_family,p_child,'occurrence',occurrence->>'id',v_capsule_id,p_sequence);
  end loop;
  for payout in select * from jsonb_array_elements(p_capsule->'payouts') loop
    if not exists(select 1 from app_private.finance_entity_ids where family_id=p_family and child_id=p_child and kind='payout' and entity_id=payout->>'id')
      or exists(select 1 from jsonb_array_elements(p_book->'payouts') hot where hot->>'id'=payout->>'id')
      or jsonb_typeof(payout->'lots') is distinct from 'array' or jsonb_typeof(payout->'payments') is distinct from 'array'
      or jsonb_array_length(payout->'payments')>32 or exists(select 1 from jsonb_array_elements(payout->'lots') l where(l->>'cents')::numeric>0) then
      raise exception 'invalid archived payout' using errcode='22023';end if;
    insert into app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,capsule_id,source_sequence)
      values(p_family,p_child,'payout',payout->>'id',v_capsule_id,p_sequence);
    for payment in select * from jsonb_array_elements(payout->'payments') loop
      if not exists(select 1 from app_private.finance_events e where e.family_id=p_family and e.child_id=p_child and e.event_id=payment->>'id'
        and e.payload->>'kind'='report_payment' and e.payload->>'payoutId'=payout->>'id'
        and e.payload->'amountCents'=payment->'amountCents' and e.payload->>'method'=payment->>'method' and e.payload->>'paidAt'=payment->>'paidAt')
        or jsonb_typeof(payment->'lots') is distinct from 'array' then raise exception 'invalid archived payment' using errcode='22023';end if;
      for lot in select * from jsonb_array_elements(payment->'lots') loop
        if(lot->>'cents')::numeric>0 and not exists(select 1 from jsonb_array_elements(p_capsule->'occurrences') o where o->>'id'=lot->>'earningId') then
          raise exception 'archive component is incomplete' using errcode='22023';end if;
      end loop;
      if payment->'reversed' is distinct from 'true'::jsonb then paid:=paid+(payment->>'amountCents')::numeric;end if;
      insert into app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,capsule_id,source_sequence)
        values(p_family,p_child,'payment',payment->>'id',v_capsule_id,p_sequence);
    end loop;
  end loop;
  for allocation in select * from jsonb_array_elements(p_capsule->'allocations') loop
    if not exists(select 1 from app_private.finance_entity_ids where family_id=p_family and child_id=p_child and kind='allocation' and entity_id=allocation->>'id')
      or exists(select 1 from jsonb_array_elements(p_book->'allocations') hot where hot->>'id'=allocation->>'id')
      or jsonb_typeof(allocation->'lots') is distinct from 'array' or jsonb_typeof(allocation->'sourceCents') is distinct from 'object'
      or exists(select 1 from jsonb_array_elements(allocation->'lots') l where(l->>'cents')::numeric>0) then
      raise exception 'invalid archived allocation' using errcode='22023';end if;
    for source_key in select jsonb_object_keys(allocation->'sourceCents') loop
      if not exists(select 1 from jsonb_array_elements(p_capsule->'occurrences') o where o->>'id'=source_key) then
        raise exception 'archive allocation component is incomplete' using errcode='22023';end if;
    end loop;
    insert into app_private.finance_archive_entity_keys(family_id,child_id,kind,entity_id,capsule_id,source_sequence)
      values(p_family,p_child,'allocation',allocation->>'id',v_capsule_id,p_sequence);
  end loop;
  if paid is distinct from(p_capsule->>'paidCents')::numeric then raise exception 'archive paid basis mismatch' using errcode='22023';end if;
  -- A rearchive may supersede a component only after its prior active capsule was hydrated in this transaction.
  if exists(select 1 from app_private.finance_archive_entity_keys n join app_private.finance_archive_current_entities old
    on old.family_id=n.family_id and old.child_id=n.child_id and old.kind=n.kind and old.entity_id=n.entity_id where n.capsule_id=v_capsule_id) then
    raise exception 'archive component already active' using errcode='22023';end if;
  insert into app_private.finance_archive_current_entities(family_id,child_id,kind,entity_id,capsule_id)
    select family_id,child_id,kind,entity_id,capsule_id from app_private.finance_archive_entity_keys where capsule_id=v_capsule_id;
  return v_capsule_id;
end $$;

create function app_private.finance_preserve_checkpoint_entities(p_old jsonb,p_new jsonb,p_event jsonb,p_capsules jsonb,p_hydrated jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare child jsonb;kind text;field text;entity text;old_book jsonb;new_book jsonb;covered_events jsonb;
begin
  covered_events:=(p_old->'events')||case when jsonb_array_length(p_new->'events')=0 then jsonb_build_array(p_event) else '[]'::jsonb end;
  for child in select * from jsonb_array_elements(p_old->'children') loop
    old_book:=coalesce(p_old->'checkpoint'->'books'->(child->>'id'),'{}');new_book:=p_new->'checkpoint'->'books'->(child->>'id');
    foreach field in array array['occurrences','payouts','goals','allocations'] loop
      kind:=case field when 'occurrences' then 'occurrence' when 'payouts' then 'payout' when 'goals' then 'goal' else 'allocation' end;
      for entity in
        select e->>'id' from jsonb_array_elements(coalesce(old_book->field,'[]')) e
        union select (e->>'choreId')||':'||day from jsonb_array_elements(covered_events) e
          cross join lateral jsonb_array_elements_text(case when e->>'kind'='assign_chore' then e->'dates' else '[]'::jsonb end) day
          where field='occurrences' and e->>'childId'=child->>'id'
        union select e->>'id' from jsonb_array_elements(covered_events) e
          where field='payouts' and e->>'childId'=child->>'id' and e->>'kind' in('request_payout','prepare_payout')
        union select e->>'goalId' from jsonb_array_elements(covered_events) e
          where field='goals' and e->>'childId'=child->>'id' and e->>'kind'='create_goal'
        union select e->>'id' from jsonb_array_elements(covered_events) e
          where field='allocations' and e->>'childId'=child->>'id' and e->>'kind'='allocate'
        union select effect->>'referenceId' from jsonb_array_elements(covered_events) e
          cross join lateral jsonb_array_elements(coalesce(e->'effects','[]')) effect
          where field='allocations' and e->>'childId'=child->>'id' and effect->>'kind'='automatic_allocation'
        union select e->>'id' from jsonb_array_elements(p_hydrated) h join app_private.finance_archive_capsules c on c.id=(h->>'id')::uuid
          cross join lateral jsonb_array_elements(coalesce(c.payload->field,'[]')) e where c.child_id::text=child->>'id'
      loop
        if not exists(select 1 from jsonb_array_elements(new_book->field) e where e->>'id'=entity)
          and not exists(select 1 from jsonb_array_elements(p_capsules) c cross join lateral jsonb_array_elements(coalesce(c->field,'[]')) e
            where c->>'childId'=child->>'id' and e->>'id'=entity) then
          -- Zero original allocation rows can be pruned independently of hidden matching.
          -- Permanent identity and immutable command/event provenance remain retained.
          if field<>'allocations' or exists(
            select 1 from (
              select l from jsonb_array_elements(new_book->'free') l
              union all select l from jsonb_array_elements(new_book->'allocations') a cross join lateral jsonb_array_elements(a->'lots') l
              union all select l from jsonb_array_elements(new_book->'payouts') p cross join lateral jsonb_array_elements(p->'lots') l
              union all select l from jsonb_array_elements(new_book->'payouts') p cross join lateral jsonb_array_elements(p->'payments') payment
                cross join lateral jsonb_array_elements(payment->'lots') l
            ) lots where lots.l->>'matchAllocationId'=entity and(lots.l->>'cents')::numeric>0
          ) then return false;end if;
        end if;
      end loop;
    end loop;
  end loop;
  return true;
end $$;

alter function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) set schema app_private;
alter function app_private.finance_commit(jsonb,uuid,text,bigint,jsonb,text) rename to finance_commit_v1;
revoke all on function app_private.finance_commit_v1(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated,service_role;
create function api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_family uuid:=(p_scope->>'familyId')::uuid;v_actor uuid:=(p_scope->>'actorId')::uuid;v_child uuid:=(p_scope->>'childId')::uuid;
  v_role text;v_aggregate app_private.finance_aggregates;v_command app_private.finance_commands;v_prior app_private.finance_checkpoints;
  v_next jsonb;v_event jsonb;v_capsules jsonb;v_hydrated jsonb;v_capsule jsonb;v_ref jsonb;v_stored app_private.finance_archive_capsules;
  v_envelope boolean;v_roll boolean;v_hidden boolean;v_kind text;v_old_hash text;v_source jsonb;v_all jsonb;v_covered jsonb;
  v_last integer;v_next_sequence integer;v_boundary integer;v_previous_boundary integer:=0;v_tail_count integer;v_checkpoint_id uuid;
  v_last_at text;v_child_record jsonb;v_book jsonb;v_old_paid numeric;v_new_paid numeric;v_add numeric;v_subtract numeric;
  v_result jsonb;v_keys text[];v_hot text[];v_basis jsonb;v_activity jsonb;v_cache_kind text;v_cache_child text;
begin
  v_role:=app_private.finance_authorize(p_scope);perform app_private.finance_sync(v_family);
  perform app_private.finance_verify_source(v_family);
  select * into v_aggregate from app_private.finance_aggregates where family_id=v_family for update;
  if p_operation_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid operation identity' using errcode='22023';end if;
  v_old_hash:=app_private.finance_state_hash(v_aggregate.state);
  select coalesce(max(sequence),0) into v_last from app_private.finance_events where family_id=v_family;
  select * into v_command from app_private.finance_commands where family_id=v_family and actor_id=v_actor and operation_id=p_operation_id;
  if found then
    if v_command.fingerprint<>p_fingerprint or v_command.child_id<>v_child then raise exception 'operation identity conflict' using errcode='22023';end if;
    return jsonb_build_object('status','replayed','state',v_aggregate.state,'serverAt',to_char(greatest(clock_timestamp(),
      coalesce((v_aggregate.state->'events'->-1->>'at')::timestamptz,(v_aggregate.state->'checkpoint'->>'lastEventAt')::timestamptz,'epoch'::timestamptz))
      at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'stateHash',v_old_hash,'throughSequence',v_last);
  end if;
  if p_expected_revision is distinct from v_aggregate.revision then return jsonb_build_object('status','conflict');end if;
  v_envelope:=jsonb_typeof(p_state->'state')='object';
  if not coalesce(v_envelope,false) then
    if v_aggregate.state?'checkpoint' then raise exception 'checkpoint envelope required' using errcode='22023';end if;
    v_event:=p_state->'events'->-1;
    if(v_event->>'kind'='assign_chore' and exists(select 1 from app_private.finance_entity_ids where family_id=v_family and child_id=v_child and kind='chore' and entity_id=v_event->>'choreId'))
      or(v_event->>'kind'='create_goal' and exists(select 1 from app_private.finance_entity_ids where family_id=v_family and child_id=v_child and kind='goal' and entity_id=v_event->>'goalId')) then
      raise exception 'financial entity identity already used' using errcode='22023';end if;
    v_result:=app_private.finance_commit_v1(p_scope,p_operation_id,p_fingerprint,p_expected_revision,p_state,p_server_at);
    if v_result->>'status'='committed' then
      perform app_private.finance_register_event(v_family,v_child,v_last+1,v_event);
    end if;
    return v_result||jsonb_build_object('stateHash',app_private.finance_state_hash(v_result->'state'),'throughSequence',case when v_result->>'status'='committed' then v_last+1 else v_last end);
  end if;
  if p_state-array['state','event','previousStateHash','capsules','hydratedCapsules']<>'{}'::jsonb
    or p_state->>'previousStateHash' is distinct from v_old_hash then raise exception 'financial source binding mismatch' using errcode='22023';end if;
  v_next:=p_state->'state';v_event:=p_state->'event';v_capsules:=coalesce(p_state->'capsules','[]');v_hydrated:=coalesce(p_state->'hydratedCapsules','[]');
  if jsonb_typeof(v_next) is distinct from 'object' or v_next-array['timezone','children','events','checkpoint']<>'{}'::jsonb
    or(v_next-array['events','checkpoint']) is distinct from(v_aggregate.state-array['events','checkpoint'])
    or jsonb_typeof(v_next->'events') is distinct from 'array' or octet_length(v_next::text)>67108864
    or jsonb_typeof(v_event) is distinct from 'object' or octet_length(v_event::text)>4194304
    or jsonb_typeof(v_capsules) is distinct from 'array' or jsonb_array_length(v_capsules)>132
    or jsonb_typeof(v_hydrated) is distinct from 'array' or jsonb_array_length(v_hydrated)>132 then
    raise exception 'invalid financial aggregate' using errcode='22023';end if;
  if v_event->>'id' is distinct from v_actor::text||':'||p_operation_id::text or v_event->>'childId' is distinct from v_child::text
    or v_event->'actor' is distinct from(case when v_role='parent' then jsonb_build_object('role','parent') else jsonb_build_object('role','child','childId',v_child) end)
    or v_event->>'at' is distinct from p_server_at or p_server_at is null or p_server_at !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
    or p_server_at::timestamptz>clock_timestamp()+interval '1 second' or p_server_at::timestamptz<clock_timestamp()-interval '1 minute'
    or p_server_at::timestamptz<coalesce((v_aggregate.state->'events'->-1->>'at')::timestamptz,
      (v_aggregate.state->'checkpoint'->>'lastEventAt')::timestamptz,'epoch'::timestamptz)
    or not app_private.finance_check_numbers(v_event) or jsonb_typeof(v_event->'effects') is distinct from 'array'
    or jsonb_array_length(v_event->'effects')>4096 then raise exception 'invalid financial event' using errcode='22023';end if;
  if app_private.finance_state_hash(jsonb_build_object('familyId',v_family,'childId',v_child,
    'action',v_event-array['id','at','childId','actor','effects']))<>p_fingerprint then raise exception 'logical fingerprint mismatch' using errcode='22023';end if;
  v_kind:=v_event->>'kind';
  if v_kind is null or v_kind not in('configure_plan','assign_chore','edit_chore','submit_chore','review_chore','close_chore','reverse_earning',
    'create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal','set_savings_rule','mark_held','request_payout','prepare_payout','cancel_payout',
    'report_payment','acknowledge_payment','reverse_payment','configure_matching','reveal_match','fund_match','reverse_match','reconcile_match') then
    raise exception 'invalid financial action' using errcode='22023';end if;
  if(v_role='child' and v_kind not in('submit_chore','create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal','set_savings_rule','request_payout','acknowledge_payment'))
    or(v_role='parent' and v_kind in('submit_chore','create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal','set_savings_rule','request_payout','acknowledge_payment')) then
    raise exception 'not authorized' using errcode='42501';end if;
  if v_event?'paidAt' and(v_event->>'paidAt')::timestamptz>p_server_at::timestamptz then raise exception 'future payment report' using errcode='22023';end if;
  if(v_kind='assign_chore' and exists(select 1 from app_private.finance_entity_ids where family_id=v_family and child_id=v_child and kind='chore' and entity_id=v_event->>'choreId'))
    or(v_kind='create_goal' and exists(select 1 from app_private.finance_entity_ids where family_id=v_family and child_id=v_child and kind='goal' and entity_id=v_event->>'goalId')) then
    raise exception 'financial entity identity already used' using errcode='22023';end if;
  v_hidden:=v_kind in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');
  if v_hidden and(jsonb_array_length(v_capsules)>0 or jsonb_array_length(v_hydrated)>0) then raise exception 'private rollover cannot change visible archive' using errcode='22023';end if;
  select * into v_prior from app_private.finance_checkpoints where family_id=v_family order by aggregate_revision desc limit 1;
  if v_aggregate.state?'checkpoint' then
    if not found or v_prior.checkpoint is distinct from v_aggregate.state->'checkpoint' then raise exception 'checkpoint source mismatch' using errcode='22023';end if;
    v_previous_boundary:=v_prior.through_sequence;
  elsif found then raise exception 'checkpoint source mismatch' using errcode='22023';end if;
  select coalesce(jsonb_agg(payload order by sequence),'[]') into v_source from app_private.finance_events where family_id=v_family and sequence>v_previous_boundary;
  if v_source is distinct from v_aggregate.state->'events' or jsonb_array_length(v_source)<>v_last-v_previous_boundary then
    raise exception 'financial tail source mismatch' using errcode='22023';end if;
  if v_last=2147483647 then raise exception 'ledger sequence capacity review required' using errcode='54000';end if;
  v_next_sequence:=v_last+1;v_all:=v_source||jsonb_build_array(v_event);
  v_roll:=(v_next->'checkpoint') is distinct from(v_aggregate.state->'checkpoint');
  if not v_roll then
    if v_next->'events' is distinct from v_all or jsonb_array_length(v_capsules)>0 or jsonb_array_length(v_hydrated)>0 then
      raise exception 'event prefix is immutable' using errcode='22023';end if;
  else
    v_tail_count:=jsonb_array_length(v_next->'events');
    if v_tail_count>1 or(v_tail_count=1 and v_next->'events' is distinct from jsonb_build_array(v_event))
      or not app_private.finance_checkpoint_safe(v_next->'checkpoint',v_next->'children') then raise exception 'invalid financial checkpoint' using errcode='22023';end if;
    v_boundary:=v_next_sequence-v_tail_count;
    if v_boundary=v_next_sequence then v_last_at:=p_server_at;
    elsif v_boundary=0 then v_last_at:=null;
    else select payload->>'at' into v_last_at from app_private.finance_events where family_id=v_family and sequence=v_boundary;end if;
    if v_next->'checkpoint'->>'lastEventAt' is distinct from v_last_at then raise exception 'checkpoint time binding mismatch' using errcode='22023';end if;
    if not app_private.finance_preserve_checkpoint_entities(v_aggregate.state,v_next,v_event,v_capsules,v_hydrated) then
      raise exception 'checkpoint dropped visible entity' using errcode='22023';end if;
    if jsonb_array_length(v_capsules)>0 and(
      jsonb_array_length(v_next->'checkpoint'->'books'->v_child::text->'occurrences')+
        (select coalesce(sum(jsonb_array_length(c->'occurrences')),0) from jsonb_array_elements(v_capsules) c)<100
      and jsonb_array_length(v_next->'checkpoint'->'books'->v_child::text->'payouts')+
        (select coalesce(sum(jsonb_array_length(c->'payouts')),0) from jsonb_array_elements(v_capsules) c)<32) then
      raise exception 'visible archive threshold not reached' using errcode='22023';end if;
  end if;
  if exists(select 1 from jsonb_array_elements(v_next->'events') e group by e->>'childId',
    e->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match')
    having count(*)>case when e->>'kind' in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match') then 32 else 128 end) then
    raise exception 'capacity review required' using errcode='54000';end if;
  insert into app_private.finance_events(family_id,sequence,event_id,child_id,payload) values(v_family,v_next_sequence,v_event->>'id',v_child,v_event);
  perform app_private.finance_register_event(v_family,v_child,v_next_sequence,v_event);
  if v_roll then
    select coalesce(jsonb_agg(value order by ordinality),'[]') into v_covered from jsonb_array_elements(v_all) with ordinality where ordinality<=jsonb_array_length(v_all)-v_tail_count;
    insert into app_private.finance_checkpoints(family_id,through_sequence,aggregate_revision,previous_id,previous_state_hash,state_hash,covered_events_hash,covered_count,checkpoint)
      values(v_family,v_boundary,v_aggregate.revision+1,v_prior.id,v_old_hash,app_private.finance_state_hash(v_next->'checkpoint'),
        app_private.finance_state_hash(v_covered),jsonb_array_length(v_covered),v_next->'checkpoint') returning id into v_checkpoint_id;
    if(select count(*) from jsonb_array_elements(v_hydrated))<>(select count(distinct h->>'id') from jsonb_array_elements(v_hydrated) h) then
      raise exception 'duplicate capsule hydration' using errcode='22023';end if;
    for v_ref in select * from jsonb_array_elements(v_hydrated) h order by h->>'id' loop
      if jsonb_typeof(v_ref) is distinct from 'object' or v_ref-array['id','hash']<>'{}'::jsonb
        or coalesce(v_ref->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        or coalesce(v_ref->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid capsule reference' using errcode='22023';end if;
      select c.* into v_stored from app_private.finance_archive_capsules c join app_private.finance_archive_residency r on r.capsule_id=c.id and r.active
        where c.id=(v_ref->>'id')::uuid and c.family_id=v_family and c.child_id=v_child and c.hash=v_ref->>'hash' for update of r;
      if not found then raise exception 'archive hydration conflict' using errcode='22023';end if;
      update app_private.finance_archive_residency set active=false,hydrated_sequence=v_next_sequence where capsule_id=v_stored.id;
      delete from app_private.finance_archive_current_entities where capsule_id=v_stored.id;
    end loop;
    for v_capsule in select * from jsonb_array_elements(v_capsules) loop
      perform app_private.finance_archive_store(v_family,v_child,v_next_sequence,v_checkpoint_id,v_old_hash,v_capsule,v_next->'checkpoint'->'books'->v_child::text);
    end loop;
    for v_child_record in select * from jsonb_array_elements(v_next->'children') loop
      v_book:=v_next->'checkpoint'->'books'->(v_child_record->>'id');
      v_old_paid:=coalesce((v_aggregate.state->'checkpoint'->'books'->(v_child_record->>'id')->>'archivedPaidCents')::numeric,0);
      select coalesce(sum((c->>'paidCents')::numeric),0) into v_add from jsonb_array_elements(v_capsules) c where c->>'childId'=v_child_record->>'id';
      select coalesce(sum((c.payload->>'paidCents')::numeric),0) into v_subtract from jsonb_array_elements(v_hydrated) h join app_private.finance_archive_capsules c on c.id=(h->>'id')::uuid where c.child_id::text=v_child_record->>'id';
      v_new_paid:=coalesce((v_book->>'archivedPaidCents')::numeric,0);
      if v_new_paid is distinct from v_old_paid+v_add-v_subtract or v_new_paid<0 then raise exception 'archive paid basis mismatch' using errcode='22023';end if;
      if v_book?'archivedBudget' then
        select coalesce(array_agg(key),'{}') into v_keys from jsonb_object_keys(v_book->'archivedBudget'->'byPeriod') key;
        select coalesce(array_agg(o->>'id'),'{}') into v_hot from jsonb_array_elements(v_book->'occurrences') o;
        v_basis:=app_private.finance_budget_basis(v_family,(v_child_record->>'id')::uuid,v_book->'archivedBudget'->>'period',v_book->'archivedBudget'->>'anchorDate',v_keys,v_hot);
        if(v_basis-'excludedOccurrenceIds') is distinct from((v_book->'archivedBudget')-'excludedOccurrenceIds')
          or(select coalesce(jsonb_agg(x order by x),'[]') from jsonb_array_elements(v_basis->'excludedOccurrenceIds') x)
            is distinct from(select coalesce(jsonb_agg(x order by x),'[]') from jsonb_array_elements(v_book->'archivedBudget'->'excludedOccurrenceIds') x) then
          raise exception 'archive budget basis mismatch' using errcode='22023';end if;
      elsif exists(select 1 from app_private.finance_archived_occurrences where family_id=v_family and child_id=(v_child_record->>'id')::uuid) then
        raise exception 'archive budget basis required' using errcode='22023';end if;
      foreach v_cache_kind in array array['visible','parent'] loop
        for v_activity in select * from jsonb_array_elements(v_next->'checkpoint'->'activity'->(v_child_record->>'id')->v_cache_kind) loop
          if not exists(select 1 from app_private.finance_events e where e.family_id=v_family and e.child_id=(v_child_record->>'id')::uuid
            and e.event_id=v_activity->>'id' and(v_cache_kind='parent' or e.payload->>'kind' not in('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))) then
            raise exception 'activity source binding mismatch' using errcode='22023';end if;
        end loop;
      end loop;
    end loop;
  end if;
  insert into app_private.finance_commands(family_id,actor_id,operation_id,child_id,fingerprint,event_sequence,server_at)
    values(v_family,v_actor,p_operation_id,v_child,p_fingerprint,v_next_sequence,p_server_at);
  update app_private.finance_aggregates set state=v_next,revision=revision+1,updated_at=clock_timestamp() where family_id=v_family;
  return jsonb_build_object('status','committed','state',v_next,'serverAt',p_server_at,'stateHash',app_private.finance_state_hash(v_next),'throughSequence',v_next_sequence);
end $$;

do $$ declare tab text;f record;begin
  foreach tab in array array['finance_checkpoints','finance_entity_ids','finance_archive_capsules','finance_archive_residency','finance_archive_entity_keys',
    'finance_archived_occurrences','finance_archive_budget_heads','finance_archive_budget_periods','finance_archive_current_entities'] loop
    execute format('alter table app_private.%I enable row level security',tab);
    execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',tab);
    execute format('create trigger resource_growth_before_insert before insert on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);
    if tab not in('finance_archive_residency','finance_archive_budget_heads','finance_archive_budget_periods','finance_archive_current_entities') then
      execute format('create trigger immutable_history before update or delete on app_private.%I for each row execute function app_private.finance_immutable()',tab);
    else execute format('create trigger resource_growth_before_update before update on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);end if;
  end loop;
  for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('finance_state_hash','finance_budget_period','finance_register_entity','finance_register_event','finance_checkpoint_safe','finance_verify_source',
      'finance_budget_basis','finance_archive_store','finance_preserve_checkpoint_entities','finance_commit_v1'))
    or(n.nspname='api' and p.proname in('finance_load','finance_commit','finance_archive_lookup','finance_archive_budget','finance_archive_page')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
commit;
