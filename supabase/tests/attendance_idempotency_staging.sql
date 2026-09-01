begin;

do $$
declare
  v_session_id uuid := '10000000-0000-4000-8000-000000000001';
  v_room_id uuid;
  v_user_id uuid;
  v_student_id text;
  v_request_id uuid := gen_random_uuid();
  v_first jsonb;
  v_retry jsonb;
  v_distinct_duplicate jsonb;
  v_before_attendance bigint;
  v_before_incidents bigint;
  v_after_attendance bigint;
  v_after_incidents bigint;
begin
  select id into strict v_user_id
  from public.users
  where email = 'invigilator01@example.com';

  select room_id into strict v_room_id
  from public.room_assignments
  where user_id = v_user_id
  order by room_id
  limit 1;

  select allocation.student_id into strict v_student_id
  from public.student_allocations allocation
  where allocation.exam_session_id = v_session_id
    and allocation.room_id = v_room_id
    and not exists (
      select 1
      from public.attendance_events attendance
      where attendance.exam_session_id = allocation.exam_session_id
        and attendance.student_id = allocation.student_id
    )
  order by allocation.student_id
  limit 1;

  select count(*) into v_before_attendance from public.attendance_events;
  select count(*) into v_before_incidents from public.incidents;

  v_first := public.mark_attendance_atomic(
    v_request_id, v_session_id, v_room_id, v_student_id, v_user_id,
    'manual', 'phase-3-idempotency-test', 'mark_present', false, 'Initial request'
  );
  v_retry := public.mark_attendance_atomic(
    v_request_id, v_session_id, v_room_id, v_student_id, v_user_id,
    'manual', 'phase-3-idempotency-test', 'mark_present', false, 'Initial request'
  );

  if v_retry is distinct from v_first then
    raise exception 'Idempotent retry did not return the original response.';
  end if;

  select count(*) into v_after_attendance from public.attendance_events;
  select count(*) into v_after_incidents from public.incidents;
  if v_after_attendance <> v_before_attendance + 1
    or v_after_incidents <> v_before_incidents then
    raise exception 'Idempotent retry created extra attendance or incident rows.';
  end if;

  v_distinct_duplicate := public.mark_attendance_atomic(
    gen_random_uuid(), v_session_id, v_room_id, v_student_id, v_user_id,
    'manual', 'phase-3-idempotency-test', 'mark_present', false, 'Separate scan'
  );
  if v_distinct_duplicate #>> '{result,status}' <> 'already_marked'
    or v_distinct_duplicate #>> '{incident,incidentType}' <> 'duplicate_attempt' then
    raise exception 'A separate duplicate scan was not classified correctly.';
  end if;

  begin
    perform public.mark_attendance_atomic(
      v_request_id, v_session_id, v_room_id, v_student_id, v_user_id,
      'manual', 'different-device', 'mark_present', false, 'Changed payload'
    );
    raise exception 'Reusing an idempotency key with a different payload was accepted.';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

rollback;
