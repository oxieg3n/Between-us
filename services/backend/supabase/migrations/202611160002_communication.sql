-- Private communication state; clients receive only authorized RPC projections.
create table app_private.communication_policy (
  singleton boolean primary key default true check (singleton),
  synthetic_fixture_mode boolean not null default false,
  public_report_intake boolean not null default false,
  staffed_support_promises boolean not null default false,
  approved_safety_operator uuid references auth.users(id),
  verification_policy_id text,
  push_delivery_enabled boolean not null default false
);
insert into app_private.communication_policy(singleton) values (true);

create table app_private.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app_private.families(id) on delete cascade,
  a uuid not null references auth.users(id),
  b uuid not null references auth.users(id),
  requested_by uuid not null references auth.users(id),
  accepted_a_at timestamptz,
  accepted_b_at timestamptz,
  approved_a_by uuid references auth.users(id),
  approved_b_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verification_method text,
  verification_evidence_ref text,
  verified_at timestamptz,
  verified_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (a < b), check (requested_by in (a,b)),
  unique(family_id,a,b), unique(a,b)
);
create table app_private.private_blocks (
  blocker uuid not null references auth.users(id),
  blocked uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(blocker,blocked), check(blocker <> blocked)
);
create table app_private.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references app_private.trusted_contacts(id),
  created_at timestamptz not null default clock_timestamp()
);
create table app_private.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references app_private.conversations(id),
  sender_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  client_id uuid not null,
  body text not null check (char_length(body) between 1 and 5000),
  response text not null check (response in ('listen','reply','talk')),
  created_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  unique(sender_id,client_id), check(sender_id <> recipient_id)
);
create index messages_conversation_time on app_private.messages(conversation_id,created_at,id);
create table app_private.communication_budgets (
  user_id uuid not null references auth.users(id),
  operation text not null,
  minute timestamptz not null,
  used integer not null check(used > 0),
  primary key(user_id,operation,minute)
);

-- The only publication candidate: opaque own-user invalidations, never content.
create table api.user_invalidations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
);
alter table api.user_invalidations enable row level security;
create policy own_invalidations on api.user_invalidations for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on api.user_invalidations from public,anon,authenticated;
grant select on api.user_invalidations to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table api.user_invalidations;
  end if;
end $$;

create function app_private.communication_actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.actor();
begin
  if not app_private.account_usable(u) then raise exception 'not authorized' using errcode='42501'; end if;
  return u;
end $$;

create function app_private.communication_budget(p_user uuid,p_operation text,p_limit int) returns void
language plpgsql security definer set search_path='' as $$
declare n int;
begin
  insert into app_private.communication_budgets(user_id,operation,minute,used)
    values(p_user,p_operation,date_trunc('minute',clock_timestamp()),1)
    on conflict(user_id,operation,minute) do update set used=app_private.communication_budgets.used+1
    returning used into n;
  if n>p_limit then raise exception 'try again later' using errcode='54000'; end if;
  delete from app_private.communication_budgets where user_id=p_user and minute<clock_timestamp()-interval '1 day';
end $$;

create function app_private.invalidate_user(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into api.user_invalidations(user_id) values(p_user);
  -- Invalidation rows are hints, not an activity archive or delivery evidence.
  delete from api.user_invalidations where user_id=p_user and id not in
    (select id from api.user_invalidations where user_id=p_user order by id limit 20);
end $$;

create function app_private.lock_contact(p_contact_id uuid) returns app_private.trusted_contacts
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;
begin
  select * into c from app_private.trusted_contacts where id=p_contact_id;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.lock_family(c.family_id);
  perform pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||c.a::text||':'||c.b::text,0));
  select * into c from app_private.trusted_contacts where id=p_contact_id for update;
  return c;
end $$;

create function app_private.contact_allowed(p_contact_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.trusted_contacts c where c.id=p_contact_id
    and c.revoked_at is null and c.accepted_a_at is not null and c.accepted_b_at is not null
    and c.verified_at is not null and c.verified_until>clock_timestamp()
    and exists(select 1 from app_private.operators o where o.user_id=c.verified_by and o.scope='verification' and o.active)
    and c.verified_by not in (c.a,c.b) and app_private.account_usable(c.verified_by) and not app_private.is_guardian(c.family_id,c.verified_by)
    and app_private.is_member(c.family_id,c.a) and app_private.is_member(c.family_id,c.b)
    and (app_private.child_for_user(c.family_id,c.a) is null or
         (c.approved_a_by is not null and app_private.is_guardian(c.family_id,c.approved_a_by)))
    and (app_private.child_for_user(c.family_id,c.b) is null or
         (c.approved_b_by is not null and app_private.is_guardian(c.family_id,c.approved_b_by)))
    and not exists(select 1 from app_private.private_blocks x where
      (x.blocker=c.a and x.blocked=c.b) or (x.blocker=c.b and x.blocked=c.a)))
