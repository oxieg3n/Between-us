-- Reject unassigned case readers without SQL NULL bypass.
create or replace function api.get_report(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.safety_reports;
begin
  select * into r from app_private.safety_reports where id=p_report_id;
  if not found or not (r.reporter_id=u or (r.assigned_operator is not distinct from u and app_private.independent_case_operator(u,r.reporter_id,r.reported_user_id,'safety'))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('id',r.id,'reportedUserId',r.reported_user_id,'description',r.description,
    'selectedMessageBody',r.selected_message_body,'status',r.status,'response',r.response,'createdAt',r.created_at);
end $$;

create or replace function api.get_privacy_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.privacy_requests;
begin
  select * into r from app_private.privacy_requests where id=p_request_id;
  if not found or not (r.requester_id=u or (r.assigned_operator is not distinct from u and app_private.independent_case_operator(u,r.requester_id,r.subject_id,'privacy'))) then
    raise exception 'not authorized' using errcode='42501'; end if;
  return jsonb_build_object('id',r.id,'kind',r.kind,'subjectId',r.subject_id,'status',r.status,'description',r.description,
    'response',r.response,'journalIncluded',false,'createdAt',r.created_at);
end $$;
