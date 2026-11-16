begin;
lock table app_private.finance_aggregates,app_private.finance_events,app_private.finance_commands in share row exclusive mode;

-- Match history has a separate namespace and never participates in visible archive paging.
create table app_private.finance_private_match_origins (
  family_id uuid not null,child_id uuid not null,match_id text not null check(char_length(match_id) between 1 and 250),
  source_sequence integer not null,cents bigint not null check(cents>0),created_at text not null,
  primary key(family_id,child_id,match_id),
  foreign key(child_id,family_id) references app_private.children(id,family_id),
  foreign key(family_id,source_sequence) references app_private.finance_events(family_id,sequence)
);
create table app_private.finance_private_match_capsules (
  id uuid primary key default gen_random_uuid(),family_id uuid not null,child_id uuid not null,match_id text not null,
  source_sequence integer not null,checkpoint_id uuid not null references app_private.finance_checkpoints(id),
  previous_state_hash text not null check(previous_state_hash ~ '^[a-f0-9]{64}$'),hash text not null check(hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=1048576),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(family_id,child_id,match_id) references app_private.finance_private_match_origins(family_id,child_id,match_id),
  foreign key(family_id,source_sequence) references app_private.finance_events(family_id,sequence),
  unique(id,family_id,child_id,match_id)
);
create index finance_private_match_lookup on app_private.finance_private_match_capsules(family_id,child_id,match_id,source_sequence desc);
create index finance_private_match_page on app_private.finance_private_match_capsules(family_id,child_id,id);
create table app_private.finance_private_match_residency (
  capsule_id uuid primary key,family_id uuid not null,child_id uuid not null,match_id text not null,active boolean not null default true,hydrated_sequence integer,
  foreign key(capsule_id,family_id,child_id,match_id) references app_private.finance_private_match_capsules(id,family_id,child_id,match_id),
  check((active and hydrated_sequence is null) or(not active and hydrated_sequence is not null))
);
create unique index finance_private_match_current on app_private.finance_private_match_residency(family_id,child_id,match_id) where active;
create index finance_private_match_active_page on app_private.finance_private_match_residency(family_id,child_id,capsule_id) where active;
create function app_private.finance_register_private_matches(p_family uuid,p_child uuid,p_sequence integer,p_event jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare effect jsonb;begin
  for effect in select * from jsonb_array_elements(coalesce(p_event->'effects','[]')) where value->>'kind'='match_committed' loop
    insert into app_private.finance_private_match_origins(family_id,child_id,match_id,source_sequence,cents,created_at)
      values(p_family,p_child,effect->>'referenceId',p_sequence,(effect->>'cents')::bigint,p_event->>'at')
      on conflict(family_id,child_id,match_id) do nothing;
  end loop;
end $$;
do $$ declare e record;begin
  for e in select family_id,child_id,sequence,payload from app_private.finance_events order by family_id,sequence loop
    perform app_private.finance_register_private_matches(e.family_id,e.child_id,e.sequence,e.payload);
  end loop;
end $$;

create function app_private.finance_private_capsule_safe(p_capsule jsonb,p_child uuid) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare m jsonb;key text;total numeric;invalidated numeric;begin
  if jsonb_typeof(p_capsule) is distinct from 'object' or p_capsule-array['version','childId','match']<>'{}'::jsonb
    or p_capsule->'version' is distinct from '1'::jsonb or p_capsule->>'childId' is distinct from p_child::text
    or octet_length(p_capsule::text)>1048576 or not app_private.finance_check_numbers(p_capsule) then return false;end if;
  m:=p_capsule->'match';
  if jsonb_typeof(m) is distinct from 'object' or m-array['id','goalId','allocationId','cents','activeCents','fundedCents','parentReportedFundingCents',
    'reconciledCents','reversedCents','correctionDueCents','month','revealed','createdAt','status','sourceCents','invalidatedCents','eligibleBaseCents']<>'{}'::jsonb
    or not(m?&array['id','goalId','allocationId','cents','activeCents','fundedCents','parentReportedFundingCents','reconciledCents','reversedCents',
      'correctionDueCents','month','revealed','createdAt','status','sourceCents','invalidatedCents','eligibleBaseCents'])
    or jsonb_typeof(m->'revealed') is distinct from 'boolean' or m->>'status' not in('pledged','partially_parent_reported','parent_reported_paid','reversed')
    or coalesce(m->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$'
    or coalesce(m->>'createdAt','') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
    or jsonb_typeof(m->'sourceCents') is distinct from 'object' or jsonb_typeof(m->'invalidatedCents') is distinct from 'object'
    or(select count(*) from jsonb_object_keys(m->'sourceCents'))>100 then return false;end if;
  foreach key in array array['id','goalId','allocationId'] loop
    if jsonb_typeof(m->key) is distinct from 'string' or char_length(m->>key) not between 1 and 250 then return false;end if;
  end loop;
  foreach key in array array['cents','activeCents','fundedCents','parentReportedFundingCents','reconciledCents','reversedCents','correctionDueCents','eligibleBaseCents'] loop
    if jsonb_typeof(m->key) is distinct from 'number' then return false;end if;
  end loop;
  if exists(select 1 from jsonb_each(m->'sourceCents') s where char_length(s.key) not between 1 and 171 or jsonb_typeof(s.value)<>'number')
    or exists(select 1 from jsonb_each(m->'invalidatedCents') s where not(m->'sourceCents'?s.key)
      or jsonb_typeof(s.value)<>'number' or(s.value::text)::numeric>((m->'sourceCents'->s.key)::text)::numeric) then return false;end if;
  select coalesce(sum(value::text::numeric),0) into total from jsonb_each(m->'sourceCents');
  select coalesce(sum(value::text::numeric),0) into invalidated from jsonb_each(m->'invalidatedCents');
  return total>0 and total=(m->>'eligibleBaseCents')::numeric and invalidated=total
    and(m->>'cents')::numeric-(m->>'reversedCents')::numeric=(m->>'activeCents')::numeric
    and m->'activeCents'=m->'fundedCents' and m->'correctionDueCents'=m->'fundedCents';
exception when others then return false;
end $$;

create function api.finance_private_match_lookup(p_scope jsonb,p_match_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a app_private.finance_aggregates;c app_private.finance_private_match_capsules;begin
  if app_private.finance_authorize(p_scope)<>'parent' then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if coalesce(char_length(p_match_id),0) not between 1 and 250 then raise exception 'invalid private archive lookup' using errcode='22023';end if;
  select * into a from app_private.finance_aggregates where family_id=(p_scope->>'familyId')::uuid;
  select cap.* into c from app_private.finance_private_match_residency r join app_private.finance_private_match_capsules cap on cap.id=r.capsule_id
    where r.family_id=a.family_id and r.child_id=(p_scope->>'childId')::uuid and r.match_id=p_match_id and r.active;
  if not found then return null;end if;
  if c.hash is distinct from app_private.finance_state_hash(c.payload) then raise exception 'financial data unavailable' using errcode='XX001';end if;
  return jsonb_build_object('capsule',c.payload,'id',c.id,'hash',c.hash,'revision',a.revision,'stateHash',app_private.finance_state_hash(a.state));
end $$;
create function api.finance_private_match_page(p_scope jsonb,p_after_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;more boolean;begin
  if app_private.finance_authorize(p_scope)<>'parent' then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid private archive page' using errcode='22023';end if;
  if p_after_id is not null and not exists(select 1 from app_private.finance_private_match_capsules where id=p_after_id
    and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid) then raise exception 'invalid private archive page' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'capsule',payload) order by id),'[]') into rows from(
    select c.id,c.payload from(select capsule_id from app_private.finance_private_match_residency
      where family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid and active
        and(p_after_id is null or capsule_id>p_after_id) order by capsule_id limit p_limit+1) active_page
      join app_private.finance_private_match_capsules c on c.id=active_page.capsule_id) page;
  more:=jsonb_array_length(rows)>p_limit;if more then rows:=rows-(jsonb_array_length(rows)-1);end if;
  if exists(select 1 from jsonb_array_elements(rows) item join app_private.finance_private_match_capsules c on c.id=(item->>'id')::uuid
    where c.hash is distinct from app_private.finance_state_hash(c.payload)) then raise exception 'financial data unavailable' using errcode='XX001';end if;
  if octet_length(rows::text)>8388608 then raise exception 'private archive page capacity review required' using errcode='54000';end if;
  return jsonb_build_object('items',rows,'nextAfterId',case when more then rows->-1->>'id' else null end);
end $$;

alter function api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) set schema app_private;
alter function app_private.finance_commit(jsonb,uuid,text,bigint,jsonb,text) rename to finance_commit_checkpoint_core;
revoke all on function app_private.finance_commit_checkpoint_core(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated,service_role;
create function api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_family uuid:=(p_scope->>'familyId')::uuid;v_child uuid:=(p_scope->>'childId')::uuid;v_role text;
  v_old app_private.finance_aggregates;v_result jsonb;v_caps jsonb;v_hydrated jsonb;v_ref jsonb;v_cap jsonb;v_match jsonb;v_source jsonb;
  v_stored app_private.finance_private_match_capsules;v_checkpoint uuid;v_sequence integer;v_id uuid;v_child_record jsonb;v_book jsonb;v_old_book jsonb;
  v_month text;v_old_month text;v_current_month text;v_expected jsonb;v_by_goal jsonb;v_used numeric;v_entity text;v_covered jsonb;
  v_delta jsonb;v_totals jsonb;v_goal text;v_sign integer;v_active numeric;v_funded numeric;v_revealed numeric;
begin
  v_role:=app_private.finance_authorize(p_scope);perform app_private.finance_sync(v_family);
  select * into v_old from app_private.finance_aggregates where family_id=v_family for update;
  v_caps:=coalesce(p_state->'privateCapsules','[]');v_hydrated:=coalesce(p_state->'hydratedPrivateCapsules','[]');
  if jsonb_typeof(v_caps) is distinct from 'array' or jsonb_typeof(v_hydrated) is distinct from 'array'
    or jsonb_array_length(v_caps)>2056 or jsonb_array_length(v_hydrated)>2056 then raise exception 'invalid private archive envelope' using errcode='22023';end if;
  -- Original command replay and stale CAS remain handled before any archive mutations.
  v_result:=app_private.finance_commit_checkpoint_core(p_scope,p_operation_id,p_fingerprint,p_expected_revision,
    p_state-array['privateCapsules','hydratedPrivateCapsules'],p_server_at);
  if v_result->>'status'<>'committed' then return v_result;end if;
  v_sequence:=(v_result->>'throughSequence')::integer;
  perform app_private.finance_register_private_matches(v_family,v_child,v_sequence,p_state->'event');
  if not(p_state?'state') then
    perform app_private.finance_register_private_matches(v_family,v_child,v_sequence,p_state->'events'->-1);return v_result;
  end if;
  if jsonb_array_length(v_hydrated)>0 and v_role<>'parent' then raise exception 'not authorized' using errcode='42501';end if;
  if jsonb_array_length(v_caps)+jsonb_array_length(v_hydrated)>0 and
    (p_state->'state'->'checkpoint') is not distinct from(v_old.state->'checkpoint') then
    raise exception 'private archive requires checkpoint' using errcode='22023';end if;
  if(p_state->'state'->'checkpoint') is not distinct from(v_old.state->'checkpoint') then return v_result;end if;
  select id into v_checkpoint from app_private.finance_checkpoints where family_id=v_family and aggregate_revision=v_old.revision+1;
  if v_checkpoint is null then raise exception 'private archive checkpoint binding mismatch' using errcode='22023';end if;
  if(select count(*) from jsonb_array_elements(v_hydrated))<>(select count(distinct value->>'id') from jsonb_array_elements(v_hydrated)) then
    raise exception 'duplicate private capsule hydration' using errcode='22023';end if;
  for v_ref in select * from jsonb_array_elements(v_hydrated) order by value->>'id' loop
    if jsonb_typeof(v_ref) is distinct from 'object' or v_ref-array['id','hash']<>'{}'::jsonb
      or coalesce(v_ref->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(v_ref->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid private capsule reference' using errcode='22023';end if;
    select c.* into v_stored from app_private.finance_private_match_capsules c join app_private.finance_private_match_residency r on r.capsule_id=c.id and r.active
      where c.id=(v_ref->>'id')::uuid and c.family_id=v_family and c.child_id=v_child and c.hash=v_ref->>'hash' for update of r;
    if not found then raise exception 'private archive hydration conflict' using errcode='22023';end if;
    if v_stored.hash is distinct from app_private.finance_state_hash(v_stored.payload) then raise exception 'financial data unavailable' using errcode='XX001';end if;
    update app_private.finance_private_match_residency set active=false,hydrated_sequence=v_sequence where capsule_id=v_stored.id;
  end loop;
  for v_cap in select * from jsonb_array_elements(v_caps) loop
    if not app_private.finance_private_capsule_safe(v_cap,v_child) then raise exception 'invalid private archive capsule' using errcode='22023';end if;
    v_match:=v_cap->'match';v_book:=p_state->'state'->'checkpoint'->'books'->v_child::text;
    if not exists(select 1 from app_private.finance_private_match_origins o where o.family_id=v_family and o.child_id=v_child and o.match_id=v_match->>'id'
      and o.cents=(v_match->>'cents')::bigint and o.created_at=v_match->>'createdAt')
      or v_match->>'id' is distinct from(v_match->>'allocationId')||':match'
      or not exists(select 1 from app_private.finance_entity_ids where family_id=v_family and child_id=v_child and kind='goal' and entity_id=v_match->>'goalId')
      or exists(select 1 from jsonb_array_elements(v_book->'matches') m where m->>'id'=v_match->>'id')
      or exists(select 1 from app_private.finance_private_match_residency r
        where r.family_id=v_family and r.child_id=v_child and r.match_id=v_match->>'id' and r.active) then raise exception 'private archive source mismatch' using errcode='22023';end if;
    if exists(select 1 from(
      select l from jsonb_array_elements(v_book->'free') l
      union all select l from jsonb_array_elements(v_book->'allocations') a cross join lateral jsonb_array_elements(a->'lots') l
      union all select l from jsonb_array_elements(v_book->'payouts') p cross join lateral jsonb_array_elements(p->'lots') l
      union all select l from jsonb_array_elements(v_book->'payouts') p cross join lateral jsonb_array_elements(p->'payments') payment cross join lateral jsonb_array_elements(payment->'lots') l
    ) lots where lots.l->>'matchAllocationId'=v_match->>'allocationId' and(lots.l->>'cents')::numeric>0) then
      raise exception 'private archive allocation remains live' using errcode='22023';end if;
    select m into v_source from jsonb_array_elements(coalesce(v_old.state->'checkpoint'->'books'->v_child::text->'matches','[]')) m where m->>'id'=v_match->>'id';
    if not found then select c.payload->'match' into v_source from jsonb_array_elements(v_hydrated) h join app_private.finance_private_match_capsules c on c.id=(h->>'id')::uuid where c.match_id=v_match->>'id';end if;
    if v_source is not null and(v_source-array['activeCents','fundedCents','parentReportedFundingCents','reconciledCents','reversedCents','correctionDueCents','revealed','status','invalidatedCents'])
      is distinct from(v_match-array['activeCents','fundedCents','parentReportedFundingCents','reconciledCents','reversedCents','correctionDueCents','revealed','status','invalidatedCents']) then
      raise exception 'private archive immutable origin mismatch' using errcode='22023';end if;
    insert into app_private.finance_private_match_capsules(family_id,child_id,match_id,source_sequence,checkpoint_id,previous_state_hash,hash,payload)
      values(v_family,v_child,v_match->>'id',v_sequence,v_checkpoint,p_state->>'previousStateHash',app_private.finance_state_hash(v_cap),v_cap) returning id into v_id;
    insert into app_private.finance_private_match_residency(capsule_id,family_id,child_id,match_id) values(v_id,v_family,v_child,v_match->>'id');
  end loop;
  v_covered:=v_old.state->'events'||case when jsonb_array_length(p_state->'state'->'events')=0 then jsonb_build_array(p_state->'event') else '[]'::jsonb end;
  v_current_month:=to_char(p_server_at::timestamptz at time zone(v_old.state->>'timezone'),'YYYY-MM');
  for v_child_record in select * from jsonb_array_elements(v_old.state->'children') loop
    v_book:=p_state->'state'->'checkpoint'->'books'->(v_child_record->>'id');v_old_book:=v_old.state->'checkpoint'->'books'->(v_child_record->>'id');
    for v_entity in
      select m->>'id' from jsonb_array_elements(coalesce(v_old_book->'matches','[]')) m
      union select effect->>'referenceId' from jsonb_array_elements(v_covered) e cross join lateral jsonb_array_elements(e->'effects') effect
        where e->>'childId'=v_child_record->>'id' and effect->>'kind'='match_committed'
      union select c.match_id from jsonb_array_elements(v_hydrated) h join app_private.finance_private_match_capsules c on c.id=(h->>'id')::uuid where c.child_id::text=v_child_record->>'id'
    loop
      if not exists(select 1 from jsonb_array_elements(v_book->'matches') m where m->>'id'=v_entity)
        and not exists(select 1 from app_private.finance_private_match_residency r
          where r.family_id=v_family and r.child_id=(v_child_record->>'id')::uuid and r.match_id=v_entity and r.active) then
        raise exception 'checkpoint dropped private match' using errcode='22023';end if;
    end loop;
    v_month:=v_book->'archivedMatches'->>'month';v_old_month:=v_old_book->'archivedMatches'->>'month';
    if v_month is null then
      if exists(select 1 from app_private.finance_private_match_residency r
        where r.family_id=v_family and r.child_id=(v_child_record->>'id')::uuid and r.active) then raise exception 'private archive basis required' using errcode='22023';end if;
    else
      if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or v_month>v_current_month or(v_old_month is not null and v_month<v_old_month) then
        raise exception 'private archive month mismatch' using errcode='22023';end if;
      -- Bounded summary delta: no scan or replay of lifetime private archive payloads.
      -- A monotonic month change zeros use because every preexisting capsule predates the new month.
      v_by_goal:=coalesce(v_old_book->'archivedMatches'->'byGoal','{}');
      v_used:=case when v_month=v_old_month then coalesce((v_old_book->'archivedMatches'->>'usedCents')::numeric,0) else 0 end;
      for v_delta,v_sign in
        select c->'match',1 from jsonb_array_elements(v_caps) c where c->>'childId'=v_child_record->>'id'
        union all select c.payload->'match',-1 from jsonb_array_elements(v_hydrated) h join app_private.finance_private_match_capsules c on c.id=(h->>'id')::uuid
          where c.child_id::text=v_child_record->>'id'
      loop
        v_goal:=v_delta->>'goalId';v_totals:=coalesce(v_by_goal->v_goal,'{}');
        v_active:=coalesce((v_totals->>'activeCents')::numeric,0)+v_sign*(v_delta->>'activeCents')::numeric;
        v_funded:=coalesce((v_totals->>'fundedCents')::numeric,0)+v_sign*(v_delta->>'fundedCents')::numeric;
        v_revealed:=coalesce((v_totals->>'revealedFundedCents')::numeric,0)+v_sign*case when(v_delta->>'revealed')::boolean then(v_delta->>'fundedCents')::numeric else 0 end;
        if least(v_active,v_funded,v_revealed)<0 then raise exception 'private archive basis mismatch' using errcode='22023';end if;
        if v_active=0 and v_funded=0 and v_revealed=0 then v_by_goal:=v_by_goal-v_goal;
        else v_by_goal:=jsonb_set(v_by_goal,array[v_goal],jsonb_build_object('activeCents',v_active,'fundedCents',v_funded,'revealedFundedCents',v_revealed));end if;
        if v_delta->>'month'=v_month then v_used:=v_used+v_sign*(v_delta->>'activeCents')::numeric;end if;
      end loop;
      v_expected:=jsonb_build_object('month',v_month,'usedCents',v_used,'byGoal',v_by_goal);
      if v_book->'archivedMatches' is distinct from v_expected or(select count(*) from jsonb_object_keys(v_by_goal))>32
        or exists(select 1 from jsonb_object_keys(v_by_goal) goal where not exists(select 1 from jsonb_array_elements(v_book->'goals') g where g->>'id'=goal)) then
        raise exception 'private archive basis mismatch' using errcode='22023';end if;
    end if;
  end loop;
  return v_result;
end $$;

do $$ declare tab text;f record;begin
  foreach tab in array array['finance_private_match_origins','finance_private_match_capsules','finance_private_match_residency'] loop
    execute format('alter table app_private.%I enable row level security',tab);
    execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',tab);
    execute format('create trigger resource_growth_before_insert before insert on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);
    if tab='finance_private_match_residency' then
      execute format('create trigger resource_growth_before_update before update on app_private.%I for each row execute function app_private.guard_resource_growth()',tab);
    else execute format('create trigger immutable_history before update or delete on app_private.%I for each row execute function app_private.finance_immutable()',tab);end if;
  end loop;
  for f in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='app_private' and p.proname in('finance_register_private_matches','finance_private_capsule_safe','finance_commit_checkpoint_core'))
    or(n.nspname='api' and p.proname in('finance_commit','finance_private_match_lookup','finance_private_match_page')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end $$;
commit;
