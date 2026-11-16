-- Pending owner integration: no delivery policy is enabled by this migration.
create table app_private.notification_receipts (
  outbox_id uuid primary key references app_private.notification_outbox(id) on delete cascade,
  ticket_id text not null unique check(ticket_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  dispatch_lease_token uuid not null,
  status text not null default 'pending' check(status in('pending','leased','provider_received','suppressed','failed','expired')),
  attempts int not null default 0 check(attempts between 0 and 8),
  next_attempt_at timestamptz not null default clock_timestamp()+interval '15 minutes',
  lease_until timestamptz,
  lease_token uuid,
  last_outcome text check(last_outcome in('provider_received','retry','invalid_token','failed','authorization','expired')),
  created_at timestamptz not null default clock_timestamp()
);
create index notification_receipt_work on app_private.notification_receipts(status,next_attempt_at);
alter table app_private.notification_receipts enable row level security;
revoke all on app_private.notification_receipts from public,anon,authenticated,service_role;

-- Persist Expo acceptance and its receipt identity atomically. Never requeue after a known acceptance.
create function api.record_notification_ticket(p_outbox_id uuid,p_lease_token uuid,p_ticket_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare contact uuid; c app_private.trusted_contacts; q app_private.notification_outbox; r app_private.notification_receipts; allowed boolean;
begin
  if p_ticket_id is null or p_ticket_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'invalid ticket' using errcode='22023'; end if;
  select v.contact_id into contact from app_private.notification_outbox o join app_private.messages m on m.id=o.message_id
    join app_private.conversations v on v.id=m.conversation_id where o.id=p_outbox_id;
  c:=app_private.lock_contact(contact);
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

create function api.lease_notification_receipts(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; c app_private.trusted_contacts; r app_private.notification_receipts; result jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023'; end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result; end if;
  for candidate in select n.outbox_id,v.contact_id from app_private.notification_receipts n
    join app_private.notification_outbox q on q.id=n.outbox_id join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id join app_private.trusted_contacts contact on contact.id=v.contact_id
    where (n.status='pending' or (n.status='leased' and n.lease_until<clock_timestamp())) and n.next_attempt_at<=clock_timestamp()
    order by contact.family_id,contact.a,contact.b,n.outbox_id limit p_limit loop
    c:=app_private.lock_contact(candidate.contact_id);
    select * into r from app_private.notification_receipts where outbox_id=candidate.outbox_id for update;
    if not (r.status='pending' or (r.status='leased' and r.lease_until<clock_timestamp())) then continue; end if;
    if r.created_at<=clock_timestamp()-interval '24 hours' or r.attempts>=8 then
      update app_private.notification_receipts set status='expired',last_outcome='expired',lease_until=null,lease_token=null where outbox_id=r.outbox_id;
      continue;
    end if;
    if not app_private.notification_allowed(r.outbox_id) or not exists(select 1 from app_private.notification_outbox where id=r.outbox_id and status='provider_accepted') then
      update app_private.notification_receipts set status='suppressed',last_outcome='authorization',lease_until=null,lease_token=null where outbox_id=r.outbox_id;
      continue;
    end if;
    update app_private.notification_receipts set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
      where outbox_id=r.outbox_id returning * into r;
    result:=result||jsonb_build_array(jsonb_build_object('id',r.outbox_id,'leaseToken',r.lease_token,'ticketId',r.ticket_id));
  end loop;
  return result;
end $$;

create function api.authorize_notification_receipt(p_outbox_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare contact uuid; c app_private.trusted_contacts;
begin
  select v.contact_id into contact from app_private.notification_outbox q join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id where q.id=p_outbox_id;
  c:=app_private.lock_contact(contact);
  return exists(select 1 from app_private.notification_receipts r join app_private.notification_outbox q on q.id=r.outbox_id
    where r.outbox_id=p_outbox_id and r.status='leased' and r.lease_token=p_lease_token and r.lease_until>clock_timestamp()
      and r.created_at>clock_timestamp()-interval '24 hours' and q.status='provider_accepted') and app_private.notification_allowed(p_outbox_id);
end $$;

create function api.complete_notification_receipt(p_outbox_id uuid,p_lease_token uuid,p_outcome text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare contact uuid; c app_private.trusted_contacts; r app_private.notification_receipts; allowed boolean;
begin
  if p_outcome is null or p_outcome not in('provider_received','retry','invalid_token','failed') then raise exception 'invalid receipt outcome' using errcode='22023'; end if;
  select v.contact_id into contact from app_private.notification_outbox q join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id where q.id=p_outbox_id;
  c:=app_private.lock_contact(contact);
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

-- Run separately even when transport is disabled; no provider lookup or message deletion is needed.
create function api.purge_notification_receipts(p_limit int default 20) returns int
language plpgsql security definer set search_path='' as $$
declare removed int;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023'; end if;
  with doomed as (select outbox_id from app_private.notification_receipts where created_at<=clock_timestamp()-interval '24 hours'
    order by created_at,outbox_id limit p_limit for update skip locked)
  delete from app_private.notification_receipts r using doomed d where r.outbox_id=d.outbox_id;
  get diagnostics removed=row_count;
  return removed;
end $$;

revoke all on function api.record_notification_ticket(uuid,uuid,text),api.lease_notification_receipts(int),
  api.authorize_notification_receipt(uuid,uuid),api.complete_notification_receipt(uuid,uuid,text),api.purge_notification_receipts(int)
  from public,anon,authenticated,service_role;
grant execute on function api.record_notification_ticket(uuid,uuid,text),api.lease_notification_receipts(int),
  api.authorize_notification_receipt(uuid,uuid),api.complete_notification_receipt(uuid,uuid,text),api.purge_notification_receipts(int) to service_role;
