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
  v_test_token text := 'incident-token-' || gen_random_uuid()::text;
  v_count bigint;
  v_first_student text;
begin
  insert into public.users (id, email, full_name, role)
  values
    (v_admin_id, 'incident-admin-' || v_admin_id || '@example.com', 'Incident Admin', 'admin'),
    (v_invigilator_id, 'incident-invigilator-' || v_invigilator_id || '@example.com', 'Incident Marker', 'invigilator');

  insert into public.exam_sessions (id, name, exam_date, start_time, status, published, created_by)
  values
    (v_active_session_id, v_test_token || ' Active Exam', current_date, '09:00', 'active', true, v_admin_id),
    (v_closed_session_id, v_test_token || ' Closed Exam', current_date - 1, '09:00', 'closed', true, v_admin_id);

  insert into public.rooms (id, exam_session_id, code, display_name)
  values
    (v_room_one, v_active_session_id, 'INC-1', 'Incident Room 1'),
    (v_room_two, v_active_session_id, 'INC-2', 'Incident Room 2'),
    (v_closed_room, v_closed_session_id, 'INC-C', 'Closed Incident Room');

  insert into public.incidents
    (exam_session_id, student_id, room_id, expected_room_id, user_id,
     incident_type, details, created_at)
  values
    (v_active_session_id, 'INC-001', v_room_one, v_room_one, v_invigilator_id,
     'student_not_found', jsonb_build_object('comment', v_test_token || ' first'), now() - interval '3 minutes'),
    (v_active_session_id, 'INC-002', v_room_two, v_room_one, v_invigilator_id,
     'wrong_room_present_override', jsonb_build_object('comment', v_test_token || ' photo checked'), now() - interval '2 minutes'),
    (v_active_session_id, 'INC-003', v_room_two, v_room_two, v_invigilator_id,
     'duplicate_attempt', jsonb_build_object('comment', v_test_token || ' duplicate'), now() - interval '1 minute'),
    (v_closed_session_id, 'INC-004', v_closed_room, v_closed_room, v_invigilator_id,
     'wrong_room_redirected', jsonb_build_object('comment', v_test_token || ' closed'), now());

  select total_count, student_id into strict v_count, v_first_student
  from public.get_incident_audit_page('active', v_test_token, null, null, 'newest', 1, 2)
  order by created_at desc, id desc
  limit 1;
  if v_count <> 3 or v_first_student <> 'INC-003' then
    raise exception 'Active incident pagination or newest ordering failed.';
  end if;

  select count(*) into v_count
  from public.get_incident_audit_page('active', v_test_token, null, null, 'newest', 2, 2);
  if v_count <> 1 then
    raise exception 'Second incident page has an unexpected row count.';
  end if;

  select count(*) into v_count
  from public.get_incident_audit_page(
    v_active_session_id::text, null, v_room_two, 'wrong_room_present_override', 'newest', 1, 50
  );
  if v_count <> 1 then
    raise exception 'Incident room and type filters failed.';
  end if;

  select count(*) into v_count
  from public.get_incident_audit_page('all', v_test_token || ' closed', null, null, 'oldest', 1, 50);
  if v_count <> 1 then
    raise exception 'Cross-exam incident comment search failed.';
  end if;

  begin
    perform * from public.get_incident_audit_page('active', null, null, 'invalid', 'newest', 1, 50);
    raise exception 'Invalid incident type was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform * from public.get_incident_audit_page('active', null, null, null, 'newest', 1, 101);
    raise exception 'Oversized incident page was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  if has_function_privilege(
    'anon',
    'public.get_incident_audit_page(text,text,uuid,text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute the incident audit function.';
  end if;
end;
$$;

rollback;
