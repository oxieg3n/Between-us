-- Owner reviews/renames/applies serially. Membership administration never grants another author's account access.
create function api.list_family_members(p_family_id uuid,p_limit int default 50,p_before_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();result jsonb;last_user uuid;has_more boolean:=false;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid page size' using errcode='22023';end if;
  if p_family_id is null or not app_private.is_guardian(p_family_id,u) then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.lock_family(p_family_id);
  if app_private.actor()<>u or not app_private.is_guardian(p_family_id,u) then raise exception 'not authorized' using errcode='42501';end if;
  if p_before_user_id is not null and not exists(select 1 from app_private.memberships m join app_private.profiles p on p.user_id=m.user_id
    where m.family_id=p_family_id and m.user_id=p_before_user_id and m.status='active' and app_private.is_member(m.family_id,m.user_id)
      and ((m.role='guardian' and p.kind='parent') or (m.role='child' and p.kind='child'))) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',q.user_id,'displayName',q.display_name,'kind',q.kind,
    'role',q.role,'childId',q.child_id,'currentOwn',q.user_id=u) order by q.user_id desc),'[]'::jsonb) into result from (
    select m.user_id,coalesce(nullif(btrim(p.display_name),''),'Family member') display_name,p.kind,m.role,m.child_id
      from app_private.memberships m join app_private.profiles p on p.user_id=m.user_id
      where m.family_id=p_family_id and m.status='active' and app_private.is_member(m.family_id,m.user_id)
        and ((m.role='guardian' and p.kind='parent') or (m.role='child' and p.kind='child'))
        and (p_before_user_id is null or m.user_id<p_before_user_id)
      order by m.user_id desc limit p_limit
  ) q;
  last_user:=(result->-1->>'userId')::uuid;
  if last_user is not null then
    select exists(select 1 from app_private.memberships m join app_private.profiles p on p.user_id=m.user_id
      where m.family_id=p_family_id and m.status='active' and m.user_id<last_user and app_private.is_member(m.family_id,m.user_id)
        and ((m.role='guardian' and p.kind='parent') or (m.role='child' and p.kind='child'))) into has_more;
  end if;
  return jsonb_build_object('members',result,'hasMore',has_more,'nextBeforeUserId',case when has_more then last_user else null end);
end $$;

-- The existing revoke_membership function remains the sole removal/last-guardian authority.
revoke all on function api.list_family_members(uuid,int,uuid) from public,anon,authenticated,service_role;
grant execute on function api.list_family_members(uuid,int,uuid) to authenticated;
