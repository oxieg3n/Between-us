-- Owner reviews/renames/applies serially. Preview reads are content delivery, never an unlocked snapshot.
create function api.list_conversations_page(p_limit int default 50,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=app_private.communication_actor();
  ids uuid[];contacts uuid[];selected_id uuid;c app_private.trusted_contacts;
  before_time timestamptz;last_time timestamptz;last_id uuid;created_time timestamptz;
  allowed boolean;peer uuid;peer_name text;preview_body text;message_time timestamptz;
  result jsonb:='[]'::jsonb;has_more boolean:=false;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid page size' using errcode='22023';end if;
  if p_before_id is not null then
    select v.created_at into before_time from app_private.conversations v
      join app_private.trusted_contacts t on t.id=v.contact_id
      where v.id=p_before_id and u in(t.a,t.b)
        and app_private.contact_endpoint_usable(u,case when u=t.a then t.family_a_id else t.family_b_id end);
    if not found then raise exception 'not authorized' using errcode='42501';end if;
  end if;
  -- Candidate metadata only. At most 50 relationships enter the globally ordered lock scope.
  select coalesce(array_agg(q.id order by q.created_at desc,q.id desc),'{}'::uuid[]),
         coalesce(array_agg(q.contact_id order by q.created_at desc,q.id desc),'{}'::uuid[])
    into ids,contacts from (
      select v.id,v.contact_id,v.created_at from app_private.conversations v
        join app_private.trusted_contacts t on t.id=v.contact_id
        where u in(t.a,t.b)
          and app_private.contact_endpoint_usable(u,case when u=t.a then t.family_a_id else t.family_b_id end)
          and (p_before_id is null or (v.created_at,v.id)<(before_time,p_before_id))
        order by v.created_at desc,v.id desc limit p_limit
    ) q;
  -- Prelock the WHOLE family union before any contact-pair/body/name read (013 ordering).
  perform app_private.domain_lock_scope('{}'::uuid[],contacts);
  if app_private.communication_actor()<>u then raise exception 'not authorized' using errcode='42501';end if;
  foreach selected_id in array ids loop
    select v.created_at into created_time from app_private.conversations v where v.id=selected_id;
    last_time:=created_time;last_id:=selected_id;
    select t.* into c from app_private.trusted_contacts t join app_private.conversations v on v.contact_id=t.id where v.id=selected_id;
    -- Membership/consent/revocation may have changed while waiting for the lock scope.
    if not found or u not in(c.a,c.b) or not app_private.contact_endpoint_usable(u,case when u=c.a then c.family_a_id else c.family_b_id end) then continue;end if;
    if app_private.communication_actor()<>u then raise exception 'not authorized' using errcode='42501';end if;
    allowed:=app_private.contact_allowed(c.id);
    peer:=case when u=c.a then c.b else c.a end;
    peer_name:='Connection unavailable';
    if allowed then
      select coalesce(nullif(btrim(p.display_name),''),'Connection unavailable') into peer_name from app_private.profiles p where p.user_id=peer;
      peer_name:=coalesce(peer_name,'Connection unavailable');
    end if;
    -- Exactly fetch_messages' delivery boundary: unacknowledged incoming requires CURRENT permission.
    preview_body:=null;message_time:=null;
    select left(m.body,160),m.created_at into preview_body,message_time from app_private.messages m
      where m.conversation_id=selected_id
        and (m.sender_id=u or (m.recipient_id=u and (allowed or m.acknowledged_at is not null)))
      order by m.created_at desc,m.id desc limit 1;
    result:=result||jsonb_build_array(jsonb_build_object('id',selected_id,'contactId',c.id,'peerId',peer,
      'canExchange',allowed,'peerName',peer_name,'preview',preview_body,'lastMessageAt',message_time,'createdAt',created_time));
  end loop;
  if last_id is not null then
    select exists(select 1 from app_private.conversations v join app_private.trusted_contacts t on t.id=v.contact_id
      where u in(t.a,t.b) and app_private.contact_endpoint_usable(u,case when u=t.a then t.family_a_id else t.family_b_id end)
        and (v.created_at,v.id)<(last_time,last_id)) into has_more;
  end if;
  return jsonb_build_object('conversations',result,'hasMore',has_more,'nextBeforeId',case when has_more then last_id else null end);
end $$;

-- Preserve the exact zero-argument array contract; new consumers must use the page RPC for older rows.
create or replace function api.list_conversations() returns jsonb
language plpgsql security definer set search_path='' as $$
begin return api.list_conversations_page(50,null)->'conversations';end $$;

revoke all on function api.list_conversations_page(int,uuid),api.list_conversations() from public,anon,authenticated,service_role;
grant execute on function api.list_conversations_page(int,uuid),api.list_conversations() to authenticated;
