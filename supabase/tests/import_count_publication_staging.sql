begin;

do $$
declare
  v_invigilator_id uuid;
  v_valid_session_id uuid := gen_random_uuid();
  v_student_mismatch_session_id uuid := gen_random_uuid();
  v_missing_metadata_session_id uuid := gen_random_uuid();
  v_valid_room_id uuid := gen_random_uuid();
  v_mismatch_room_id uuid := gen_random_uuid();
  v_missing_room_id uuid := gen_random_uuid();
begin
  select id into strict v_invigilator_id
  from public.users
  where role = 'invigilator'
  order by id
  limit 1;

  insert into public.exam_sessions (
    id, name, exam_date, start_time, published, status,
    import_checksum, import_student_count, import_room_count
  ) values
    (v_valid_session_id, 'Valid import count test', current_date, '09:00', false, 'draft',
      repeat('a', 64), 1, 1),
    (v_student_mismatch_session_id, 'Student count mismatch test', current_date, '10:00', false, 'draft',
      repeat('b', 64), 2, 1),
    (v_missing_metadata_session_id, 'Missing metadata test', current_date, '11:00', false, 'draft',
      null, null, null);

  insert into public.rooms (id, exam_session_id, code, display_name)
  values
    (v_valid_room_id, v_valid_session_id, 'COUNT-VALID', 'Count Valid'),
    (v_mismatch_room_id, v_student_mismatch_session_id, 'COUNT-MISMATCH', 'Count Mismatch'),
    (v_missing_room_id, v_missing_metadata_session_id, 'COUNT-MISSING', 'Count Missing');

  insert into public.student_allocations
    (exam_session_id, student_id, student_name, room_id, zone)
  values
    (v_valid_session_id, 'COUNT-001', 'Count Student One', v_valid_room_id, 'A'),
    (v_student_mismatch_session_id, 'COUNT-002', 'Count Student Two', v_mismatch_room_id, 'A'),
    (v_missing_metadata_session_id, 'COUNT-003', 'Count Student Three', v_missing_room_id, 'A');

  insert into public.room_assignments (room_id, user_id)
  values
    (v_valid_room_id, v_invigilator_id),
    (v_mismatch_room_id, v_invigilator_id),
    (v_missing_room_id, v_invigilator_id);

  perform public.transition_exam_session(v_valid_session_id, 'active');
  if (select status from public.exam_sessions where id = v_valid_session_id) <> 'active' then
    raise exception 'A verified import was not published.';
  end if;

  begin
    perform public.transition_exam_session(v_student_mismatch_session_id, 'active');
    raise exception 'A student-count mismatch was published.';
  exception when check_violation then null;
  end;
  if (select status from public.exam_sessions where id = v_student_mismatch_session_id) <> 'draft' then
    raise exception 'Student-count mismatch changed exam state.';
  end if;

  begin
    perform public.transition_exam_session(v_missing_metadata_session_id, 'active');
    raise exception 'An exam without import metadata was published.';
  exception when check_violation then null;
  end;
  if (select status from public.exam_sessions where id = v_missing_metadata_session_id) <> 'draft' then
    raise exception 'Missing import metadata changed exam state.';
  end if;

  if has_function_privilege(
    'anon',
    'public.transition_exam_session(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute exam transitions.';
  end if;
end;
$$;

rollback;