$$;

create function app_private.can_exchange(p_a uuid,p_b uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.trusted_contacts c where c.a=least(p_a,p_b)
    and c.b=greatest(p_a,p_b) and app_private.contact_allowed(c.id))
$$;

create function api.request_contact(p_family_id uuid,p_recipient_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); v uuid; a_id uuid; b_id uuid;
begin
  perform app_private.lock_family(p_family_id);
  if not app_private.is_member(p_family_id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_recipient_email is null or char_length(p_recipient_email)>254 or p_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'invalid contact request' using errcode='22023'; end if;
  perform app_private.communication_budget(u,'contact',5);
  select id into v from auth.users where lower(email)=lower(trim(p_recipient_email));
  -- Identical response for unknown, unrelated, blocked and duplicate targets.
  if v is null or v=u or not app_private.is_member(p_family_id,v) then return jsonb_build_object('status','requested'); end if;
  a_id:=least(u,v); b_id:=greatest(u,v);
  perform pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||a_id::text||':'||b_id::text,0));
  if exists(select 1 from app_private.private_blocks where (blocker=u and blocked=v) or (blocker=v and blocked=u)) then
    return jsonb_build_object('status','requested');
  end if;
  insert into app_private.trusted_contacts(family_id,a,b,requested_by,accepted_a_at,accepted_b_at)
    values(p_family_id,a_id,b_id,u,case when a_id=u then clock_timestamp() end,case when b_id=u then clock_timestamp() end)
    on conflict do nothing;
  perform app_private.invalidate_user(v);
  return jsonb_build_object('status','requested');
end $$;

create function api.list_contacts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'familyId',c.family_id,'a',c.a,'b',c.b,
    'aName',case when c.accepted_a_at is not null and c.accepted_b_at is not null then pa.display_name end,
    'bName',case when c.accepted_a_at is not null and c.accepted_b_at is not null then pb.display_name end,
    'acceptedByMe',case when u=c.a then c.accepted_a_at is not null when u=c.b then c.accepted_b_at is not null else null end,
    'bothAccepted',c.accepted_a_at is not null and c.accepted_b_at is not null,
    'approvalA',c.approved_a_by is not null,'approvalB',c.approved_b_by is not null,
    'verified',c.verified_at is not null and c.verified_until>clock_timestamp(),
    'revoked',c.revoked_at is not null,
    'canExchange',case when u in(c.a,c.b) then app_private.contact_allowed(c.id) else false end)
    order by c.created_at,c.id),'[]'::jsonb) into result
  from app_private.trusted_contacts c join app_private.profiles pa on pa.user_id=c.a join app_private.profiles pb on pb.user_id=c.b
  where app_private.is_member(c.family_id,u) and
    ((u in(c.a,c.b) and (u<>c.requested_by or (c.accepted_a_at is not null and c.accepted_b_at is not null)))
      or (app_private.is_guardian(c.family_id,u) and
        (app_private.child_for_user(c.family_id,c.a) is not null or app_private.child_for_user(c.family_id,c.b) is not null)));
  return result;
end $$;

create function api.accept_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if u not in(c.a,c.b) or not app_private.is_member(c.family_id,u) or c.revoked_at is not null
    or exists(select 1 from app_private.private_blocks where (blocker=c.a and blocked=c.b) or (blocker=c.b and blocked=c.a)) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update app_private.trusted_contacts set
    accepted_a_at=case when u=c.a then coalesce(accepted_a_at,clock_timestamp()) else accepted_a_at end,
    accepted_b_at=case when u=c.b then coalesce(accepted_b_at,clock_timestamp()) else accepted_b_at end
    where id=c.id;
  perform app_private.invalidate_user(c.a); perform app_private.invalidate_user(c.b);
  return jsonb_build_object('status','accepted');
end $$;

create function api.approve_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not app_private.is_guardian(c.family_id,u) or c.revoked_at is not null then raise exception 'not authorized' using errcode='42501'; end if;
  update app_private.trusted_contacts set
    approved_a_by=case when app_private.child_for_user(c.family_id,c.a) is not null then u else approved_a_by end,
    approved_b_by=case when app_private.child_for_user(c.family_id,c.b) is not null then u else approved_b_by end
    where id=c.id;
  return jsonb_build_object('status','approved','verification','stillRequired');
