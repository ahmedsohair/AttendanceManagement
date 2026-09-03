begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_invigilator_id uuid := gen_random_uuid();
  v_active_id uuid := gen_random_uuid();
  v_draft_id uuid := gen_random_uuid();
  v_closed_id uuid := gen_random_uuid();
  v_expected_room_id uuid := gen_random_uuid();
  v_marked_room_id uuid := gen_random_uuid();
  v_before jsonb;
  v_after jsonb;
begin
  select public.get_admin_dashboard_summary(20, 10, 5) into v_before;

  insert into public.users (id, email, full_name, role)
  values
    (v_admin_id, 'dashboard-admin-' || v_admin_id || '@example.com', 'Dashboard Admin', 'admin'),
    (v_invigilator_id, 'dashboard-invigilator-' || v_invigilator_id || '@example.com', 'Dashboard Invigilator', 'invigilator');

  insert into public.exam_sessions
    (id, name, exam_date, start_time, status, published, created_by)
  values
    (v_active_id, 'Dashboard Active ' || v_active_id, date '2099-12-31', '23:59', 'active', true, v_admin_id),
    (v_draft_id, 'Dashboard Draft ' || v_draft_id, date '2099-12-30', '23:59', 'draft', false, v_admin_id),
    (v_closed_id, 'Dashboard Closed ' || v_closed_id, date '2099-12-29', '23:59', 'closed', false, v_admin_id);

  insert into public.rooms (id, exam_session_id, code, display_name)
  values
    (v_expected_room_id, v_active_id, 'DASH-EXPECTED', 'Dashboard Expected Room'),
    (v_marked_room_id, v_active_id, 'DASH-MARKED', 'Dashboard Marked Room');

  insert into public.room_assignments (room_id, user_id)
  values (v_expected_room_id, v_invigilator_id);

  insert into public.student_allocations
    (exam_session_id, student_id, student_name, room_id, zone)
  values (v_active_id, 'DASH-001', 'Dashboard Student', v_expected_room_id, 'A');

  insert into public.attendance_events
    (exam_session_id, student_id, marked_by_user_id, marked_in_room_id,
      expected_room_id, source, override_type, room_mismatch, device_id)
  values
    (v_active_id, 'DASH-001', v_invigilator_id, v_marked_room_id,
      v_expected_room_id, 'manual', 'wrong_room_present', true, 'dashboard-test');

  insert into public.incidents
    (exam_session_id, student_id, room_id, expected_room_id, user_id, incident_type)
  values
    (v_active_id, 'DASH-001', v_marked_room_id, v_expected_room_id,
      v_invigilator_id, 'wrong_room_present_override');

  select public.get_admin_dashboard_summary(1, 1, 1) into v_after;

  if (v_after->>'activeCount')::bigint <> (v_before->>'activeCount')::bigint + 1
    or (v_after->>'draftCount')::bigint <> (v_before->>'draftCount')::bigint + 1
    or (v_after->>'presentCount')::bigint <> (v_before->>'presentCount')::bigint + 1
    or (v_after->>'mismatchCount')::bigint <> (v_before->>'mismatchCount')::bigint + 1
    or (v_after->>'incidentCount')::bigint <> (v_before->>'incidentCount')::bigint + 1
    or (v_after->>'unassignedActiveRooms')::bigint <> (v_before->>'unassignedActiveRooms')::bigint + 1 then
    raise exception 'Dashboard exact totals did not change as expected.';
  end if;

  if jsonb_array_length(v_after->'activeSessions') <> 1
    or jsonb_array_length(v_after->'draftSessions') <> 1
    or jsonb_array_length(v_after->'closedSessions') <> 1 then
    raise exception 'Dashboard preview limits were not enforced.';
  end if;

  if (v_after->'activeSessions'->0->>'id')::uuid <> v_active_id
    or (v_after->'activeSessions'->0->>'room_count')::bigint <> 2
    or (v_after->'draftSessions'->0->>'id')::uuid <> v_draft_id
    or (v_after->'closedSessions'->0->>'id')::uuid <> v_closed_id then
    raise exception 'Dashboard preview ordering or room counts are incorrect.';
  end if;

  begin
    perform public.get_admin_dashboard_summary(0, 10, 5);
    raise exception 'Invalid dashboard preview limit was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  if has_function_privilege(
    'anon',
    'public.get_admin_dashboard_summary(integer,integer,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.get_admin_dashboard_summary(integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'A browser role can execute the admin dashboard function.';
  end if;
end;
$$;

rollback;
