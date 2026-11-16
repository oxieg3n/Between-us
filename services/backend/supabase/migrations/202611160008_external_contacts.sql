-- External relationships grant communication only, never family membership or finance authority.
alter table app_private.trusted_contacts add column external_connection boolean not null default false;
alter table app_private.trusted_contacts add column family_a_id uuid references app_private.families(id);
alter table app_private.trusted_contacts add column family_b_id uuid references app_private.families(id);
alter table app_private.trusted_contacts add column review_required boolean not null default false;
update app_private.trusted_contacts set family_a_id=family_id,family_b_id=family_id;

create function app_private.bind_legacy_contact_families() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not new.external_connection then new.family_a_id:=new.family_id;new.family_b_id:=new.family_id;end if;
  return new;
end $$;
create trigger bind_legacy_contact_families before insert on app_private.trusted_contacts
  for each row execute function app_private.bind_legacy_contact_families();

create table app_private.external_contact_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app_private.families(id),
  subject_user_id uuid not null references auth.users(id),
  requested_by uuid not null references auth.users(id),
  recipient_email text not null check(recipient_email=lower(trim(recipient_email)) and char_length(recipient_email) between 3 and 254),
  approved_by uuid references auth.users(id),
  source_accepted_at timestamptz,
  token_hash bytea unique,
  issued_at timestamptz,
  expires_at timestamptz,
  consumed_by uuid references auth.users(id),
  consumed_at timestamptz,
  contact_id uuid references app_private.trusted_contacts(id),
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create table app_private.contact_review_flags (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references app_private.trusted_contacts(id),
  reason text not null check(reason in('guardian_overlap','guardian_dispute','safety_review')),
  evidence_reference text,
  operator_id uuid references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
alter table app_private.external_contact_invitations enable row level security;
alter table app_private.contact_review_flags enable row level security;
revoke all on app_private.external_contact_invitations,app_private.contact_review_flags from public,anon,authenticated;

create function app_private.contact_family_ids(p_contact_id uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct f from app_private.trusted_contacts c
    cross join lateral unnest(array[c.family_id,c.family_a_id,c.family_b_id]) f
    where c.id=p_contact_id and f is not null order by f;
$$;
create or replace function app_private.lock_contact(p_contact_id uuid) returns app_private.trusted_contacts
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;f uuid;
begin
  if p_contact_id is null then raise exception 'not authorized' using errcode='42501';end if;
  select * into c from app_private.trusted_contacts where id=p_contact_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  for f in select * from app_private.contact_family_ids(c.id) loop perform app_private.lock_family(f);end loop;
  perform pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||c.a::text||':'||c.b::text,0));
  select * into c from app_private.trusted_contacts where id=p_contact_id for update;
  return c;
end $$;

