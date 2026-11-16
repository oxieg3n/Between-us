begin;
-- Opaque saved outcome only. An absent/pruned row is UNKNOWN, never proof of non-delivery.
create function api.get_message_receipt(p_client_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid; v_message app_private.messages;
begin
  v_actor:=app_private.actor();
  if not coalesce(app_private.account_usable(v_actor),false) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if p_client_id is null then raise exception 'invalid request' using errcode='22023'; end if;
  -- Sender equality is unconditional; no recipient, guardian, operator or metadata override.
  select m.* into v_message from app_private.messages m
    where m.sender_id=v_actor and m.client_id=p_client_id;
  if not found then return jsonb_build_object('status','unknown','clientId',p_client_id); end if;
  return jsonb_build_object('status','saved','clientId',v_message.client_id,'messageId',v_message.id,
    'conversationId',v_message.conversation_id,'peerId',v_message.recipient_id);
end $$;
revoke all on function api.get_message_receipt(uuid) from public,anon,authenticated,service_role;
grant execute on function api.get_message_receipt(uuid) to authenticated;
comment on function api.get_message_receipt(uuid) is
  'Current active managed sender-only opaque receipt. No content/read receipt. Unknown never proves unsent; does not authorize retries.';
commit;
