begin;

do $$
declare
  v_session_id uuid := gen_random_uuid();
  v_failed_session_id uuid := gen_random_uuid();
  v_conflict_session_id uuid := gen_random_uuid();
  v_room_one uuid := gen_random_uuid();
  v_room_two uuid := gen_random_uuid();
  v_payload jsonb;
  v_before_sessions bigint;
begin
  select count(*) into v_before_sessions from public.exam_sessions;

  v_payload := public.import_exam_session_atomic(
    v_session_id,
    'Atomic Import Test',
    date '2030-02-01',
    '09:30',
    jsonb_build_array(
      jsonb_build_object('id', v_room_one, 'code', 'IMPORT-A', 'display_name', 'Import Room A'),
      jsonb_build_object('id', v_room_two, 'code', 'IMPORT-B', 'display_name', 'Import Room B')
    ),
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(), 'student_id', 'I900001', 'student_name', 'Import Student One',
        'room_id', v_room_one, 'zone', 'A', 'course_code', 'TEST1001', 'program', 'Test'
      ),
      jsonb_build_object(
        'id', gen_random_uuid(), 'student_id', 'I900002', 'student_name', 'Import Student Two',
        'room_id', v_room_two, 'zone', 'B', 'course_code', 'TEST1001', 'program', 'Test'
      ),
      jsonb_build_object(
        'id', gen_random_uuid(), 'student_id', 'I900003', 'student_name', 'Import Student Three',
        'room_id', v_room_two, 'zone', 'B', 'course_code', 'TEST1001', 'program', 'Test'
      )
    ),
    repeat('a', 64)
  );

  if (v_payload ->> 'sessionId')::uuid <> v_session_id
    or (v_payload ->> 'rooms')::integer <> 2
    or (v_payload ->> 'students')::integer <> 3
    or v_payload ->> 'checksum' <> repeat('a', 64) then
    raise exception 'Atomic import returned an invalid summary: %', v_payload;
  end if;

  if (select count(*) from public.rooms where exam_session_id = v_session_id) <> 2
    or (select count(*) from public.student_allocations where exam_session_id = v_session_id) <> 3 then
    raise exception 'Atomic import committed incorrect database counts.';
  end if;

  begin
    perform public.import_exam_session_atomic(
      v_failed_session_id,
      'Duplicate Import Test',
      date '2030-02-01',
      '09:30',
      jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'code', 'IMPORT-C', 'display_name', 'Import Room C')
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(), 'student_id', 'I900004', 'student_name', 'Duplicate One',
          'room_id', v_room_one, 'zone', 'C'
        ),
        jsonb_build_object(
          'id', gen_random_uuid(), 'student_id', 'I900004', 'student_name', 'Duplicate Two',
          'room_id', v_room_one, 'zone', 'C'
        )
      ),
      repeat('b', 64)
    );
    raise exception 'Duplicate-student import was accepted.';
  exception when unique_violation then null;
  end;

  if exists (select 1 from public.exam_sessions where id = v_failed_session_id) then
    raise exception 'Failed import left a partial exam session.';
  end if;

  begin
    perform public.import_exam_session_atomic(
      v_conflict_session_id,
      'Mid-transaction Failure Test',
      date '2030-02-01',
      '09:30',
      jsonb_build_array(
        jsonb_build_object('id', v_room_one, 'code', 'IMPORT-D', 'display_name', 'Conflicting Room')
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(), 'student_id', 'I900005', 'student_name', 'Conflict Student',
          'room_id', v_room_one, 'zone', 'D'
        )
      ),
      repeat('c', 64)
    );
    raise exception 'Import with a conflicting room ID was accepted.';
  exception when unique_violation then null;
  end;

  if exists (select 1 from public.exam_sessions where id = v_conflict_session_id) then
    raise exception 'Mid-transaction import failure left a partial exam session.';
  end if;

  if (select count(*) from public.exam_sessions) <> v_before_sessions + 1 then
    raise exception 'Atomic import test produced an unexpected session count.';
  end if;
end;
$$;

rollback;