create function app_private.contact_child_family(p_user_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select c.family_id from app_private.children c join app_private.profiles p on p.user_id=c.account_user_id
    where c.account_user_id=p_user_id and p.kind='child';
$$;
create function app_private.contact_endpoint_usable(p_user_id uuid,p_family_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.account_usable(p_user_id) and exists(select 1 from app_private.profiles p where p.user_id=p_user_id and
    ((p.kind='parent' and (p_family_id is null or app_private.is_member(p_family_id,p_user_id))) or
     (p.kind='child' and p_family_id is not null and app_private.child_for_user(p_family_id,p_user_id) is not null)));
$$;
create function app_private.contact_guardian(p_contact_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.trusted_contacts c where c.id=p_contact_id and
    ((app_private.contact_child_family(c.a)=c.family_a_id and app_private.is_guardian(c.family_a_id,p_user_id)) or
     (app_private.contact_child_family(c.b)=c.family_b_id and app_private.is_guardian(c.family_b_id,p_user_id))));
$$;
create function app_private.contact_approvals_current(p_contact_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.trusted_contacts c where c.id=p_contact_id and
    (app_private.contact_child_family(c.a) is null or coalesce(app_private.is_guardian(c.family_a_id,c.approved_a_by),false)) and
    (app_private.contact_child_family(c.b) is null or coalesce(app_private.is_guardian(c.family_b_id,c.approved_b_by),false)));
$$;
create function app_private.contact_verifier_independent(p_contact_id uuid,p_operator_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_operator_id is not null and app_private.account_usable(p_operator_id) and exists(
    select 1 from app_private.operators o join app_private.trusted_contacts c on c.id=p_contact_id
    where o.user_id=p_operator_id and o.scope='verification' and o.active and p_operator_id not in(c.a,c.b)
      and p_operator_id is distinct from c.approved_a_by and p_operator_id is distinct from c.approved_b_by
      and not exists(select 1 from app_private.contact_family_ids(c.id) f where app_private.is_guardian(f,p_operator_id)));
$$;
create or replace function app_private.contact_allowed(p_contact_id uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from app_private.trusted_contacts c where c.id=p_contact_id and c.revoked_at is null and not c.review_required
    and c.accepted_a_at is not null and c.accepted_b_at is not null
    and c.verified_at is not null and c.verified_until>clock_timestamp()
    and app_private.contact_endpoint_usable(c.a,c.family_a_id) and app_private.contact_endpoint_usable(c.b,c.family_b_id)
    and app_private.contact_approvals_current(c.id) and app_private.contact_verifier_independent(c.id,c.verified_by)
    and not exists(select 1 from app_private.private_blocks x where (x.blocker=c.a and x.blocked=c.b) or (x.blocker=c.b and x.blocked=c.a)));
$$;
create function app_private.suppress_contact_notifications(p_contact_id uuid) returns void
language sql security definer set search_path='' as $$
  update app_private.notification_outbox q set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null
    from app_private.messages m join app_private.conversations v on v.id=m.conversation_id
    where q.message_id=m.id and v.contact_id=p_contact_id and q.status in('queued','leased');
$$;
create function app_private.flag_guardian_overlap(p_contact_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;
begin
  select * into c from app_private.trusted_contacts where id=p_contact_id;
  if c.external_connection and c.family_a_id is distinct from c.family_b_id
    and app_private.contact_child_family(c.a) is not null and app_private.contact_child_family(c.b) is not null
    and ((c.approved_a_by is not null and app_private.is_guardian(c.family_b_id,c.approved_a_by)) or
         (c.approved_b_by is not null and app_private.is_guardian(c.family_a_id,c.approved_b_by))) then
    update app_private.trusted_contacts set review_required=true where id=c.id;
    if not exists(select 1 from app_private.contact_review_flags where contact_id=c.id and reason='guardian_overlap') then
      insert into app_private.contact_review_flags(contact_id,reason) values(c.id,'guardian_overlap');
    end if;
    perform app_private.suppress_contact_notifications(c.id);
  end if;
end $$;

create or replace function app_private.independent_case_operator(p_operator uuid,p_reporter uuid,p_reported uuid,p_scope text) returns boolean
language sql security definer set search_path='' as $$
  select coalesce(p_operator is not null and p_operator<>p_reporter and p_operator is distinct from p_reported
    and app_private.account_usable(p_operator)
    and exists(select 1 from app_private.operators where user_id=p_operator and scope=p_scope and active)
    and not exists(select 1 from app_private.memberships m where m.user_id in(p_reporter,p_reported)
      and app_private.is_guardian(m.family_id,p_operator)),false);
$$;

create function app_private.lock_external_invitation(p_invitation_id uuid,p_extra_family uuid default null)
returns app_private.external_contact_invitations
language plpgsql security definer set search_path='' as $$
declare invitation app_private.external_contact_invitations;f uuid;c app_private.trusted_contacts;
begin
  -- This invitation mutex precedes family/pair locks; ordinary contact RPCs never acquire it.
  perform pg_advisory_xact_lock(hashtextextended('betweenus-external-invite:'||p_invitation_id::text,0));
  select * into invitation from app_private.external_contact_invitations where id=p_invitation_id;
  if not found then raise exception 'not authorized' using errcode='42501';end if;
  for f in select distinct family_id from (
    select invitation.family_id as family_id union all select p_extra_family
    union all select * from app_private.contact_family_ids(invitation.contact_id)
  ) families where family_id is not null order by family_id loop perform app_private.lock_family(f);end loop;
  if invitation.contact_id is not null then c:=app_private.lock_contact(invitation.contact_id);end if;
  select * into invitation from app_private.external_contact_invitations where id=p_invitation_id for update;
  return invitation;
end $$;
create function app_private.issue_external_invitation(p_invitation_id uuid,p_guardian uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation app_private.external_contact_invitations;token text;
begin
  invitation:=app_private.lock_external_invitation(p_invitation_id);
  if not app_private.is_guardian(invitation.family_id,p_guardian) or invitation.issued_at is not null
    or invitation.revoked_at is not null or invitation.created_at<clock_timestamp()-interval '7 days'
    or not app_private.is_member(invitation.family_id,invitation.subject_user_id) then
    raise exception 'not authorized' using errcode='42501';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update app_private.external_contact_invitations set approved_by=p_guardian,token_hash=extensions.digest(token,'sha256'),
    issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 day' where id=invitation.id;
  return jsonb_build_object('invitationId',invitation.id,'token',token,'status','readyToShare','delivery','notSent',
    'expiresAt',clock_timestamp()+interval '1 day');
end $$;

create function api.request_external_contact(p_family_id uuid,p_recipient_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();
begin
  perform app_private.lock_family(p_family_id);
  if app_private.child_for_user(p_family_id,u) is null then raise exception 'not authorized' using errcode='42501';end if;
  if p_recipient_email is null or char_length(p_recipient_email)>254 or p_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or exists(select 1 from app_private.deployment_policy where singleton and local_synthetic and lower(trim(p_recipient_email)) !~ '@[a-z0-9.-]+\.test$') then
    raise exception 'invalid contact request' using errcode='22023';end if;
  perform app_private.communication_budget(u,'external_contact',5);
  insert into app_private.external_contact_invitations(family_id,subject_user_id,requested_by,recipient_email,source_accepted_at)
    values(p_family_id,u,u,lower(trim(p_recipient_email)),clock_timestamp());
  -- No account lookup, in-app stranger notification or recipient-dependent result.
  return jsonb_build_object('status','requested');
end $$;
create function api.invite_external_contact(p_family_id uuid,p_child_id uuid,p_recipient_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();invitation uuid;subject_user uuid;
begin
  -- The new invitation has no recipient identity/family until authenticated redemption.
  if p_child_id is null then subject_user:=u;
  else select account_user_id into subject_user from app_private.children where id=p_child_id and family_id=p_family_id;end if;
  if subject_user is null or not app_private.is_guardian(p_family_id,u) or not app_private.is_member(p_family_id,subject_user)
    or (subject_user<>u and app_private.child_for_user(p_family_id,subject_user) is null) then
    raise exception 'not authorized' using errcode='42501';end if;
  if p_recipient_email is null or char_length(p_recipient_email)>254 or p_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or exists(select 1 from app_private.deployment_policy where singleton and local_synthetic and lower(trim(p_recipient_email)) !~ '@[a-z0-9.-]+\.test$') then
    raise exception 'invalid contact request' using errcode='22023';end if;
  perform app_private.communication_budget(u,'external_contact',5);
  insert into app_private.external_contact_invitations(family_id,subject_user_id,requested_by,recipient_email,source_accepted_at)
    values(p_family_id,subject_user,u,lower(trim(p_recipient_email)),case when subject_user=u then clock_timestamp() end)
    returning id into invitation;
  return app_private.issue_external_invitation(invitation,u);
end $$;
create function api.list_external_contact_requests() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'familyId',r.family_id,'subjectUserId',r.subject_user_id,
    'subjectChildId',(select child.id from app_private.children child where child.family_id=r.family_id and child.account_user_id=r.subject_user_id),
    'subjectName',p.display_name,'recipientEmail',r.recipient_email,'sourceAccepted',r.source_accepted_at is not null,
    'status',case when r.revoked_at is not null then 'revoked' when coalesce(r.expires_at,r.created_at+interval '7 days')<clock_timestamp()
      then 'expired' when r.issued_at is null then 'approvalRequired' when app_private.contact_allowed(r.contact_id) then 'connected' else 'pending' end,
    'expiresAt',r.expires_at) order by r.created_at desc,r.id),'[]'::jsonb) into result
  from (select * from app_private.external_contact_invitations invitation where invitation.subject_user_id=u
      or app_private.is_guardian(invitation.family_id,u) order by invitation.created_at desc,invitation.id limit 50) r
    join app_private.profiles p on p.user_id=r.subject_user_id;
  return result;
end $$;
create function api.approve_external_contact_request(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();
begin return app_private.issue_external_invitation(p_invitation_id,u);end $$;
create function api.accept_external_contact_source(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();r app_private.external_contact_invitations;
begin
  r:=app_private.lock_external_invitation(p_invitation_id);
  if r.subject_user_id<>u or not app_private.is_member(r.family_id,u) or r.issued_at is null
    or r.revoked_at is not null or r.expires_at<=clock_timestamp() then raise exception 'not authorized' using errcode='42501';end if;
  update app_private.external_contact_invitations set source_accepted_at=coalesce(source_accepted_at,clock_timestamp()) where id=r.id;
  if r.contact_id is not null then
    update app_private.trusted_contacts set accepted_a_at=case when a=u then coalesce(accepted_a_at,clock_timestamp()) else accepted_a_at end,
      accepted_b_at=case when b=u then coalesce(accepted_b_at,clock_timestamp()) else accepted_b_at end where id=r.contact_id and revoked_at is null;
  end if;
  return jsonb_build_object('status','accepted');
end $$;
create function api.accept_external_contact_invite(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();r app_private.external_contact_invitations;invitation uuid;
  target_family uuid;source_child uuid;a_id uuid;b_id uuid;contact uuid;source_is_a boolean;
begin
  if p_token is null or char_length(p_token)<>64 then raise exception 'not authorized' using errcode='42501';end if;
  select id into invitation from app_private.external_contact_invitations where token_hash=extensions.digest(p_token,'sha256');
  if invitation is null then raise exception 'not authorized' using errcode='42501';end if;
  target_family:=app_private.contact_child_family(u);
  r:=app_private.lock_external_invitation(invitation,target_family);
  if r.revoked_at is not null or r.issued_at is null or r.expires_at<=clock_timestamp() or r.consumed_at is not null
    or r.subject_user_id=u or not exists(select 1 from auth.users where id=u and lower(email)=r.recipient_email)
    or not app_private.is_guardian(r.family_id,r.approved_by) or not app_private.is_member(r.family_id,r.subject_user_id)
    or app_private.is_member(r.family_id,u) or not app_private.contact_endpoint_usable(u,target_family) then
    raise exception 'not authorized' using errcode='42501';end if;
  source_child:=app_private.child_for_user(r.family_id,r.subject_user_id);
  if source_child is null and r.subject_user_id<>r.requested_by then raise exception 'not authorized' using errcode='42501';end if;
  a_id:=least(u,r.subject_user_id);b_id:=greatest(u,r.subject_user_id);source_is_a:=a_id=r.subject_user_id;
  perform pg_advisory_xact_lock(hashtextextended('betweenus-contact:'||a_id::text||':'||b_id::text,0));
  if exists(select 1 from app_private.private_blocks where (blocker=a_id and blocked=b_id) or (blocker=b_id and blocked=a_id))
    or exists(select 1 from app_private.trusted_contacts where a=a_id and b=b_id) then
    raise exception 'not authorized' using errcode='42501';end if;
  insert into app_private.trusted_contacts(family_id,a,b,requested_by,external_connection,family_a_id,family_b_id,
    accepted_a_at,accepted_b_at,approved_a_by,approved_b_by)
  values(r.family_id,a_id,b_id,r.subject_user_id,true,case when source_is_a then r.family_id else target_family end,
    case when source_is_a then target_family else r.family_id end,
    case when source_is_a then r.source_accepted_at else clock_timestamp() end,
    case when source_is_a then clock_timestamp() else r.source_accepted_at end,
    case when source_is_a and source_child is not null then r.approved_by end,
    case when not source_is_a and source_child is not null then r.approved_by end) returning id into contact;
  update app_private.external_contact_invitations set consumed_by=u,consumed_at=clock_timestamp(),contact_id=contact where id=r.id;
  perform app_private.flag_guardian_overlap(contact);
  return jsonb_build_object('status','accepted','verification','stillRequired');
end $$;

create or replace function api.accept_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if u not in(c.a,c.b) or not app_private.contact_endpoint_usable(u,case when u=c.a then c.family_a_id else c.family_b_id end)
    or c.revoked_at is not null or exists(select 1 from app_private.private_blocks where
      (blocker=c.a and blocked=c.b) or (blocker=c.b and blocked=c.a)) then raise exception 'not authorized' using errcode='42501';end if;
  update app_private.trusted_contacts set accepted_a_at=case when u=c.a then coalesce(accepted_a_at,clock_timestamp()) else accepted_a_at end,
    accepted_b_at=case when u=c.b then coalesce(accepted_b_at,clock_timestamp()) else accepted_b_at end where id=c.id;
  perform app_private.invalidate_user(c.a);perform app_private.invalidate_user(c.b);
  return jsonb_build_object('status','accepted');
end $$;
create or replace function api.approve_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not app_private.contact_guardian(c.id,u) or c.revoked_at is not null then raise exception 'not authorized' using errcode='42501';end if;
  update app_private.trusted_contacts set
    approved_a_by=case when app_private.contact_child_family(c.a)=c.family_a_id and app_private.is_guardian(c.family_a_id,u) then u else approved_a_by end,
    approved_b_by=case when app_private.contact_child_family(c.b)=c.family_b_id and app_private.is_guardian(c.family_b_id,u) then u else approved_b_by end where id=c.id;
  perform app_private.flag_guardian_overlap(c.id);
  return jsonb_build_object('status','approved','verification','stillRequired');
end $$;
create or replace function api.verify_contact(p_contact_id uuid,p_operator_id uuid,p_method text,p_evidence_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not app_private.contact_verifier_independent(c.id,p_operator_id) or c.revoked_at is not null or c.review_required
    or c.accepted_a_at is null or c.accepted_b_at is null or not app_private.contact_endpoint_usable(c.a,c.family_a_id)
    or not app_private.contact_endpoint_usable(c.b,c.family_b_id) or not app_private.contact_approvals_current(c.id) then
    raise exception 'independent verification required' using errcode='42501';end if;
  if coalesce(char_length(p_method),0) not between 1 and 80 or char_length(trim(p_method))=0
    or coalesce(char_length(p_evidence_ref),0) not between 1 and 200 or char_length(trim(p_evidence_ref))=0
    or lower(trim(p_method)) in('checkbox','email','email_confirmation','parent_approval') then
    raise exception 'verification evidence required' using errcode='22023';end if;
  if (p_method='synthetic_fixture' and not exists(select 1 from app_private.deployment_policy where singleton and local_synthetic)) or
    (p_method<>'synthetic_fixture' and not exists(select 1 from app_private.communication_policy where singleton and nullif(verification_policy_id,'') is not null)) then
    raise exception 'reviewed verification policy required' using errcode='42501';end if;
  update app_private.trusted_contacts set verified_by=p_operator_id,verification_method=p_method,verification_evidence_ref=p_evidence_ref,
    verified_at=clock_timestamp(),verified_until=clock_timestamp()+interval '90 days' where id=c.id;
  return jsonb_build_object('status','verified');
end $$;

create or replace function api.list_contacts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'familyId',case when app_private.is_member(c.family_id,u) then c.family_id
      when u=c.a then c.family_a_id when u=c.b then c.family_b_id
      when app_private.is_guardian(c.family_a_id,u) then c.family_a_id when app_private.is_guardian(c.family_b_id,u) then c.family_b_id end,
    'a',case when not c.external_connection or (c.accepted_a_at is not null and c.accepted_b_at is not null) or c.a=u then c.a end,
    'b',case when not c.external_connection or (c.accepted_a_at is not null and c.accepted_b_at is not null) or c.b=u then c.b end,
    'aName',case when c.accepted_a_at is not null and c.accepted_b_at is not null then pa.display_name end,
    'bName',case when c.accepted_a_at is not null and c.accepted_b_at is not null then pb.display_name end,
    'peerCategory',case when c.accepted_a_at is not null and c.accepted_b_at is not null and u in(c.a,c.b) then
      case when (case when u=c.a then pb.kind else pa.kind end)='child' then 'child'
        when app_private.is_guardian(app_private.contact_child_family(u),case when u=c.a then c.b else c.a end) then 'parent'
        else 'trusted-person' end end,
    'acceptedByMe',case when u=c.a then c.accepted_a_at is not null when u=c.b then c.accepted_b_at is not null else null end,
    'bothAccepted',c.accepted_a_at is not null and c.accepted_b_at is not null,'approvalA',c.approved_a_by is not null,
    'approvalB',c.approved_b_by is not null,'verified',c.verified_at is not null and c.verified_until>clock_timestamp(),
    'external',c.external_connection,'managedChildId',case
      when app_private.is_guardian(c.family_a_id,u) then app_private.child_for_user(c.family_a_id,c.a)
      when app_private.is_guardian(c.family_b_id,u) then app_private.child_for_user(c.family_b_id,c.b) end,
    'managedChildName',case when app_private.contact_child_family(c.a)=c.family_a_id and app_private.is_guardian(c.family_a_id,u) then pa.display_name
      when app_private.contact_child_family(c.b)=c.family_b_id and app_private.is_guardian(c.family_b_id,u) then pb.display_name end,
    'revoked',c.revoked_at is not null,'canExchange',case when u in(c.a,c.b) then app_private.contact_allowed(c.id) else false end)
    order by c.created_at,c.id),'[]'::jsonb) into result from app_private.trusted_contacts c
    join app_private.profiles pa on pa.user_id=c.a join app_private.profiles pb on pb.user_id=c.b
  where ((u in(c.a,c.b) and app_private.contact_endpoint_usable(u,case when u=c.a then c.family_a_id else c.family_b_id end)
      and (u<>c.requested_by or (c.accepted_a_at is not null and c.accepted_b_at is not null)))
    or (app_private.contact_guardian(c.id,u) and (not c.external_connection or
      (c.accepted_a_at is not null and c.accepted_b_at is not null) or
      (app_private.contact_child_family(c.a)=c.family_a_id and c.a<>c.requested_by and app_private.is_guardian(c.family_a_id,u)) or
      (app_private.contact_child_family(c.b)=c.family_b_id and c.b<>c.requested_by and app_private.is_guardian(c.family_b_id,u)))));
  return result;
end $$;

-- Keep applied privacy lifecycle operations in the same multi-family lock protocol.
create or replace function app_private.privacy_lock_families(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f uuid;contact uuid;contacts uuid[];
begin
  select array_agg(c.id order by c.a,c.b) into contacts from app_private.trusted_contacts c where p_user in(c.a,c.b)
    or exists(select 1 from app_private.external_contact_invitations r where r.contact_id=c.id
      and p_user in(r.subject_user_id,r.requested_by,r.approved_by,r.consumed_by));
  for f in select distinct family_id from (
    select family_id from app_private.memberships where user_id=p_user
    union all select family_id from app_private.children where account_user_id=p_user
    union all select bound.family_id from app_private.trusted_contacts c
      cross join lateral app_private.contact_family_ids(c.id) as bound(family_id) where c.id=any(contacts)
    union all select family_id from app_private.external_contact_invitations r
      where p_user in(r.subject_user_id,r.requested_by,r.approved_by,r.consumed_by)
  ) families where family_id is not null order by family_id loop perform app_private.lock_family(f);end loop;
  -- The fixed snapshot prevents newly discovered contacts from acquiring lower families after a pair.
  foreach contact in array coalesce(contacts,'{}'::uuid[]) loop perform app_private.lock_contact(contact);end loop;
end $$;

create function app_private.revoke_external_identity_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='profiles' then
    if new.state in('suspended','closed') then
      update app_private.external_contact_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()),token_hash=null,
        recipient_email=case when new.state='closed' then 'redacted@privacy.invalid' else recipient_email end
        where new.user_id in(subject_user_id,requested_by,approved_by,consumed_by);
    end if;
  elsif tg_table_name='memberships' then
    if new.status='revoked' then
      update app_private.external_contact_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()),token_hash=null
        where family_id=new.family_id and new.user_id in(subject_user_id,approved_by);
    end if;
  end if;
  return new;
end $$;
create trigger revoke_external_profile_invitations after update of state on app_private.profiles
  for each row execute function app_private.revoke_external_identity_invitations();
create trigger revoke_external_member_invitations after update of status on app_private.memberships
  for each row execute function app_private.revoke_external_identity_invitations();

create or replace function app_private.privacy_export_core(p_subject uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;subject_kind text;
begin
  select kind into subject_kind from app_private.profiles where user_id=p_subject;
  if (select count(*) from app_private.messages where sender_id=p_subject or (recipient_id=p_subject and acknowledged_at is not null))>1000
    or (select count(*) from app_private.safety_reports where reporter_id=p_subject)>100
    or (select count(*) from app_private.privacy_requests where requester_id=p_subject)>100
    or (select count(*) from app_private.external_contact_invitations r where p_subject in(r.subject_user_id,r.requested_by,r.consumed_by))>1000 then
    raise exception 'export capacity review required' using errcode='54000';end if;
  select jsonb_build_object('format','between-us-own-server-data-v1','generatedAt',clock_timestamp(),'journalIncluded',false,
    'subject',jsonb_build_object('id',p.user_id,'displayName',p.display_name,'kind',p.kind,'state',p.state,'email',case when not p.auth_alias then u.email end),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('familyId',m.family_id,'role',m.role,'childId',m.child_id,'status',m.status)) from app_private.memberships m where m.user_id=p_subject),'[]'),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'familyId',case when not c.external_connection then c.family_id
      when c.a=p_subject then c.family_a_id else c.family_b_id end,
      'a',case when not c.external_connection or c.a=p_subject or (c.accepted_a_at is not null and c.accepted_b_at is not null) then c.a end,
      'b',case when not c.external_connection or c.b=p_subject or (c.accepted_a_at is not null and c.accepted_b_at is not null) then c.b end,
      'revokedAt',c.revoked_at)) from app_private.trusted_contacts c where p_subject in(c.a,c.b) and
      (not c.external_connection or p_subject<>c.requested_by or (c.accepted_a_at is not null and c.accepted_b_at is not null))),'[]'),
    'externalContactRequests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'familyId',case when p_subject=r.consumed_by then null else r.family_id end,
      'recipientEmail',r.recipient_email,'sourceAccepted',r.source_accepted_at is not null,'issuedAt',r.issued_at,'expiresAt',r.expires_at,
      'revokedAt',r.revoked_at,'createdAt',r.created_at)) from app_private.external_contact_invitations r
      where p_subject in(r.subject_user_id,r.requested_by,r.consumed_by)),'[]'),
    'ownBlocks',coalesce((select jsonb_agg(jsonb_build_object('blockedUserId',blocked,'createdAt',created_at)) from app_private.private_blocks where blocker=p_subject),'[]'),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('childId',co.child_id,'status',co.status,'noticeVersion',co.notice_version,'policyVersion',co.policy_version,'scope',co.scope,'verifiedAt',co.verified_at,'withdrawnAt',co.withdrawn_at,'revokedAt',co.revoked_at))
      from app_private.consents co where co.guardian_user_id=p_subject or exists(select 1 from app_private.children c where c.id=co.child_id and c.account_user_id=p_subject)),'[]'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,'recipientId',m.recipient_id,'body',m.body,'response',m.response,'createdAt',m.created_at) order by m.created_at,m.id)
      from app_private.messages m where m.sender_id=p_subject or (m.recipient_id=p_subject and m.acknowledged_at is not null)),'[]'),
    'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reportedUserId',r.reported_user_id,'description',r.description,'selectedMessageBody',r.selected_message_body,'status',r.status,'response',r.response,'createdAt',r.created_at)) from app_private.safety_reports r where r.reporter_id=p_subject),'[]'),
    'privacyRequests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'subjectId',r.subject_id,'description',r.description,'status',r.status,'response',r.response,'createdAt',r.created_at)) from app_private.privacy_requests r where r.requester_id=p_subject),'[]'),
    'notificationPreferences',coalesce((select jsonb_build_object('enabled',enabled,'timezone',timezone,'quietStart',quiet_start,'quietEnd',quiet_end) from app_private.notification_preferences where user_id=p_subject),'{}'),
    'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'createdAt',created_at,'revokedAt',revoked_at)) from app_private.device_tokens where user_id=p_subject),'[]'),
    'finance',case when subject_kind='child' then '[]'::jsonb else coalesce((select jsonb_agg(e.payload order by c.server_at,c.operation_id) from app_private.finance_commands c
      join app_private.finance_events e on e.family_id=c.family_id and e.sequence=c.event_sequence where c.actor_id=p_subject),'[]'::jsonb) end)
    into result from app_private.profiles p join auth.users u on u.id=p.user_id where p.user_id=p_subject;
  if result is null or octet_length(result::text)>7340032 then raise exception 'export capacity review required' using errcode='54000';end if;
  return result;
