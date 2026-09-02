begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_invigilator_id uuid := gen_random_uuid();
  v_active_session_id uuid := gen_random_uuid();
  v_closed_session_id uuid := gen_random_uuid();
  v_room_one uuid := gen_random_uuid();
  v_room_two uuid := gen_random_uuid();
  v_closed_room uuid := gen_random_uuid();
  v_test_token text := 'page-token-' || gen_random_uuid()::text;
  v_count bigint;
  v_first_student text;
begin
  insert into public.users (id, email, full_name, role)
  values
    (v_admin_id, 'audit-admin-' || v_admin_id || '@example.com', 'Audit Admin', 'admin'),
    (v_invigilator_id, 'audit-invigilator-' || v_invigilator_id || '@example.com', 'Pagination Marker', 'invigilator');

  insert into public.exam_sessions (id, name, exam_date, start_time, status, published, created_by)
  values
    (v_active_session_id, 'Active Pagination Exam', current_date, '09:00', 'active', true, v_admin_id),
    (v_closed_session_id, 'Closed Pagination Exam', current_date - 1, '09:00', 'closed', true, v_admin_id);

  insert into public.rooms (id, exam_session_id, code, display_name)
  values
    (v_room_one, v_active_session_id, 'PAGE-1', 'Page Room 1'),
    (v_room_two, v_active_session_id, 'PAGE-2', 'Page Room 2'),
    (v_closed_room, v_closed_session_id, 'PAGE-C', 'Closed Page Room');

  insert into public.student_allocations
    (exam_session_id, student_id, student_name, room_id, zone)
  values
    (v_active_session_id, 'PAG-001', v_test_token || ' Alpha Student', v_room_one, 'A'),
    (v_active_session_id, 'PAG-002', v_test_token || ' Beta Student', v_room_one, 'A'),
    (v_active_session_id, 'PAG-003', v_test_token || ' Gamma Student', v_room_two, 'B'),
    (v_closed_session_id, 'PAG-004', v_test_token || ' Closed Student', v_closed_room, 'C');

  insert into public.attendance_events
    (exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
     expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at)
  values
    (v_active_session_id, 'PAG-001', v_invigilator_id, v_room_one,
     v_room_one, 'ocr', 'none', false, null, 'pagination-test', now() - interval '3 minutes'),
    (v_active_session_id, 'PAG-002', v_invigilator_id, v_room_two,
     v_room_one, 'manual', 'wrong_room_present', true, 'Photo ID checked', 'pagination-test', now() - interval '2 minutes'),
    (v_active_session_id, 'PAG-003', v_invigilator_id, v_room_two,
     v_room_two, 'ocr', 'none', false, null, 'pagination-test', now() - interval '1 minute'),
    (v_closed_session_id, 'PAG-004', v_invigilator_id, v_closed_room,
     v_closed_room, 'ocr', 'none', false, null, 'pagination-test', now());

  select total_count, student_id into strict v_count, v_first_student
  from public.get_attendance_audit_page('active', v_test_token, null, null, 'newest', 1, 2)
  order by created_at desc, id desc
  limit 1;
  if v_count <> 3 or v_first_student <> 'PAG-003' then
    raise exception 'Active attendance pagination or newest ordering failed.';
  end if;

  select count(*) into v_count
  from public.get_attendance_audit_page('active', v_test_token, null, null, 'newest', 2, 2);
  if v_count <> 1 then
    raise exception 'Second attendance page has an unexpected row count.';
  end if;

  select count(*) into v_count
  from public.get_attendance_audit_page('all', v_test_token || ' closed student', null, null, 'newest', 1, 50);
  if v_count <> 1 then
    raise exception 'Cross-exam student-name search failed.';
  end if;

  select count(*) into v_count
  from public.get_attendance_audit_page(v_active_session_id::text, null, v_room_two, 'mismatch', 'newest', 1, 50);
  if v_count <> 1 then
    raise exception 'Room and mismatch filters failed.';
  end if;

  select count(*) into v_count
  from public.get_attendance_audit_page('active', 'photo id', null, 'commented', 'oldest', 1, 50);
  if v_count <> 1 then
    raise exception 'Comment search or commented filter failed.';
  end if;

  begin
    perform * from public.get_attendance_audit_page('not-a-uuid', null, null, null, 'newest', 1, 50);
    raise exception 'Invalid exam filter was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform * from public.get_attendance_audit_page('active', null, null, null, 'newest', 1, 101);
    raise exception 'Oversized attendance page was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  if has_function_privilege(
    'anon',
    'public.get_attendance_audit_page(text,text,uuid,text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute the attendance audit function.';
  end if;
end;
$$;

rollback;
