begin;

do $$
declare
  v_session_id uuid := '10000000-0000-4000-8000-000000000001';
  v_closed_session_id uuid := '10000000-0000-4000-8000-000000000003';
  v_room_one uuid := '20000000-0000-4000-8000-000000000001';
  v_room_two uuid := '20000000-0000-4000-8000-000000000002';
  v_invigilator_one uuid;
  v_before_attendance bigint;
  v_before_incidents bigint;
  v_payload jsonb;
begin
  select id into strict v_invigilator_one
  from public.users
  where email = 'invigilator01@example.com';

  select count(*) into v_before_attendance from public.attendance_events;
  select count(*) into v_before_incidents from public.incidents;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, '9000101', v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', false, 'Correct-room test'
  );
  if v_payload #>> '{event,studentId}' <> '9000101'
    or (v_payload #>> '{event,roomMismatch}')::boolean then
    raise exception 'Correct-room mark returned an invalid result: %', v_payload;
  end if;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, '9000101', v_invigilator_one,
    'manual', 'phase-3-test', 'mark_present', false, 'Duplicate test'
  );
  if v_payload #>> '{result,status}' <> 'already_marked'
    or v_payload #>> '{incident,incidentType}' <> 'duplicate_attempt' then
    raise exception 'Duplicate mark returned an invalid result: %', v_payload;
  end if;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, '9000102', v_invigilator_one,
    'manual', 'phase-3-test', 'redirect_only', false, 'Redirect test'
  );
  if v_payload #>> '{result,status}' <> 'wrong_room'
    or v_payload #>> '{incident,incidentType}' <> 'wrong_room_redirected' then
    raise exception 'Wrong-room redirect returned an invalid result: %', v_payload;
  end if;

  begin
    perform public.mark_attendance_atomic(
      v_session_id, v_room_one, '9000102', v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Missing override test'
    );
    raise exception 'Wrong-room mark without override was accepted.';
  exception
    when sqlstate '22023' then null;
  end;

  v_payload := public.mark_attendance_atomic(
    v_session_id, v_room_one, '9000102', v_invigilator_one,
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
      v_session_id, v_room_two, '9000102', v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Unauthorized room test'
    );
    raise exception 'Unassigned-room mark was accepted.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.mark_attendance_atomic(
      v_closed_session_id, v_room_one, '9000101', v_invigilator_one,
      'manual', 'phase-3-test', 'mark_present', false, 'Closed-session test'
    );
    raise exception 'Closed-session mark was accepted.';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  if (select count(*) from public.attendance_events) <> v_before_attendance + 2 then
    raise exception 'Atomic attendance test produced an unexpected attendance count.';
  end if;
  if (select count(*) from public.incidents) <> v_before_incidents + 4 then
    raise exception 'Atomic attendance test produced an unexpected incident count.';
  end if;
end;
$$;

rollback;