end $$;

create function api.run_external_contact_retention(p_subject_id uuid,p_operator_id uuid,p_limit int default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare deleted int;
begin
  if not app_private.privacy_operator(p_operator_id,p_subject_id,p_subject_id) or not app_private.privacy_policy_allows(p_subject_id)
    or not exists(select 1 from app_private.privacy_lifecycle_policy where singleton and retention_enabled) then
    raise exception 'retention execution unavailable' using errcode='42501';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid retention batch size' using errcode='22023';end if;
  perform app_private.privacy_lock_families(p_subject_id);
  if app_private.privacy_has_hold(p_subject_id,'identity') then return jsonb_build_object('deletedRequests',0,'sharedRecordsRequireReview',true);end if;
  with expired as(select id from app_private.external_contact_invitations r where r.subject_user_id=p_subject_id and r.consumed_at is null
    and coalesce(r.expires_at,r.created_at+interval '7 days')<clock_timestamp()-interval '30 days' order by id limit p_limit)
    delete from app_private.external_contact_invitations where id in(select id from expired);
  get diagnostics deleted=row_count;
  return jsonb_build_object('deletedRequests',deleted,'sharedRecordsRequireReview',true);
end $$;

create or replace function api.revoke_contact(p_contact_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if not (u in(c.a,c.b) or app_private.contact_guardian(c.id,u)) then raise exception 'not authorized' using errcode='42501';end if;
  update app_private.trusted_contacts set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=c.id;
  perform app_private.suppress_contact_notifications(c.id);perform app_private.invalidate_user(c.a);perform app_private.invalidate_user(c.b);
  return jsonb_build_object('status','revoked');
end $$;
create or replace function api.block_user(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();contact uuid;c app_private.trusted_contacts;
begin
  if p_user_id is null or p_user_id=u then raise exception 'not authorized' using errcode='42501';end if;
  select id into contact from app_private.trusted_contacts where a=least(u,p_user_id) and b=greatest(u,p_user_id);
  c:=app_private.lock_contact(contact);
  insert into app_private.private_blocks(blocker,blocked) values(u,p_user_id) on conflict do nothing;
  perform app_private.suppress_contact_notifications(c.id);perform app_private.invalidate_user(u);perform app_private.invalidate_user(p_user_id);
  return jsonb_build_object('status','blocked');
end $$;
create function api.revoke_external_contact_invite(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();r app_private.external_contact_invitations;
begin
  r:=app_private.lock_external_invitation(p_invitation_id);
  if r.subject_user_id<>u and not app_private.is_guardian(r.family_id,u) then raise exception 'not authorized' using errcode='42501';end if;
  update app_private.external_contact_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=r.id;
  if r.contact_id is not null then
    update app_private.trusted_contacts set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=r.contact_id;
    perform app_private.suppress_contact_notifications(r.contact_id);
  end if;
  return jsonb_build_object('status','revoked');
end $$;
create function api.restrict_contact(p_contact_id uuid,p_operator_id uuid,p_reason text,p_evidence_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.trusted_contacts;
begin
  c:=app_private.lock_contact(p_contact_id);
  if p_operator_id is null or not app_private.account_usable(p_operator_id) or p_operator_id in(c.a,c.b)
    or not exists(select 1 from app_private.operators where user_id=p_operator_id and scope='safety' and active)
    or exists(select 1 from app_private.contact_family_ids(c.id) f where app_private.is_guardian(f,p_operator_id)) then
    raise exception 'independent safety operator required' using errcode='42501';end if;
  if p_reason is null or p_reason not in('guardian_dispute','safety_review') or coalesce(char_length(p_evidence_reference),0) not between 1 and 200
    or char_length(trim(p_evidence_reference))=0 then
    raise exception 'review evidence required' using errcode='22023';end if;
  insert into app_private.contact_review_flags(contact_id,reason,evidence_reference,operator_id) values(c.id,p_reason,p_evidence_reference,p_operator_id);
  update app_private.trusted_contacts set review_required=true where id=c.id;
  perform app_private.suppress_contact_notifications(c.id);
  -- No cause, case reference or automatic allegation notice is exposed to a family.
  return jsonb_build_object('status','restricted');
end $$;

create or replace function api.list_conversations() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'contactId',c.id,'peerId',case when u=c.a then c.b else c.a end,
    'canExchange',app_private.contact_allowed(c.id)) order by v.created_at,v.id),'[]'::jsonb) into result
  from app_private.conversations v join app_private.trusted_contacts c on c.id=v.contact_id
  where u in(c.a,c.b) and app_private.contact_endpoint_usable(u,case when u=c.a then c.family_a_id else c.family_b_id end);
  return result;
end $$;
create or replace function api.fetch_messages(p_conversation_id uuid,p_limit int default 50,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.communication_actor();c app_private.trusted_contacts;contact uuid;allowed boolean;result jsonb;before_time timestamptz;
begin
  select contact_id into contact from app_private.conversations where id=p_conversation_id;c:=app_private.lock_contact(contact);
  if u not in(c.a,c.b) or not app_private.contact_endpoint_usable(u,case when u=c.a then c.family_a_id else c.family_b_id end) then
    raise exception 'not authorized' using errcode='42501';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid page size' using errcode='22023';end if;
  allowed:=app_private.contact_allowed(c.id);
  if p_before_id is not null then
    select created_at into before_time from app_private.messages where id=p_before_id and conversation_id=p_conversation_id
      and (sender_id=u or (recipient_id=u and (allowed or acknowledged_at is not null)));
    if not found then raise exception 'not authorized' using errcode='42501';end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'senderId',q.sender_id,'body',q.body,'response',q.response,
    'createdAt',q.created_at,'status',case when q.sender_id=u then 'saved' when q.acknowledged_at is not null then 'acknowledged' else 'available' end)
    order by q.created_at,q.id),'[]'::jsonb) into result from (select * from app_private.messages where conversation_id=p_conversation_id
      and (sender_id=u or (recipient_id=u and (allowed or acknowledged_at is not null)))
      and (p_before_id is null or (created_at,id)<(before_time,p_before_id)) order by created_at desc,id desc limit p_limit) q;
  return jsonb_build_object('messages',result,'nextBeforeId',result->0->>'id','canExchange',allowed,'readReceipts',false);
