drop function if exists public.delete_draft_exam_session(uuid);

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
  v_name text;
  v_status text;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select name, status into v_name, v_status
  from public.exam_sessions
  where id = p_exam_session_id
  for update;

  if not found then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;
  if p_confirmation_name is null or p_confirmation_name <> v_name then
    raise exception 'Exam name confirmation does not match.' using errcode = '23514';
  end if;
  if v_status <> 'draft' then
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

  delete from public.exam_sessions where id = p_exam_session_id;
  return p_exam_session_id;
end;
$$;

revoke all on function public.delete_draft_exam_session(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_draft_exam_session(uuid, text, uuid)
  to service_role;
