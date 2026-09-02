begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_active_id uuid := gen_random_uuid();
  v_draft_id uuid := gen_random_uuid();
  v_closed_one uuid := gen_random_uuid();
  v_closed_two uuid := gen_random_uuid();
  v_closed_three uuid := gen_random_uuid();
  v_test_token text := 'session-token-' || gen_random_uuid()::text;
  v_count bigint;
  v_first_name text;
  v_room_count bigint;
begin
  insert into public.users (id, email, full_name, role)
  values (v_admin_id, 'session-admin-' || v_admin_id || '@example.com', 'Session Admin', 'admin');

  insert into public.exam_sessions
    (id, name, exam_date, start_time, status, published, created_by, venue)
  values
    (v_active_id, v_test_token || ' Active', current_date + 1, '09:00', 'active', true, v_admin_id, 'Building 1'),
    (v_draft_id, v_test_token || ' Draft', current_date + 2, '10:00', 'draft', false, v_admin_id, 'Building 2'),
    (v_closed_one, v_test_token || ' Closed One', current_date - 3, '09:00', 'closed', true, v_admin_id, 'Building 3'),
    (v_closed_two, v_test_token || ' Closed Two', current_date - 2, '09:00', 'closed', true, v_admin_id, 'Building 3'),
    (v_closed_three, v_test_token || ' Closed Three', current_date - 1, '09:00', 'closed', true, v_admin_id, 'Building 3');

  insert into public.rooms (exam_session_id, code, display_name)
  values
    (v_active_id, 'SESSION-A1', 'Session Active 1'),
    (v_active_id, 'SESSION-A2', 'Session Active 2'),
    (v_closed_three, 'SESSION-C1', 'Session Closed 1');

  select total_count, name, room_count
    into strict v_count, v_first_name, v_room_count
  from public.get_exam_session_page('closed', v_test_token, 'newest', 1, 2)
  order by exam_date desc, start_time desc, created_at desc, id desc
  limit 1;
  if v_count <> 3
    or v_first_name <> v_test_token || ' Closed Three'
    or v_room_count <> 1 then
    raise exception 'Closed exam pagination, ordering, or room count failed.';
  end if;

  select count(*) into v_count
  from public.get_exam_session_page('closed', v_test_token, 'newest', 2, 2);
  if v_count <> 1 then
    raise exception 'Second closed exam page has an unexpected row count.';
  end if;

  select room_count into strict v_room_count
  from public.get_exam_session_page('active', v_test_token, 'oldest', 1, 20);
  if v_room_count <> 2 then
    raise exception 'Active exam room count failed.';
  end if;

  select count(*) into v_count
  from public.get_exam_session_page('draft', 'building 2', 'newest', 1, 20);
  if v_count <> 1 then
    raise exception 'Exam venue search failed.';
  end if;

  begin
    perform * from public.get_exam_session_page('invalid', null, 'newest', 1, 20);
    raise exception 'Invalid exam status was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform * from public.get_exam_session_page('active', null, 'newest', 1, 101);
    raise exception 'Oversized exam page was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  if has_function_privilege(
    'anon',
    'public.get_exam_session_page(text,text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute the exam session function.';
  end if;
end;
$$;

rollback;