end $$;

create function api.verify_contact(p_contact_id uuid,p_operator_id uuid,p_method text,p_evidence_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not exists(select 1 from app_private.operators where user_id=p_operator_id and scope='verification' and active)
    or p_operator_id in(c.a,c.b) or app_private.is_guardian(c.family_id,p_operator_id)
    or c.revoked_at is not null or c.accepted_a_at is null or c.accepted_b_at is null
    or not app_private.is_member(c.family_id,c.a) or not app_private.is_member(c.family_id,c.b)
    or (app_private.child_for_user(c.family_id,c.a) is not null and not coalesce(app_private.is_guardian(c.family_id,c.approved_a_by),false))
    or (app_private.child_for_user(c.family_id,c.b) is not null and not coalesce(app_private.is_guardian(c.family_id,c.approved_b_by),false)) then
    raise exception 'independent verification required' using errcode='42501';
  end if;
  if coalesce(char_length(p_method),0) not between 1 and 80 or char_length(trim(p_method))=0
    or coalesce(char_length(p_evidence_ref),0) not between 1 and 200 or char_length(trim(p_evidence_ref))=0
    or lower(trim(p_method)) in('checkbox','email','email_confirmation','parent_approval') then
    raise exception 'verification evidence required' using errcode='22023'; end if;
  if (p_method='synthetic_fixture' and not exists(select 1 from app_private.deployment_policy where singleton and local_synthetic)) or
    (p_method<>'synthetic_fixture' and not exists(select 1 from app_private.communication_policy where singleton and nullif(verification_policy_id,'') is not null)) then
    raise exception 'reviewed verification policy required' using errcode='42501'; end if;
  update app_private.trusted_contacts set verified_by=p_operator_id,verification_method=p_method,
    verification_evidence_ref=p_evidence_ref,verified_at=clock_timestamp(),verified_until=clock_timestamp()+interval '90 days' where id=c.id;
  return jsonb_build_object('status','verified');
end $$;

create function api.revoke_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not app_private.is_member(c.family_id,u) or
    (u not in(c.a,c.b) and not app_private.is_guardian(c.family_id,u)) then raise exception 'not authorized' using errcode='42501'; end if;
  update app_private.trusted_contacts set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=c.id;
  update app_private.notification_outbox q set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null
    from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
    where q.message_id=m.id and v.contact_id=c.id and q.status in('queued','leased');
  perform app_private.invalidate_user(c.a); perform app_private.invalidate_user(c.b);
  return jsonb_build_object('status','revoked');
end $$;

create function api.block_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); f uuid; a_id uuid:=least(u,p_user_id); b_id uuid:=greatest(u,p_user_id);
begin
  if p_user_id is null or p_user_id=u or not exists(select 1 from app_private.trusted_contacts where a=a_id and b=b_id) then
    raise exception 'not authorized' using errcode='42501'; end if;
  for f in select distinct family_id from app_private.trusted_contacts where a=a_id and b=b_id order by family_id loop
    perform app_private.lock_family(f);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||a_id::text||':'||b_id::text,0));
  insert into app_private.private_blocks(blocker,blocked) values(u,p_user_id) on conflict do nothing;
  update app_private.notification_outbox q set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null
    from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
    join app_private.trusted_contacts c on c.id=v.contact_id
    where q.message_id=m.id and c.a=a_id and c.b=b_id and q.status in('queued','leased');
  perform app_private.invalidate_user(u); perform app_private.invalidate_user(p_user_id);
  return jsonb_build_object('status','blocked');
end $$;

create function api.create_conversation(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts; conversation uuid;
begin
  c:=app_private.lock_contact(p_contact_id);
  if u not in(c.a,c.b) or not app_private.contact_allowed(c.id) then raise exception 'not authorized' using errcode='42501'; end if;
  insert into app_private.conversations(contact_id) values(c.id) on conflict(contact_id) do update set contact_id=excluded.contact_id returning id into conversation;
  return jsonb_build_object('id',conversation,'contactId',c.id,'status','ready');
end $$;

create function api.list_conversations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'contactId',c.id,
    'peerId',case when u=c.a then c.b else c.a end,'canExchange',app_private.contact_allowed(c.id)) order by v.created_at,v.id),'[]'::jsonb)
  into result from app_private.conversations v join app_private.trusted_contacts c on c.id=v.contact_id
  where u in(c.a,c.b) and app_private.is_member(c.family_id,u);
  return result;
