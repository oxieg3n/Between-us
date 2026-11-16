-- Metadata only for a bounded, already-unlocked local writing lifetime. Never offline login or server authority.
begin;

create function api.get_journal_session_lease() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare verified jsonb;u uuid;s uuid;expires numeric;deadline timestamptz;consent_deadline timestamptz;
  author_kind text;checked_at timestamptz;remaining numeric;
begin
  -- Reuse the current managed actor, issuer allowlist and exact authenticated role checks.
  verified:=api.get_verified_session();
  u:=(verified->>'sub')::uuid;s:=(verified->>'session_id')::uuid;
  if not coalesce(app_private.account_usable(u),false)
    or jsonb_typeof(auth.jwt()->'exp') is distinct from 'number' or length(auth.jwt()->>'exp')>24 then
    raise exception 'not authorized' using errcode='42501';end if;
  expires:=(verified->>'exp')::numeric;
  if expires::text in('NaN','Infinity','-Infinity') then raise exception 'not authorized' using errcode='42501';end if;
  select session.not_after into deadline from auth.sessions session where session.id=s and session.user_id=u for share;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  select kind into author_kind from app_private.profiles where user_id=u;
  if author_kind='child' then
    -- Exact usable-child relationship constraints, with current DB time instead of transaction-start now().
    -- This metadata read adds no consent/family lock after actor's managed-session lock.
    select min(co.expires_at) into consent_deadline from app_private.children child
      join app_private.memberships m on m.child_id=child.id and m.family_id=child.family_id
      join app_private.consents co on co.child_id=child.id and co.family_id=child.family_id
      join app_private.memberships gm on gm.family_id=co.family_id and gm.user_id=co.guardian_user_id
      join app_private.profiles gp on gp.user_id=gm.user_id
      where child.account_user_id=u and child.state='active' and m.user_id=u and m.role='child' and m.status='active'
        and co.status='verified' and co.withdrawn_at is null and co.revoked_at is null and co.expires_at>clock_timestamp()
        and gm.role='guardian' and gm.status='active' and gp.kind='parent' and gp.state='active';
    if consent_deadline is null or not isfinite(consent_deadline) then raise exception 'not authorized' using errcode='42501';end if;
  end if;
  -- Do not derive expiry from transaction-start now(), a device clock or an untrusted timestamp argument.
  checked_at:=clock_timestamp();
  remaining:=floor(least(900000::numeric,(expires-extract(epoch from checked_at))*1000));
  if deadline is not null then
    if not isfinite(deadline) then raise exception 'not authorized' using errcode='42501';end if;
    remaining:=least(remaining,floor(extract(epoch from deadline-checked_at)*1000));
  end if;
  if consent_deadline is not null then remaining:=least(remaining,floor(extract(epoch from consent_deadline-checked_at)*1000));end if;
  if remaining is null or remaining<1 then raise exception 'not authorized' using errcode='42501';end if;
  return jsonb_build_object('issuer',verified->>'iss','subject',u,'sessionId',s,'remainingMs',remaining::int);
end $$;

revoke all on function api.get_journal_session_lease() from public,anon,authenticated,service_role;
grant execute on function api.get_journal_session_lease() to authenticated;

commit;
