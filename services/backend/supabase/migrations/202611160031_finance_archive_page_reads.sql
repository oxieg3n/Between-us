begin;
-- LIMIT bounds residency keys; OFFSET 0 preserves a parameterized primary-key payload read per returned key.
-- Do not replace this with a flattenable join: the planner can otherwise hash-scan lifetime capsule history.
create or replace function api.finance_archive_page(p_scope jsonb,p_after_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];rows jsonb;more boolean;loaded integer;valid boolean;begin
  perform app_private.finance_authorize(p_scope);
  perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid archive page' using errcode='22023';end if;
  if p_after_id is not null and not exists(select 1 from app_private.finance_archive_capsules where id=p_after_id
    and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid) then raise exception 'invalid archive page' using errcode='22023';end if;
  select coalesce(array_agg(capsule_id order by capsule_id),'{}'::uuid[]) into ids from(
    select capsule_id from app_private.finance_archive_residency
      where family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid and active
        and(p_after_id is null or capsule_id>p_after_id) order by capsule_id limit p_limit+1) active_page;
  more:=cardinality(ids)>p_limit;if more then ids:=ids[1:p_limit];end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'capsule',c.payload) order by c.id),'[]'),count(*)::int,
    coalesce(bool_and(c.hash=app_private.finance_state_hash(c.payload)),true) into rows,loaded,valid
    from unnest(ids) page_id cross join lateral(
      select id,payload,hash from app_private.finance_archive_capsules
      where id=page_id and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid offset 0) c;
  if loaded<>cardinality(ids) or not valid then raise exception 'financial data unavailable' using errcode='XX001';end if;
  if octet_length(rows::text)>8388608 then raise exception 'archive page capacity review required' using errcode='54000';end if;
  return jsonb_build_object('items',rows,'nextAfterId',case when more then rows->-1->>'id' else null end);
end $$;

create or replace function api.finance_private_match_page(p_scope jsonb,p_after_id uuid default null,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[];rows jsonb;more boolean;loaded integer;valid boolean;begin
  if app_private.finance_authorize(p_scope)<>'parent' then raise exception 'not authorized' using errcode='42501';end if;
  perform app_private.finance_sync((p_scope->>'familyId')::uuid);
  perform app_private.finance_verify_source((p_scope->>'familyId')::uuid);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid private archive page' using errcode='22023';end if;
  if p_after_id is not null and not exists(select 1 from app_private.finance_private_match_capsules where id=p_after_id
    and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid) then raise exception 'invalid private archive page' using errcode='22023';end if;
  select coalesce(array_agg(capsule_id order by capsule_id),'{}'::uuid[]) into ids from(
    select capsule_id from app_private.finance_private_match_residency
      where family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid and active
        and(p_after_id is null or capsule_id>p_after_id) order by capsule_id limit p_limit+1) active_page;
  more:=cardinality(ids)>p_limit;if more then ids:=ids[1:p_limit];end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'capsule',c.payload) order by c.id),'[]'),count(*)::int,
    coalesce(bool_and(c.hash=app_private.finance_state_hash(c.payload)),true) into rows,loaded,valid
    from unnest(ids) page_id cross join lateral(
      select id,payload,hash from app_private.finance_private_match_capsules
      where id=page_id and family_id=(p_scope->>'familyId')::uuid and child_id=(p_scope->>'childId')::uuid offset 0) c;
  if loaded<>cardinality(ids) or not valid then raise exception 'financial data unavailable' using errcode='XX001';end if;
  if octet_length(rows::text)>8388608 then raise exception 'private archive page capacity review required' using errcode='54000';end if;
  return jsonb_build_object('items',rows,'nextAfterId',case when more then rows->-1->>'id' else null end);
end $$;
revoke all on function api.finance_archive_page(jsonb,uuid,integer),api.finance_private_match_page(jsonb,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function api.finance_archive_page(jsonb,uuid,integer),api.finance_private_match_page(jsonb,uuid,integer) to service_role;
commit;