end $$;

create function api.send_message(p_conversation_id uuid,p_body text,p_client_id uuid,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts; contact uuid; m app_private.messages; recipient uuid;
begin
  select contact_id into contact from app_private.conversations where id=p_conversation_id;
  c:=app_private.lock_contact(contact);
  if u not in(c.a,c.b) or not app_private.contact_allowed(c.id) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_client_id is null or coalesce(char_length(p_body),0) not between 1 and 5000 or char_length(trim(p_body))=0
    or p_response not in('listen','reply','talk') or p_response is null then
    raise exception 'invalid message' using errcode='22023'; end if;
  -- Serialize command identity across conversations as well as this relationship.
  perform pg_advisory_xact_lock(hashtextextended('betweenus-message:'||u::text||':'||p_client_id::text,0));
  select * into m from app_private.messages where sender_id=u and client_id=p_client_id;
  if found then
    if m.conversation_id<>p_conversation_id or m.body<>p_body or m.response<>p_response then raise exception 'idempotency conflict' using errcode='22023'; end if;
    return jsonb_build_object('id',m.id,'createdAt',m.created_at,'status','saved');
  end if;
  perform app_private.communication_budget(u,'send',30);
  recipient:=case when c.a=u then c.b else c.a end;
  insert into app_private.messages(conversation_id,sender_id,recipient_id,client_id,body,response)
    values(p_conversation_id,u,recipient,p_client_id,p_body,p_response) returning * into m;
  perform app_private.invalidate_user(recipient);
  perform app_private.queue_message_notification(m.id);
  return jsonb_build_object('id',m.id,'createdAt',m.created_at,'status','saved');
end $$;

create function api.fetch_messages(p_conversation_id uuid,p_limit int default 50,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts; contact uuid; allowed boolean; result jsonb; before_time timestamptz;
begin
  select contact_id into contact from app_private.conversations where id=p_conversation_id;
  c:=app_private.lock_contact(contact);
  if u not in(c.a,c.b) or not app_private.is_member(c.family_id,u) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid page size' using errcode='22023'; end if;
  allowed:=app_private.contact_allowed(c.id);
  if p_before_id is not null then
    select created_at into before_time from app_private.messages where id=p_before_id and conversation_id=p_conversation_id
      and (sender_id=u or (recipient_id=u and (allowed or acknowledged_at is not null)));
    if not found then raise exception 'not authorized' using errcode='42501'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'senderId',q.sender_id,'body',q.body,'response',q.response,
    'createdAt',q.created_at,'status',case when q.sender_id=u then 'saved' when q.acknowledged_at is not null then 'acknowledged' else 'available' end)
    order by q.created_at,q.id),'[]'::jsonb) into result
  from (select * from app_private.messages where conversation_id=p_conversation_id
    and (sender_id=u or (recipient_id=u and (allowed or acknowledged_at is not null)))
    and (p_before_id is null or (created_at,id)<(before_time,p_before_id)) order by created_at desc,id desc limit p_limit) q;
  return jsonb_build_object('messages',result,'nextBeforeId',result->0->>'id','canExchange',allowed,'readReceipts',false);
end $$;

