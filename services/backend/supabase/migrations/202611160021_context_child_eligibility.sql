begin;
-- Display/selection hints only. Existing financial/check-in/actor authorization remains authoritative.
create or replace function api.get_context() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_uid uuid := app_private.actor(); v_result jsonb;
begin
  select jsonb_build_object(
    'user',jsonb_build_object('id',p.user_id,'displayName',p.display_name,'kind',p.kind,'state',p.state),
    'families',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'timezone',f.timezone) order by f.id)
      from app_private.families f where app_private.is_member(f.id,v_uid)),'[]'::jsonb),
    'memberships',coalesce((select jsonb_agg(jsonb_build_object('familyId',m.family_id,'role',m.role,'childId',m.child_id) order by m.family_id)
      from app_private.memberships m where m.user_id=v_uid and app_private.is_member(m.family_id,v_uid)),'[]'::jsonb),
    'children',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'familyId',c.family_id,'name',c.name,'state',c.state,
      'accountReady',coalesce(c.state='active' and exists(select 1 from app_private.profiles child_profile where child_profile.user_id=c.account_user_id and child_profile.kind='child')
        and app_private.child_for_user(c.family_id,c.account_user_id)=c.id,false)) order by c.id)
      from app_private.children c where app_private.is_guardian(c.family_id,v_uid) or
        (c.account_user_id=v_uid and app_private.is_member(c.family_id,v_uid))),'[]'::jsonb),
    'policy',(select jsonb_build_object('publicEnrollmentEnabled',d.public_enrollment_enabled,
      'realChildDataEnabled',d.real_child_data_enabled,'publicReportsEnabled',d.public_reports_enabled,
      'guardianManagedChildren',true,'noticeVersion',d.notice_version,'consentPolicyVersion',d.consent_policy_version)
      from app_private.deployment_policy d where singleton)
  ) into v_result from app_private.profiles p where p.user_id=v_uid;
  return v_result;
end;
$$;
-- CREATE OR REPLACE preserves the existing authenticated-only execution grant.

commit;
