-- Receipt batches must acquire every involved family before any relationship/receipt row.
-- No delivery policy is enabled by this migration.
create or replace function api.lease_notification_receipts(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; ids uuid[]; f uuid; c app_private.trusted_contacts;
  r app_private.notification_receipts; result jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid batch size' using errcode='22023'; end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result; end if;
  select array_agg(outbox_id) into ids from (
    select n.outbox_id from app_private.notification_receipts n
    join app_private.notification_outbox q on q.id=n.outbox_id join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id join app_private.trusted_contacts contact on contact.id=v.contact_id
    where (n.status='pending' or (n.status='leased' and n.lease_until<clock_timestamp())) and n.next_attempt_at<=clock_timestamp()
    order by contact.family_id,contact.a,contact.b,n.outbox_id limit p_limit
  ) ready;
  -- Snapshot once: discovering another candidate after taking a pair lock could add a lower family.
  for f in select distinct family from app_private.notification_receipts n
    join app_private.notification_outbox q on q.id=n.outbox_id join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id
    cross join lateral app_private.contact_family_ids(v.contact_id) family
    where n.outbox_id=any(ids) order by family loop perform app_private.lock_family(f); end loop;
  for candidate in select n.outbox_id,v.contact_id from app_private.notification_receipts n
    join app_private.notification_outbox q on q.id=n.outbox_id join app_private.messages m on m.id=q.message_id
    join app_private.conversations v on v.id=m.conversation_id join app_private.trusted_contacts contact on contact.id=v.contact_id
    where n.outbox_id=any(ids) order by contact.a,contact.b,n.outbox_id loop
    c:=app_private.lock_contact(candidate.contact_id);
    select * into r from app_private.notification_receipts where outbox_id=candidate.outbox_id for update;
    if not found or not (r.status='pending' or (r.status='leased' and r.lease_until<clock_timestamp()))
      or r.next_attempt_at>clock_timestamp() then continue; end if;
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

revoke all on function api.lease_notification_receipts(int) from public,anon,authenticated,service_role;
grant execute on function api.lease_notification_receipts(int) to service_role;