create function api.ack_message(p_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts; contact uuid;
begin
  select v.contact_id into contact from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
    where m.id=p_message_id and m.recipient_id=u;
  c:=app_private.lock_contact(contact);
  if not app_private.contact_allowed(c.id) then raise exception 'not authorized' using errcode='42501'; end if;
  update app_private.messages set acknowledged_at=coalesce(acknowledged_at,clock_timestamp()) where id=p_message_id and recipient_id=u;
  return jsonb_build_object('id',p_message_id,'status','acknowledged','readReceipt',false);
end $$;

create table app_private.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  reported_user_id uuid references auth.users(id),
  description text not null check(char_length(description) between 1 and 4000),
  message_id uuid references app_private.messages(id),
  selected_message_body text,
  assigned_operator uuid references auth.users(id),
  status text not null default 'open' check(status in('open','triaged','closed')),
  response text check(char_length(response)<=2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table app_private.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id),
  subject_id uuid not null references auth.users(id),
  kind text not null check(kind in('own_export','own_delete','parental_review','guardian_dispute')),
  description text not null check(char_length(description)<=2000),
  assigned_operator uuid references auth.users(id),
  status text not null default 'review_pending' check(status in('review_pending','in_review','closed')),
  response text check(char_length(response)<=2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create function app_private.independent_case_operator(p_operator uuid,p_reporter uuid,p_reported uuid,p_scope text) returns boolean
language sql security definer set search_path='' as $$
  select p_operator is not null and p_operator<>p_reporter and p_operator is distinct from p_reported
    and app_private.account_usable(p_operator)
    and exists(select 1 from app_private.operators where user_id=p_operator and scope=p_scope and active)
    and not exists(select 1 from app_private.memberships m where m.user_id=p_reporter
      and app_private.is_guardian(m.family_id,p_operator))
$$;

create function api.submit_report(p_reported_user_id uuid,p_description text,p_message_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r uuid; evidence text; permitted boolean; contact uuid; c app_private.trusted_contacts;
begin
  select ((cp.public_report_intake and cp.staffed_support_promises and dp.public_reports_enabled
      and dp.real_child_data_enabled and nullif(dp.operator_policy_id,'') is not null
      and exists(select 1 from app_private.operators o where o.user_id=cp.approved_safety_operator and o.scope='safety' and o.active))
    or (cp.synthetic_fixture_mode and dp.local_synthetic and exists(select 1 from auth.users where id=u and lower(email) ~ '@[a-z0-9.-]+\.test$')))
    into permitted from app_private.communication_policy cp cross join app_private.deployment_policy dp where cp.singleton and dp.singleton;
  if not coalesce(permitted,false) then raise exception 'report intake unavailable; safety information remains available' using errcode='42501'; end if;
  if coalesce(char_length(p_description),0) not between 1 and 4000 or char_length(trim(p_description))=0 then raise exception 'invalid report' using errcode='22023'; end if;
  perform app_private.communication_budget(u,'report',5);
  if p_reported_user_id=u or (p_reported_user_id is not null and not exists(select 1 from app_private.trusted_contacts
    where a=least(u,p_reported_user_id) and b=greatest(u,p_reported_user_id))) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_message_id is not null then
    select v.contact_id into contact from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
      where m.id=p_message_id and u in(m.sender_id,m.recipient_id);
    c:=app_private.lock_contact(contact);
    select m.body into evidence from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
      where m.id=p_message_id and (m.sender_id=u or (m.recipient_id=u and (m.acknowledged_at is not null or app_private.contact_allowed(v.contact_id))));
    if not found then raise exception 'not authorized' using errcode='42501'; end if;
  end if;
  insert into app_private.safety_reports(reporter_id,reported_user_id,description,message_id,selected_message_body)
    values(u,p_reported_user_id,p_description,p_message_id,evidence) returning id into r;
  return jsonb_build_object('id',r,'status','saved','staffedResponsePromised',false);
end $$;

create function api.assign_report(p_report_id uuid,p_operator_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r app_private.safety_reports;
begin
  select * into r from app_private.safety_reports where id=p_report_id for update;
  if not found or not app_private.independent_case_operator(p_operator_id,r.reporter_id,r.reported_user_id,'safety') then
    raise exception 'independent assigned safety operator required' using errcode='42501'; end if;
  update app_private.safety_reports set assigned_operator=p_operator_id,updated_at=clock_timestamp() where id=r.id;
end $$;

create function api.get_report(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.safety_reports;
begin
  select * into r from app_private.safety_reports where id=p_report_id;
  if not found or not (r.reporter_id=u or (r.assigned_operator=u and app_private.independent_case_operator(u,r.reporter_id,r.reported_user_id,'safety'))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('id',r.id,'reportedUserId',r.reported_user_id,'description',r.description,
    'selectedMessageBody',r.selected_message_body,'status',r.status,'response',r.response,'createdAt',r.created_at);
end $$;

create function api.update_report(p_report_id uuid,p_status text,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.safety_reports;
begin
  select * into r from app_private.safety_reports where id=p_report_id for update;
  if not found or r.assigned_operator is distinct from u or not app_private.independent_case_operator(u,r.reporter_id,r.reported_user_id,'safety') then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_status is null or p_status not in('open','triaged','closed') or coalesce(char_length(p_response),0)>2000 then
    raise exception 'invalid case update' using errcode='22023'; end if;
  update app_private.safety_reports set status=p_status,response=p_response,updated_at=clock_timestamp() where id=r.id;
  -- No automatic guardian/contact notification, even for a closed case.
  return jsonb_build_object('id',r.id,'status',p_status);
end $$;

create function api.submit_privacy_request(p_kind text,p_subject_id uuid default null,p_description text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); subject uuid:=coalesce(p_subject_id,u); r uuid;
begin
  if p_kind is null or p_kind not in('own_export','own_delete','parental_review','guardian_dispute') or p_description is null or char_length(p_description)>2000 then
    raise exception 'invalid privacy request' using errcode='22023'; end if;
  if (p_kind in('own_export','own_delete') and subject<>u) or
    (subject<>u and not exists(select 1 from app_private.children c where c.account_user_id=subject and app_private.is_guardian(c.family_id,u))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  perform app_private.communication_budget(u,'privacy',5);
  insert into app_private.privacy_requests(requester_id,subject_id,kind,description) values(u,subject,p_kind,p_description) returning id into r;
  return jsonb_build_object('id',r,'status','review_pending','journalIncluded',false,'completed',false);
end $$;

create function api.assign_privacy_request(p_request_id uuid,p_operator_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r app_private.privacy_requests;
begin
  select * into r from app_private.privacy_requests where id=p_request_id for update;
  if not found or not app_private.independent_case_operator(p_operator_id,r.requester_id,r.subject_id,'privacy') then
    raise exception 'independent assigned privacy operator required' using errcode='42501'; end if;
  update app_private.privacy_requests set assigned_operator=p_operator_id,updated_at=clock_timestamp() where id=r.id;
end $$;

create function api.get_privacy_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.privacy_requests;
begin
  select * into r from app_private.privacy_requests where id=p_request_id;
  if not found or not (r.requester_id=u or (r.assigned_operator=u and app_private.independent_case_operator(u,r.requester_id,r.subject_id,'privacy'))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('id',r.id,'kind',r.kind,'subjectId',r.subject_id,'status',r.status,'description',r.description,
    'response',r.response,'journalIncluded',false,'createdAt',r.created_at);
end $$;

create function api.update_privacy_request(p_request_id uuid,p_status text,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.privacy_requests;
begin
  select * into r from app_private.privacy_requests where id=p_request_id for update;
  if not found or r.assigned_operator is distinct from u or not app_private.independent_case_operator(u,r.requester_id,r.subject_id,'privacy') then
    raise exception 'not authorized' using errcode='42501'; end if;
  if p_status is null or p_status not in('review_pending','in_review','closed') or coalesce(char_length(p_response),0)>2000 then
    raise exception 'invalid request update' using errcode='22023'; end if;
  update app_private.privacy_requests set status=p_status,response=p_response,updated_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('id',r.id,'status',p_status,'journalIncluded',false);
end $$;

create table app_private.notification_preferences (
  user_id uuid primary key references auth.users(id),
  enabled boolean not null default false,
  timezone text not null default 'UTC',
  quiet_start int not null default 22 check(quiet_start between 0 and 23),
  quiet_end int not null default 8 check(quiet_end between 0 and 23)
);
create table app_private.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  session_id uuid not null references auth.sessions(id) on delete cascade,
  platform text not null check(platform in('ios','android')),
  token text not null check(char_length(token) between 20 and 4096),
  token_hash bytea not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table app_private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id),
  message_id uuid not null references app_private.messages(id),
  device_id uuid not null references app_private.device_tokens(id) on delete cascade,
  status text not null default 'queued' check(status in('queued','leased','provider_accepted','suppressed','failed')),
  attempts int not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz,
  lease_token uuid,
  last_outcome text check(last_outcome in('accepted','retry','invalid_token','failed','authorization','expired')),
  created_at timestamptz not null default clock_timestamp(),
  unique(message_id,device_id)
);
create index notification_work on app_private.notification_outbox(status,next_attempt_at);
create table app_private.notification_quota (
  bucket text not null,
  hour timestamptz not null,
  used int not null check(used>0),
  primary key(bucket,hour)
);

create function api.get_notification_preferences() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); p app_private.notification_preferences;
begin
  select * into p from app_private.notification_preferences where user_id=u;
  return jsonb_build_object('enabled',coalesce(p.enabled,false),'timezone',coalesce(p.timezone,'UTC'),
    'quietStart',coalesce(p.quiet_start,22),'quietEnd',coalesce(p.quiet_end,8),'deliveryOperational',false);
end $$;

create function api.set_notification_preferences(p_enabled boolean,p_timezone text default 'UTC',p_quiet_start int default 22,p_quiet_end int default 8) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();
begin
  if p_enabled is null or p_quiet_start is null or p_quiet_end is null or p_quiet_start not between 0 and 23 or p_quiet_end not between 0 and 23
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid notification preference' using errcode='22023'; end if;
  insert into app_private.notification_preferences(user_id,enabled,timezone,quiet_start,quiet_end) values(u,p_enabled,p_timezone,p_quiet_start,p_quiet_end)
    on conflict(user_id) do update set enabled=excluded.enabled,timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end;
  if not p_enabled then update app_private.notification_outbox set status='suppressed',lease_token=null,lease_until=null,last_outcome='authorization'
    where recipient_id=u and status in('queued','leased'); end if;
  return jsonb_build_object('enabled',p_enabled,'timezone',p_timezone,'quietStart',p_quiet_start,'quietEnd',p_quiet_end,'deliveryOperational',false);
end $$;

create function api.register_device(p_platform text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); session uuid:=(auth.jwt()->>'session_id')::uuid; d uuid; fingerprint bytea;
begin
  if p_platform is null or p_platform not in('ios','android') or coalesce(char_length(p_token),0) not between 20 and 4096 then
    raise exception 'invalid device token' using errcode='22023'; end if;
  perform app_private.communication_budget(u,'device',5);
  fingerprint:=sha256(convert_to(p_token,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('betweenus-device-user:'||u::text,0));
  perform pg_advisory_xact_lock(hashtextextended('betweenus-device:'||encode(fingerprint,'hex'),0));
  if exists(select 1 from app_private.device_tokens where token_hash=fingerprint and user_id<>u) then
    raise exception 'device token unavailable' using errcode='42501'; end if;
  if not exists(select 1 from app_private.device_tokens where token_hash=fingerprint) and
    (select count(*) from app_private.device_tokens where user_id=u and revoked_at is null)>=3 then
    raise exception 'device limit reached' using errcode='54000'; end if;
  insert into app_private.device_tokens(user_id,session_id,platform,token,token_hash) values(u,session,p_platform,p_token,fingerprint)
    on conflict(token_hash) do update set session_id=excluded.session_id,platform=excluded.platform,revoked_at=null returning id into d;
  return jsonb_build_object('id',d,'status','registered','deliveryOperational',false);
end $$;

create function api.revoke_device(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();
begin
  update app_private.device_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_device_id and user_id=u;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  update app_private.notification_outbox set status='suppressed',lease_token=null,lease_until=null,last_outcome='authorization'
    where device_id=p_device_id and status in('queued','leased');
  return jsonb_build_object('id',p_device_id,'status','revoked');
end $$;

create function app_private.notification_allowed(p_outbox_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.notification_outbox q
    join app_private.messages m on m.id=q.message_id join app_private.conversations v on v.id=m.conversation_id
    join app_private.device_tokens d on d.id=q.device_id join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
    join app_private.notification_preferences p on p.user_id=d.user_id
    cross join app_private.communication_policy cp
    where q.id=p_outbox_id and cp.singleton and cp.push_delivery_enabled and p.enabled
      and d.revoked_at is null and d.user_id=q.recipient_id and q.recipient_id=m.recipient_id
      and (s.not_after is null or s.not_after>clock_timestamp()) and app_private.account_usable(d.user_id)
      and app_private.contact_allowed(v.contact_id) and m.acknowledged_at is null
      and q.created_at>clock_timestamp()-interval '24 hours')
$$;

create function app_private.queue_message_notification(p_message_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m app_private.messages; device uuid; global_used int; user_used int;
begin
  select * into m from app_private.messages where id=p_message_id;
  if not found or not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return; end if;
  for device in select d.id from app_private.device_tokens d join app_private.notification_preferences p on p.user_id=d.user_id
    where d.user_id=m.recipient_id and d.revoked_at is null and p.enabled order by d.id limit 3 loop
    -- Global then user quota rows serialize independent families without count races.
    insert into app_private.notification_quota(bucket,hour,used) values('global',date_trunc('hour',clock_timestamp()),1)
      on conflict(bucket,hour) do update set used=app_private.notification_quota.used+1 returning used into global_used;
    if global_used>500 then exit; end if;
    insert into app_private.notification_quota(bucket,hour,used) values(m.recipient_id::text,date_trunc('hour',clock_timestamp()),1)
      on conflict(bucket,hour) do update set used=app_private.notification_quota.used+1 returning used into user_used;
    if user_used>20 then exit; end if;
    insert into app_private.notification_outbox(recipient_id,message_id,device_id) values(m.recipient_id,m.id,device) on conflict(message_id,device_id) do nothing;
  end loop;
  delete from app_private.notification_quota where hour<clock_timestamp()-interval '1 day';
end $$;

create function api.lease_notifications(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; q app_private.notification_outbox; c app_private.trusted_contacts; tz text; start_hour int; end_hour int; hour_now int;
  result jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid batch size' using errcode='22023'; end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result; end if;
  -- Discover without a row lock; all mutations take family -> pair -> outbox.
  for candidate in select o.id,v.contact_id from app_private.notification_outbox o join app_private.messages m on m.id=o.message_id
    join app_private.conversations v on v.id=m.conversation_id join app_private.trusted_contacts contact on contact.id=v.contact_id where
      (o.status='queued' or (o.status='leased' and o.lease_until<clock_timestamp()))
      and o.next_attempt_at<=clock_timestamp() order by contact.family_id,contact.a,contact.b,o.id limit p_limit loop
    c:=app_private.lock_contact(candidate.contact_id);
    select * into q from app_private.notification_outbox where id=candidate.id for update;
    if not (q.status='queued' or (q.status='leased' and q.lease_until<clock_timestamp())) then continue; end if;
    if not app_private.notification_allowed(q.id) or q.attempts>=5 then
      update app_private.notification_outbox set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null where id=q.id;
      continue;
    end if;
    select timezone,quiet_start,quiet_end into tz,start_hour,end_hour from app_private.notification_preferences where user_id=q.recipient_id;
    hour_now:=extract(hour from clock_timestamp() at time zone tz)::int;
    if (start_hour<end_hour and hour_now>=start_hour and hour_now<end_hour) or
      (start_hour>end_hour and (hour_now>=start_hour or hour_now<end_hour)) then
      update app_private.notification_outbox set status='queued',next_attempt_at=clock_timestamp()+interval '1 hour',lease_token=null,lease_until=null where id=q.id;
      continue;
    end if;
    update app_private.notification_outbox set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
      where id=q.id returning * into q;
    result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'leaseToken',q.lease_token,'deviceId',q.device_id,
      'platform',(select platform from app_private.device_tokens where id=q.device_id),
      'token',(select token from app_private.device_tokens where id=q.device_id),
      'payload',jsonb_build_object('title','Between Us','body','Open Between Us to check for updates.','data',jsonb_build_object('invalidationId',q.id))));
  end loop;
  return result;
end $$;

create function api.authorize_notification(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare contact uuid; c app_private.trusted_contacts;
begin
  select v.contact_id into contact from app_private.notification_outbox q join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id where q.id=p_outbox_id;
  c:=app_private.lock_contact(contact);
  return exists(select 1 from app_private.notification_outbox where id=p_outbox_id and status='leased'
    and lease_token=p_lease_token and lease_until>clock_timestamp()) and app_private.notification_allowed(p_outbox_id);
end $$;

create function api.complete_notification(p_outbox_id uuid,p_lease_token uuid,p_outcome text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare contact uuid; c app_private.trusted_contacts; q app_private.notification_outbox;
begin
  select v.contact_id into contact from app_private.notification_outbox o join app_private.messages m on m.id=o.message_id
    join app_private.conversations v on v.id=m.conversation_id where o.id=p_outbox_id;
  c:=app_private.lock_contact(contact);
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

-- Deny direct access, including the block edge and private case evidence.
do $$ declare n text; begin
  foreach n in array array['communication_policy','trusted_contacts','private_blocks','conversations','messages','communication_budgets',
    'safety_reports','privacy_requests','notification_preferences','device_tokens','notification_outbox','notification_quota'] loop
    execute format('alter table app_private.%I enable row level security',n);
    execute format('revoke all on app_private.%I from public,anon,authenticated',n);
  end loop;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='app_private' and p.proname in('communication_actor','communication_budget','invalidate_user','lock_contact','contact_allowed',
      'can_exchange','independent_case_operator','notification_allowed','queue_message_notification'))
      or (n.nspname='api' and p.proname in('request_contact','list_contacts','accept_contact','approve_contact','verify_contact','revoke_contact','block_user',
        'create_conversation','list_conversations','send_message','fetch_messages','ack_message','submit_report','assign_report','get_report','update_report',
        'submit_privacy_request','assign_privacy_request','get_privacy_request','update_privacy_request','set_notification_preferences','register_device',
        'revoke_device','get_notification_preferences','lease_notifications','authorize_notification','complete_notification')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.nspname='api' then
      if f.proname in('verify_contact','assign_report','assign_privacy_request','lease_notifications','authorize_notification','complete_notification') then
        execute format('grant execute on function %s to service_role',f.signature);
      else execute format('grant execute on function %s to authenticated',f.signature); end if;
    end if;
  end loop;
end $$;