end $$;

create or replace function api.lease_notifications(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record;ids uuid[];f uuid;q app_private.notification_outbox;c app_private.trusted_contacts;
  tz text;start_hour int;end_hour int;hour_now int;result jsonb:='[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid batch size' using errcode='22023';end if;
  if not exists(select 1 from app_private.communication_policy where singleton and push_delivery_enabled) then return result;end if;
  select array_agg(id) into ids from (select o.id from app_private.notification_outbox o where
    (o.status='queued' or (o.status='leased' and o.lease_until<clock_timestamp())) and o.next_attempt_at<=clock_timestamp()
    order by o.created_at,o.id limit p_limit) ready;
  -- Prelock the UNION for the entire batch; per-contact ordering alone can deadlock two-family batches.
  for f in select distinct family from app_private.notification_outbox o join app_private.messages m on m.id=o.message_id
    join app_private.conversations v on v.id=m.conversation_id cross join lateral app_private.contact_family_ids(v.contact_id) family
    where o.id=any(ids) order by family loop perform app_private.lock_family(f);end loop;
  for candidate in select o.id,v.contact_id from app_private.notification_outbox o join app_private.messages m on m.id=o.message_id
    join app_private.conversations v on v.id=m.conversation_id join app_private.trusted_contacts contact on contact.id=v.contact_id
    where o.id=any(ids) order by contact.a,contact.b,o.id loop
    c:=app_private.lock_contact(candidate.contact_id);
    select * into q from app_private.notification_outbox where id=candidate.id for update;
    if not found or not (q.status='queued' or (q.status='leased' and q.lease_until<clock_timestamp())) then continue;end if;
    if not app_private.notification_allowed(q.id) or q.attempts>=5 then
      update app_private.notification_outbox set status='suppressed',last_outcome='authorization',lease_token=null,lease_until=null where id=q.id;continue;
    end if;
    select timezone,quiet_start,quiet_end into tz,start_hour,end_hour from app_private.notification_preferences where user_id=q.recipient_id;
    hour_now:=extract(hour from clock_timestamp() at time zone tz)::int;
    if (start_hour<end_hour and hour_now>=start_hour and hour_now<end_hour) or
      (start_hour>end_hour and (hour_now>=start_hour or hour_now<end_hour)) then
      update app_private.notification_outbox set status='queued',next_attempt_at=clock_timestamp()+interval '1 hour',lease_token=null,lease_until=null where id=q.id;continue;
    end if;
    update app_private.notification_outbox set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
      where id=q.id returning * into q;
    result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'leaseToken',q.lease_token,'deviceId',q.device_id,
      'platform',(select platform from app_private.device_tokens where id=q.device_id),'token',(select token from app_private.device_tokens where id=q.device_id),
      'payload',jsonb_build_object('title','Between Us','body','Open Between Us to check for updates.','data',jsonb_build_object('invalidationId',q.id))));
  end loop;
  return result;
