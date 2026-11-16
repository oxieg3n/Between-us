-- Owner reviews/renames/applies serially. A response preference is an optional author request, not a schedule.
alter table app_private.messages drop constraint messages_response_check;
alter table app_private.messages add constraint messages_response_check check(response in('listen','reply','later','talk'));

-- Preserve the existing send protocol; only the accepted response-value set expands.
create or replace function api.send_message(p_conversation_id uuid,p_body text,p_client_id uuid,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor(); c app_private.trusted_contacts; contact uuid; m app_private.messages; recipient uuid;
begin
  select contact_id into contact from app_private.conversations where id=p_conversation_id;
  c:=app_private.lock_contact(contact);
  if u not in(c.a,c.b) or not app_private.contact_allowed(c.id) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_client_id is null or coalesce(char_length(p_body),0) not between 1 and 5000 or char_length(trim(p_body))=0
    or p_response not in('listen','reply','later','talk') or p_response is null then
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

revoke all on function api.send_message(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function api.send_message(uuid,text,uuid,text) to authenticated;
