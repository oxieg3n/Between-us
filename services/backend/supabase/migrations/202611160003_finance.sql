create table app_private.finance_aggregates (
  family_id uuid primary key references app_private.families(id),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state)='object' and octet_length(state::text)<=67108864)
);
create table app_private.finance_events (
  family_id uuid not null references app_private.families(id),
  sequence integer not null check (sequence>0),
  event_id text not null,
  child_id uuid not null references app_private.children(id),
  payload jsonb not null,
  primary key(family_id,sequence),
  unique(family_id,event_id)
);
create table app_private.finance_commands (
  family_id uuid not null references app_private.families(id),
  actor_id uuid not null references app_private.profiles(user_id),
  operation_id uuid not null,
  child_id uuid not null references app_private.children(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  event_sequence integer not null,
  server_at text not null,
  primary key(family_id,actor_id,operation_id),
  foreign key(family_id,event_sequence) references app_private.finance_events(family_id,sequence)
);
alter table app_private.finance_aggregates enable row level security;
alter table app_private.finance_events enable row level security;
alter table app_private.finance_commands enable row level security;
revoke all on app_private.finance_aggregates,app_private.finance_events,app_private.finance_commands from public,anon,authenticated;

create function app_private.finance_immutable() returns trigger
language plpgsql security definer set search_path='' as $$
begin raise exception 'financial history is append-only' using errcode='42501'; end;
$$;
create trigger finance_events_immutable before update or delete on app_private.finance_events
  for each row execute function app_private.finance_immutable();
create trigger finance_commands_immutable before update or delete on app_private.finance_commands
  for each row execute function app_private.finance_immutable();

create function app_private.finance_authorize(p_scope jsonb) returns text
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid; v_sid uuid; v_family uuid; v_child uuid; v_exp numeric; v_role text;
begin
  begin
    v_uid := (p_scope->>'actorId')::uuid; v_sid := (p_scope->>'sessionId')::uuid;
    v_family := (p_scope->>'familyId')::uuid; v_child := (p_scope->>'childId')::uuid;
    v_exp := (p_scope->>'expiresAt')::numeric;
  exception when others then raise exception 'not authorized' using errcode='42501'; end;
  if v_uid is null or v_sid is null or v_exp is null or v_exp<=extract(epoch from now()) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  perform 1 from auth.sessions s where s.id=v_sid and s.user_id=v_uid and (s.not_after is null or s.not_after>now()) for share;
  if not found or not app_private.account_usable(v_uid) then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.lock_family(v_family);
  if app_private.is_guardian(v_family,v_uid) then v_role:='parent';
  elsif app_private.child_for_user(v_family,v_uid)=v_child then v_role:='child';
  else raise exception 'not authorized' using errcode='42501'; end if;
  if v_role is distinct from p_scope->>'role' or not exists(select 1 from app_private.children c
      where c.id=v_child and c.family_id=v_family and c.state<>'closed') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  return v_role;
end;
$$;

create function api.finance_scope(p_family_id uuid,p_child_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_scope jsonb;
begin
  v_scope:=jsonb_build_object('actorId',v_uid,'sessionId',auth.jwt()->>'session_id','expiresAt',(auth.jwt()->>'exp')::numeric,
    'familyId',p_family_id,'childId',p_child_id,'role',case when app_private.is_guardian(p_family_id,v_uid) then 'parent' else 'child' end);
  perform app_private.finance_authorize(v_scope);
  return v_scope;
end;
$$;

create function app_private.finance_sync(p_family_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v_state jsonb; v_children jsonb; v_new jsonb; v_zone text;
begin
  select timezone into v_zone from app_private.families where id=p_family_id;
  select state into v_state from app_private.finance_aggregates where family_id=p_family_id;
  v_children:=coalesce(v_state->'children','[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.id),'[]'::jsonb) into v_new
    from app_private.children c where c.family_id=p_family_id and c.state<>'closed'
      and not exists(select 1 from jsonb_array_elements(v_children) old where old->>'id'=c.id::text);
  if jsonb_array_length(v_children||v_new)>12 then raise exception 'capacity review required' using errcode='54000'; end if;
  if v_state is null then
    insert into app_private.finance_aggregates(family_id,state)
      values(p_family_id,jsonb_build_object('timezone',v_zone,'children',v_new,'events','[]'::jsonb));
  elsif jsonb_array_length(v_new)>0 then
    -- Existing roster names/IDs and every historical event remain unchanged.
    update app_private.finance_aggregates set state=jsonb_set(state,'{children}',v_children||v_new),
      revision=revision+1,updated_at=now() where family_id=p_family_id;
  end if;
end;
$$;

create function api.finance_load(p_scope jsonb,p_operation_id uuid default null,p_fingerprint text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_family uuid := (p_scope->>'familyId')::uuid; v_uid uuid := (p_scope->>'actorId')::uuid;
  v_child uuid := (p_scope->>'childId')::uuid; v_aggregate app_private.finance_aggregates;
  v_command app_private.finance_commands; v_at text;
begin
  perform app_private.finance_authorize(p_scope);
  perform app_private.finance_sync(v_family);
  select * into v_aggregate from app_private.finance_aggregates where family_id=v_family;
  v_at:=to_char(greatest(clock_timestamp(),coalesce((v_aggregate.state->'events'->-1->>'at')::timestamptz,'epoch'::timestamptz))
    at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation_id is not null then
    if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid fingerprint' using errcode='22023'; end if;
    select * into v_command from app_private.finance_commands where family_id=v_family and actor_id=v_uid and operation_id=p_operation_id;
    if found then
      if v_command.fingerprint<>p_fingerprint or v_command.child_id<>v_child then raise exception 'operation identity conflict' using errcode='22023'; end if;
      return jsonb_build_object('state',v_aggregate.state,
        'revision',v_aggregate.revision,'serverAt',v_at,'replay',true);
    end if;
  end if;
  return jsonb_build_object('state',v_aggregate.state,'revision',v_aggregate.revision,'serverAt',v_at,'replay',false);
end;
$$;

create function app_private.finance_canonical(p_value jsonb) returns text
language plpgsql immutable security definer set search_path='' as $$
declare v_result text;
begin
  if jsonb_typeof(p_value)='object' then
    select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||app_private.finance_canonical(value),',' order by key collate "C"),'')||'}'
      into v_result from jsonb_each(p_value);
  elsif jsonb_typeof(p_value)='array' then
    select '['||coalesce(string_agg(app_private.finance_canonical(value),',' order by ordinality),'')||']'
      into v_result from jsonb_array_elements(p_value) with ordinality;
  else v_result:=p_value::text; end if;
  return v_result;
end;
$$;

create function app_private.finance_check_numbers(p_value jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare v_value jsonb;
begin
  if jsonb_typeof(p_value)='number' then
    return p_value::numeric=trunc(p_value::numeric) and p_value::numeric between 0 and 9007199254740991;
  elsif jsonb_typeof(p_value)='array' then
    for v_value in select value from jsonb_array_elements(p_value) loop
      if not app_private.finance_check_numbers(v_value) then return false; end if;
    end loop;
  elsif jsonb_typeof(p_value)='object' then
    for v_value in select value from jsonb_each(p_value) loop
      if not app_private.finance_check_numbers(v_value) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create function api.finance_commit(p_scope jsonb,p_operation_id uuid,p_fingerprint text,p_expected_revision bigint,p_state jsonb,p_server_at text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_family uuid := (p_scope->>'familyId')::uuid; v_uid uuid := (p_scope->>'actorId')::uuid;
  v_child uuid := (p_scope->>'childId')::uuid; v_role text; v_aggregate app_private.finance_aggregates;
  v_command app_private.finance_commands; v_count integer; v_event jsonb; v_old jsonb; v_actor jsonb;
  v_hidden boolean; v_kind text; v_limit integer;
begin
  v_role:=app_private.finance_authorize(p_scope);
  perform app_private.finance_sync(v_family);
  select * into v_aggregate from app_private.finance_aggregates where family_id=v_family for update;
  if p_operation_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid operation identity' using errcode='22023'; end if;
  select * into v_command from app_private.finance_commands where family_id=v_family and actor_id=v_uid and operation_id=p_operation_id;
  if found then
    if v_command.fingerprint<>p_fingerprint or v_command.child_id<>v_child then raise exception 'operation identity conflict' using errcode='22023'; end if;
    return jsonb_build_object('status','replayed','state',v_aggregate.state,'serverAt',
      to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;
  if p_expected_revision is distinct from v_aggregate.revision then return jsonb_build_object('status','conflict'); end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>67108864
    or jsonb_typeof(p_state->'events') is distinct from 'array'
    or (p_state-'events') is distinct from (v_aggregate.state-'events') then
    raise exception 'invalid financial aggregate' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(v_aggregate.state->'events');
  if jsonb_array_length(p_state->'events')<>v_count+1 then raise exception 'exactly one appended event required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_old
    from jsonb_array_elements(p_state->'events') with ordinality where ordinality<=v_count;
  if v_old is distinct from v_aggregate.state->'events' then raise exception 'event prefix is immutable' using errcode='22023'; end if;
  v_event:=p_state->'events'->v_count;
  v_actor:=case when v_role='parent' then jsonb_build_object('role','parent') else jsonb_build_object('role','child','childId',v_child) end;
  if v_event->>'id' is distinct from v_uid::text||':'||p_operation_id::text or v_event->>'childId' is distinct from v_child::text
    or v_event->'actor' is distinct from v_actor or v_event->>'at' is distinct from p_server_at
    or p_server_at is null or p_server_at !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$'
    or p_server_at::timestamptz>clock_timestamp()+interval '1 second' or p_server_at::timestamptz<clock_timestamp()-interval '1 minute'
    or (v_count>0 and p_server_at::timestamptz<(v_aggregate.state->'events'->-1->>'at')::timestamptz)
    or octet_length(v_event::text)>4194304 or not app_private.finance_check_numbers(v_event)
    or jsonb_typeof(v_event->'effects') is distinct from 'array' or jsonb_array_length(v_event->'effects')>4096 then
    raise exception 'invalid financial event' using errcode='22023';
  end if;
  v_kind:=v_event->>'kind';
  if encode(extensions.digest(app_private.finance_canonical(jsonb_build_object('familyId',v_family,'childId',v_child,
      'action',v_event-array['id','at','childId','actor','effects'])),'sha256'),'hex')<>p_fingerprint then
    raise exception 'logical fingerprint mismatch' using errcode='22023';
  end if;
  if v_kind not in ('configure_plan','assign_chore','edit_chore','submit_chore','review_chore','close_chore','reverse_earning',
    'create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal','set_savings_rule','mark_held',
    'request_payout','prepare_payout','cancel_payout','report_payment','acknowledge_payment','reverse_payment',
    'configure_matching','reveal_match','fund_match','reverse_match','reconcile_match') or v_kind is null then
    raise exception 'invalid financial action' using errcode='22023';
  end if;
  if v_event ? 'paidAt' and (v_event->>'paidAt')::timestamptz>p_server_at::timestamptz then raise exception 'future payment report' using errcode='22023'; end if;
  v_hidden:=v_kind in ('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match');
  if v_role='child' and v_kind not in ('submit_chore','create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal',
    'set_savings_rule','request_payout','acknowledge_payment') then raise exception 'not authorized' using errcode='42501'; end if;
  if v_role='parent' and v_kind in ('submit_chore','create_goal','edit_goal','cancel_goal','allocate','transfer_goal','release_goal',
    'set_savings_rule','request_payout','acknowledge_payment') then raise exception 'not authorized' using errcode='42501'; end if;
  v_limit:=case when v_hidden then 32 else 128 end;
  if (select count(*) from app_private.finance_events e where e.family_id=v_family and e.child_id=v_child and
    (e.payload->>'kind' in ('configure_matching','reveal_match','fund_match','reverse_match','reconcile_match'))=v_hidden)>=v_limit then
    raise exception 'capacity review required' using errcode='54000';
  end if;
  insert into app_private.finance_events(family_id,sequence,event_id,child_id,payload) values(v_family,v_count+1,v_event->>'id',v_child,v_event);
  insert into app_private.finance_commands(family_id,actor_id,operation_id,child_id,fingerprint,event_sequence,server_at)
    values(v_family,v_uid,p_operation_id,v_child,p_fingerprint,v_count+1,p_server_at);
  update app_private.finance_aggregates set state=p_state,revision=revision+1,updated_at=now() where family_id=v_family;
  -- No raw ledger publication or matching-driven child invalidation is emitted.
  return jsonb_build_object('status','committed','state',p_state,'serverAt',p_server_at);
end;
$$;

revoke all on function api.finance_scope(uuid,uuid) from public,anon;
grant execute on function api.finance_scope(uuid,uuid) to authenticated;
revoke all on function api.finance_load(jsonb,uuid,text),api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function api.finance_load(jsonb,uuid,text),api.finance_commit(jsonb,uuid,text,bigint,jsonb,text) to service_role;
revoke all on function app_private.finance_immutable(),app_private.finance_authorize(jsonb),app_private.finance_sync(uuid),
  app_private.finance_canonical(jsonb),app_private.finance_check_numbers(jsonb) from public,anon,authenticated;