end $$;

revoke all on function app_private.bind_legacy_contact_families(),app_private.contact_family_ids(uuid),
  app_private.contact_child_family(uuid),app_private.contact_endpoint_usable(uuid,uuid),app_private.contact_guardian(uuid,uuid),
  app_private.contact_approvals_current(uuid),app_private.contact_verifier_independent(uuid,uuid),
  app_private.suppress_contact_notifications(uuid),app_private.flag_guardian_overlap(uuid),
  app_private.lock_external_invitation(uuid,uuid),app_private.issue_external_invitation(uuid,uuid),
  app_private.revoke_external_identity_invitations() from public,anon,authenticated,service_role;
revoke all on function api.request_external_contact(uuid,text),api.invite_external_contact(uuid,uuid,text),
  api.list_external_contact_requests(),api.approve_external_contact_request(uuid),api.accept_external_contact_source(uuid),
  api.accept_external_contact_invite(text),api.revoke_external_contact_invite(uuid),api.restrict_contact(uuid,uuid,text,text),
  api.run_external_contact_retention(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function api.request_external_contact(uuid,text),api.invite_external_contact(uuid,uuid,text),
  api.list_external_contact_requests(),api.approve_external_contact_request(uuid),api.accept_external_contact_source(uuid),
  api.accept_external_contact_invite(text),api.revoke_external_contact_invite(uuid) to authenticated;
grant execute on function api.restrict_contact(uuid,uuid,text,text) to service_role;
grant execute on function api.run_external_contact_retention(uuid,uuid,integer) to service_role;
