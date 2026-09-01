begin;

do $$
declare
  v_session_id uuid := '10000000-0000-4000-8000-000000000001';
  v_closed_session_id uuid := '10000000-0000-4000-8000-000000000003';
  v_room_one uuid;
  v_room_two uuid;
  v_invigilator_one uuid;
  v_correct_student text;
  v_wrong_student text;
  v_before_attendance bigint;
  v_before_incidents bigint;
  v_after_attendance bigint;
  v_after_incidents bigint;
  v_payload jsonb;
begin
  select id into strict v_invigilator_one
  from public.users
  where email = 'invigilator01@example.com';

  select room_id into strict v_room_one
  from public.room_assignments
  where user_id = v_invigilator_one
  order by room_id
  limit 1;

  select id into strict v_room_two
  from public.rooms
  where exam_session_id = v_session_id
    and id <> v_room_one
    and not exists (
      select 1
      from public.room_assignments
      where room_id = rooms.id
        and user_id = v_invigilator_one
    )
  order by id
  limit 1;

  select allocation.student_id into strict v_correct_student
  from public.student_allocations allocation
  where allocation.exam_session_id = v_session_id
    and allocation.room_id = v_room_one
    and not exists (
      select 1
      from public.attendance_events attendance
      where attendance.exam_session_id = allocation.exam_session_id
        and attendance.student_id = allocation.student_id
    )
  order by allocation.student_id
  limit 1;

  select allocation.student_id into strict v_wrong_student
  from public.student_allocations allocation
  where allocation.exam_session_id = v_session_id
    and allocation.room_id <> v_room_one
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

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, v_correct_student, v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', false, 'Correct-room test'
  );
  if v_payload #>> '{event,studentId}' <> v_correct_student
    or (v_payload #>> '{event,roomMismatch}')::boolean then
    raise exception 'Correct-room mark returned an invalid result: %', v_payload;
  end if;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, v_correct_student, v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', false, 'Duplicate test'
  );
  if v_payload #>> '{result,status}' <> 'already_marked'
    or v_payload #>> '{incident,incidentType}' <> 'duplicate_attempt' then
    raise exception 'Duplicate mark returned an invalid result: %', v_payload;
  end if;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, v_wrong_student, v_invigilator_one,
    'manual', 'phase-3-test', 'redirect_only', false, 'Redirect test'
  );
  if v_payload #>> '{result,status}' <> 'wrong_room'
    or v_payload #>> '{incident,incidentType}' <> 'wrong_room_redirected' then
    raise exception 'Wrong-room redirect returned an invalid result: %', v_payload;
  end if;

  begin
    perform public.mark_attendance_atomic(
      v_session_id, v_room_one, v_wrong_student, v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Missing override test'
    );
    raise exception 'Wrong-room mark without override was accepted.';
  exception
    when sqlstate '22023' then null;
  end;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, v_wrong_student, v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', true, 'Override test'
  );
  if not (v_payload #>> '{event,roomMismatch}')::boolean
    or v_payload #>> '{incident,incidentType}' <> 'wrong_room_present_override' then
    raise exception 'Wrong-room override returned an invalid result: %', v_payload;
  end if;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, '9999901', v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', false, 'Not-found test'
  );
  if v_payload #>> '{result,status}' <> 'student_not_found'
    or v_payload #>> '{incident,incidentType}' <> 'student_not_found' then
    raise exception 'Not-found mark returned an invalid result: %', v_payload;
  end if;

  begin
    perform public.mark_attendance_atomic(
      v_session_id, v_room_two, v_wrong_student, v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Unauthorized room test'
    );
    raise exception 'Unassigned-room mark was accepted.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.mark_attendance_atomic(
      v_closed_session_id, v_room_one, v_correct_student, v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Closed-session test'
    );
    raise exception 'Closed-session mark was accepted.';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  select count(*) into v_after_attendance from public.attendance_events;
  select count(*) into v_after_incidents from public.incidents;
  if v_after_attendance <> v_before_attendance + 2 then
    raise exception 'Atomic attendance test expected attendance delta 2 but found %.',
      v_after_attendance - v_before_attendance;
  end if;
  if v_after_incidents <> v_before_incidents + 4 then
    raise exception 'Atomic attendance test expected incident delta 4 but found %.',
      v_after_incidents - v_before_incidents;
  end if;
end;
$$;

rollback;
