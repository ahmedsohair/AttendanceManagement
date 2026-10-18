-- Earlier same-day migrations can replace the audited delete function and
-- regrant the legacy transition function. Restore the final audited contract.
create or replace function public.delete_draft_exam_session(
  p_exam_session_id uuid,
  p_confirmation_name text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.exam_sessions%rowtype;
begin
  if not exists (
    select 1 from public.users where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select * into v_session from public.exam_sessions
  where id = p_exam_session_id for update;
  if not found then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;
  if p_confirmation_name is null or p_confirmation_name <> v_session.name then
    raise exception 'Exam name confirmation does not match.' using errcode = '23514';
  end if;
  if v_session.status <> 'draft' then
    raise exception 'Only draft exams can be permanently deleted. Close active exams and retain closed exams for audit history.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.attendance_events where exam_session_id = p_exam_session_id
  ) or exists (
    select 1 from public.incidents where exam_session_id = p_exam_session_id
  ) then
    raise exception 'Exams with attendance or incident history cannot be deleted.'
      using errcode = '55000';
  end if;

  perform public.write_admin_audit_event(
    p_actor_user_id, 'exam_deleted', 'exam_session', p_exam_session_id,
    p_exam_session_id, jsonb_build_object(
      'name', v_session.name, 'examDate', v_session.exam_date,
      'startTime', v_session.start_time, 'status', v_session.status
    )
  );
  delete from public.exam_sessions where id = p_exam_session_id;
  return p_exam_session_id;
end;
$$;

revoke all on function public.delete_draft_exam_session(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_draft_exam_session(uuid, text, uuid)
  to service_role;

revoke all on function public.transition_exam_session(uuid, text),
  public.replace_room_assignments_atomic(uuid, jsonb, jsonb),
  public.stage_invigilator_access_code(uuid, text),
  public.activate_invigilator_access_code(uuid, text)
  from public, anon, authenticated, service_role;
