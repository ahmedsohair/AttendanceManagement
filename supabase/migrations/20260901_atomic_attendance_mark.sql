create or replace function public.mark_attendance_atomic(
  p_exam_session_id uuid,
  p_room_id uuid,
  p_student_id text,
  p_user_id uuid,
  p_source text,
  p_device_id text,
  p_action text,
  p_override_wrong_room boolean default false,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_marked_room public.rooms%rowtype;
  v_expected_room public.rooms%rowtype;
  v_allocation public.student_allocations%rowtype;
  v_existing public.attendance_events%rowtype;
  v_event public.attendance_events%rowtype;
  v_incident public.incidents%rowtype;
  v_user_role text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_is_mismatch boolean;
  v_allocation_json jsonb;
  v_expected_room_json jsonb;
  v_event_json jsonb;
  v_result jsonb;
begin
  if p_student_id is null or btrim(p_student_id) = '' then
    raise exception 'Student number is required.' using errcode = '22023';
  end if;
  if char_length(btrim(p_student_id)) > 64 then
    raise exception 'Student number is too long.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('ocr', 'manual') then
    raise exception 'Invalid attendance source.' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('mark_present', 'redirect_only') then
    raise exception 'Invalid attendance action.' using errcode = '22023';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'Device identifier is required.' using errcode = '22023';
  end if;
  if char_length(btrim(p_device_id)) > 200 then
    raise exception 'Device identifier is too long.' using errcode = '22023';
  end if;
  if v_comment is not null and char_length(v_comment) > 280 then
    raise exception 'Comment must be 280 characters or fewer.' using errcode = '22023';
  end if;

  select * into v_session
  from public.exam_sessions
  where id = p_exam_session_id
  for share;
  if not found then
    raise exception 'Exam session not found.' using errcode = 'P0002';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Exam session is not active.' using errcode = '55000';
  end if;

  select * into v_marked_room
  from public.rooms
  where id = p_room_id
  for share;
  if not found then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  if v_marked_room.exam_session_id <> p_exam_session_id then
    raise exception 'Room does not belong to this exam session.' using errcode = '23514';
  end if;

  select role into v_user_role
  from public.users
  where id = p_user_id
  for share;
  if not found or v_user_role not in ('admin', 'invigilator') then
    raise exception 'User is not authorized to mark attendance.' using errcode = '42501';
  end if;
  if v_user_role = 'invigilator' then
    perform 1
    from public.room_assignments
    where room_id = p_room_id
      and user_id = p_user_id
    for share;
    if not found then
      raise exception 'User is not assigned to this room.' using errcode = '42501';
    end if;
  end if;

  select * into v_existing
  from public.attendance_events
  where exam_session_id = p_exam_session_id
    and student_id = btrim(p_student_id);

  if found then
    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id, user_id,
      incident_type, details
    ) values (
      p_exam_session_id, btrim(p_student_id), p_room_id, v_existing.expected_room_id,
      p_user_id, 'duplicate_attempt',
      jsonb_strip_nulls(jsonb_build_object(
        'originalAttendanceId', v_existing.id::text,
        'source', p_source,
        'comment', v_comment
      ))
    ) returning * into v_incident;

    v_event_json := jsonb_build_object(
      'id', v_existing.id::text,
      'examSessionId', v_existing.exam_session_id::text,
      'studentId', v_existing.student_id,
      'markedByUserId', v_existing.marked_by_user_id::text,
      'markedInRoomId', v_existing.marked_in_room_id::text,
      'expectedRoomId', v_existing.expected_room_id::text,
      'source', v_existing.source,
      'overrideType', v_existing.override_type,
      'roomMismatch', v_existing.room_mismatch,
      'comment', v_existing.comment,
      'deviceId', v_existing.device_id,
      'createdAt', v_existing.created_at
    );
    v_result := jsonb_build_object(
      'status', 'already_marked',
      'examSessionId', p_exam_session_id::text,
      'studentId', btrim(p_student_id),
      'message', 'Attendance already marked.',
      'attendance', v_event_json
    );
    return jsonb_build_object(
      'incident', jsonb_build_object(
        'id', v_incident.id::text,
        'examSessionId', v_incident.exam_session_id::text,
        'studentId', v_incident.student_id,
        'roomId', v_incident.room_id::text,
        'expectedRoomId', v_incident.expected_room_id::text,
        'userId', v_incident.user_id::text,
        'incidentType', v_incident.incident_type,
        'details', v_incident.details,
        'createdAt', v_incident.created_at
      ),
      'result', v_result
    );
  end if;

  select * into v_allocation
  from public.student_allocations
  where exam_session_id = p_exam_session_id
    and student_id = btrim(p_student_id)
  for share;

  if not found then
    insert into public.incidents (
      exam_session_id, student_id, room_id, user_id, incident_type, details
    ) values (
      p_exam_session_id, btrim(p_student_id), p_room_id, p_user_id,
      'student_not_found',
      jsonb_strip_nulls(jsonb_build_object('source', p_source, 'comment', v_comment))
    ) returning * into v_incident;

    v_result := jsonb_build_object(
      'status', 'student_not_found',
      'examSessionId', p_exam_session_id::text,
      'studentId', btrim(p_student_id),
      'message', 'Student was not found in this exam session.'
    );
    return jsonb_build_object(
      'incident', jsonb_build_object(
        'id', v_incident.id::text,
        'examSessionId', v_incident.exam_session_id::text,
        'studentId', v_incident.student_id,
        'roomId', v_incident.room_id::text,
        'userId', v_incident.user_id::text,
        'incidentType', v_incident.incident_type,
        'details', v_incident.details,
        'createdAt', v_incident.created_at
      ),
      'result', v_result
    );
  end if;

  select * into v_expected_room
  from public.rooms
  where id = v_allocation.room_id
  for share;
  if not found or v_expected_room.exam_session_id <> p_exam_session_id then
    raise exception 'Student allocation references an invalid room.' using errcode = '23514';
  end if;

  v_is_mismatch := v_allocation.room_id <> p_room_id;
  v_allocation_json := jsonb_strip_nulls(jsonb_build_object(
    'id', v_allocation.id::text,
    'examSessionId', v_allocation.exam_session_id::text,
    'studentId', v_allocation.student_id,
    'studentName', v_allocation.student_name,
    'roomId', v_allocation.room_id::text,
    'zone', v_allocation.zone,
    'courseCode', v_allocation.course_code,
    'program', v_allocation.program
  ));
  v_expected_room_json := jsonb_strip_nulls(jsonb_build_object(
    'id', v_expected_room.id::text,
    'examSessionId', v_expected_room.exam_session_id::text,
    'code', v_expected_room.code,
    'displayName', v_expected_room.display_name,
    'capacity', v_expected_room.capacity
  ));

  if v_is_mismatch then
    v_result := jsonb_build_object(
      'status', 'wrong_room',
      'examSessionId', p_exam_session_id::text,
      'studentId', btrim(p_student_id),
      'message', 'Student belongs to a different room.',
      'allocation', v_allocation_json,
      'expectedRoom', v_expected_room_json
    );

    if p_action = 'redirect_only' then
      insert into public.incidents (
        exam_session_id, student_id, room_id, expected_room_id, user_id,
        incident_type, details
      ) values (
        p_exam_session_id, btrim(p_student_id), p_room_id, v_expected_room.id,
        p_user_id, 'wrong_room_redirected',
        jsonb_strip_nulls(jsonb_build_object(
          'zone', v_allocation.zone,
          'expectedRoomCode', v_expected_room.code,
          'comment', v_comment
        ))
      ) returning * into v_incident;

      return jsonb_build_object(
        'incident', jsonb_build_object(
          'id', v_incident.id::text,
          'examSessionId', v_incident.exam_session_id::text,
          'studentId', v_incident.student_id,
          'roomId', v_incident.room_id::text,
          'expectedRoomId', v_incident.expected_room_id::text,
          'userId', v_incident.user_id::text,
          'incidentType', v_incident.incident_type,
          'details', v_incident.details,
          'createdAt', v_incident.created_at
        ),
        'result', v_result
      );
    end if;

    if not coalesce(p_override_wrong_room, false) then
      raise exception 'Wrong-room attendance requires explicit override.' using errcode = '22023';
    end if;
  elsif p_action = 'redirect_only' then
    raise exception 'A student in the correct room cannot be redirected.' using errcode = '22023';
  else
    v_result := jsonb_build_object(
      'status', 'ready_to_mark',
      'examSessionId', p_exam_session_id::text,
      'studentId', btrim(p_student_id),
      'message', 'Student is in the correct room.',
      'allocation', v_allocation_json
    );
  end if;

  begin
    insert into public.attendance_events (
      exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, comment, device_id
    ) values (
      p_exam_session_id, btrim(p_student_id), p_user_id, p_room_id,
      v_expected_room.id, p_source,
      case when v_is_mismatch then 'wrong_room_present' else 'none' end,
      v_is_mismatch, v_comment, btrim(p_device_id)
    ) returning * into v_event;
  exception when unique_violation then
    select * into v_existing
    from public.attendance_events
    where exam_session_id = p_exam_session_id
      and student_id = btrim(p_student_id);

    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id, user_id,
      incident_type, details
    ) values (
      p_exam_session_id, btrim(p_student_id), p_room_id, v_existing.expected_room_id,
      p_user_id, 'duplicate_attempt',
      jsonb_strip_nulls(jsonb_build_object(
        'originalAttendanceId', v_existing.id::text,
        'source', p_source,
        'comment', v_comment
      ))
    ) returning * into v_incident;

    v_event_json := jsonb_build_object(
      'id', v_existing.id::text,
      'examSessionId', v_existing.exam_session_id::text,
      'studentId', v_existing.student_id,
      'markedByUserId', v_existing.marked_by_user_id::text,
      'markedInRoomId', v_existing.marked_in_room_id::text,
      'expectedRoomId', v_existing.expected_room_id::text,
      'source', v_existing.source,
      'overrideType', v_existing.override_type,
      'roomMismatch', v_existing.room_mismatch,
      'comment', v_existing.comment,
      'deviceId', v_existing.device_id,
      'createdAt', v_existing.created_at
    );
    return jsonb_build_object(
      'incident', jsonb_build_object(
        'id', v_incident.id::text,
        'examSessionId', v_incident.exam_session_id::text,
        'studentId', v_incident.student_id,
        'roomId', v_incident.room_id::text,
        'expectedRoomId', v_incident.expected_room_id::text,
        'userId', v_incident.user_id::text,
        'incidentType', v_incident.incident_type,
        'details', v_incident.details,
        'createdAt', v_incident.created_at
      ),
      'result', jsonb_build_object(
        'status', 'already_marked',
        'examSessionId', p_exam_session_id::text,
        'studentId', btrim(p_student_id),
        'message', 'Attendance already marked.',
        'attendance', v_event_json
      )
    );
  end;

  v_event_json := jsonb_build_object(
    'id', v_event.id::text,
    'examSessionId', v_event.exam_session_id::text,
    'studentId', v_event.student_id,
    'markedByUserId', v_event.marked_by_user_id::text,
    'markedInRoomId', v_event.marked_in_room_id::text,
    'expectedRoomId', v_event.expected_room_id::text,
    'source', v_event.source,
    'overrideType', v_event.override_type,
    'roomMismatch', v_event.room_mismatch,
    'comment', v_event.comment,
    'deviceId', v_event.device_id,
    'createdAt', v_event.created_at
  );

  if v_is_mismatch then
    insert into public.incidents (
      exam_session_id, student_id, room_id, expected_room_id, user_id,
      incident_type, details
    ) values (
      p_exam_session_id, btrim(p_student_id), p_room_id, v_expected_room.id,
      p_user_id, 'wrong_room_present_override',
      jsonb_strip_nulls(jsonb_build_object(
        'zone', v_allocation.zone,
        'expectedRoomCode', v_expected_room.code,
        'comment', v_comment
      ))
    ) returning * into v_incident;

    return jsonb_build_object(
      'event', v_event_json,
      'incident', jsonb_build_object(
        'id', v_incident.id::text,
        'examSessionId', v_incident.exam_session_id::text,
        'studentId', v_incident.student_id,
        'roomId', v_incident.room_id::text,
        'expectedRoomId', v_incident.expected_room_id::text,
        'userId', v_incident.user_id::text,
        'incidentType', v_incident.incident_type,
        'details', v_incident.details,
        'createdAt', v_incident.created_at
      ),
      'result', v_result
    );
  end if;

  return jsonb_build_object('event', v_event_json, 'result', v_result);
end;
$$;

revoke all on function public.mark_attendance_atomic(
  uuid, uuid, text, uuid, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.mark_attendance_atomic(
  uuid, uuid, text, uuid, text, text, text, boolean, text
) to service_role;
