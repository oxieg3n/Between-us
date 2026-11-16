-- Forward fix: avoid PL/pgSQL local/column ambiguity after applied migration 014.
create or replace function api.execute_privacy_job(p_job_id uuid,p_operator_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_job app_private.privacy_lifecycle_jobs; v_subject_kind text;
begin
  select job.* into v_job from app_private.privacy_lifecycle_jobs job where job.id=p_job_id;
  if found and v_job.kind='export' and exists(select 1 from app_private.profiles profile where profile.user_id=v_job.subject_id and profile.kind='parent')
    and v_job.status in('approved','partial_ready','ready') then
    v_job:=app_private.privacy_parent_lock(p_job_id,p_operator_id);
  end if;
  v_result:=app_private.privacy_execute_job_core(p_job_id,p_operator_id);
  select job.* into v_job from app_private.privacy_lifecycle_jobs job where job.id=p_job_id;
  select profile.kind into v_subject_kind from app_private.profiles profile where profile.user_id=v_job.subject_id;
  return v_result||jsonb_build_object('status',v_job.status,'completed',coalesce(v_job.kind='export' and v_job.status='ready' and v_job.artifact_expires_at>clock_timestamp(),false),
    'projectionKind',case when v_job.kind='export' and v_job.status='partial_ready' then v_subject_kind end);
end $$;
revoke all on function api.execute_privacy_job(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function api.execute_privacy_job(uuid,uuid) to service_role;
