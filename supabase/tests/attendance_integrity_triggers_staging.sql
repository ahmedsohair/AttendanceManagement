begin;

do $$
declare
  v_session_id uuid := '10000000-0000-4000-8000-000000000001';
  v_closed_session_id uuid := '10000000-0000-4000-8000-000000000003';
  v_room_one uuid;
  v_room_two uuid;
  v_user_id uuid;
  v_student_one text;
  v_student_two text;
begin
  select id into strict v_user_id
  from public.users
  where email = 'invigilator01@example.com';

  select id into strict v_room_one
  from public.rooms
  where exam_session_id = v_session_id
  order by id
  limit 1;

  select id into strict v_room_two
  from public.rooms
  where exam_session_id = v_session_id
    and id <> v_room_one
  order by id
  limit 1;

  select student_id into strict v_student_one
  from public.student_allocations
  where exam_session_id = v_session_id
    and room_id = v_room_one
  order by student_id
  limit 1;

  select student_id into strict v_student_two
  from public.student_allocations
  where exam_session_id = v_session_id
    and room_id = v_room_two
  order by student_id
  limit 1;

  begin
    insert into public.attendance_events (
      exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, device_id
    ) values (
      v_closed_session_id, 'invalid-room-session', v_user_id, v_room_one,
      v_room_one, 'manual', 'none', false, 'integrity-test'
    );
    raise exception 'Attendance with cross-session rooms was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.attendance_events (
      exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, device_id
    ) values (
      v_session_id, 'unallocated-student', v_user_id, v_room_one,
      v_room_one, 'manual', 'none', false, 'integrity-test'
    );
    raise exception 'Attendance without an allocation was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.attendance_events (
      exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, device_id
    ) values (
      v_session_id, v_student_one, v_user_id, v_room_one,
      v_room_two, 'manual', 'wrong_room_present', true, 'integrity-test'
    );
    raise exception 'Attendance with an incorrect expected room was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.attendance_events (
      exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, device_id
    ) values (
      v_session_id, v_student_two, v_user_id, v_room_one,
      v_room_two, 'manual', 'none', false, 'integrity-test'
    );
    raise exception 'Attendance with inconsistent mismatch flags was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.incidents (
      exam_session_id, student_id, room_id, incident_type, details
    ) values (
      v_closed_session_id, 'invalid-room-session', v_room_one,
      'student_not_found', '{}'
    );
    raise exception 'Incident with a cross-session room was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id,
      user_id, incident_type, details
    ) values (
      v_session_id, v_student_one, v_room_one, v_room_one,
      v_user_id, 'wrong_room_redirected', '{}'
    );
    raise exception 'Malformed wrong-room incident was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id,
      user_id, incident_type, details
    ) values (
      v_session_id, v_student_one, v_room_one, v_room_two,
      v_user_id, 'wrong_room_present_override', '{}'
    );
    raise exception 'Wrong-room incident with the wrong allocation was accepted.';
  exception when check_violation then null;
  end;

  begin
    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id,
      user_id, incident_type, details
    ) values (
      v_session_id, v_student_two, v_room_one, v_room_two,
      v_user_id, 'wrong_room_present_override', '{}'
    );
    raise exception 'Mismatch incident without matching attendance was accepted.';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
