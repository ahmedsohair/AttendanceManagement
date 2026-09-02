begin;

do $$
declare
  v_session_id uuid := gen_random_uuid();
  v_deletable_session_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_user_id uuid;
begin
  select id into strict v_user_id
  from public.users
  where email = 'invigilator01@example.com';

  insert into public.exam_sessions (
    id, name, exam_date, start_time, published, status
  ) values (
    v_session_id, 'State transition test', current_date, '09:00', false, 'draft'
  );
  insert into public.rooms (id, exam_session_id, code, display_name)
  values (v_room_id, v_session_id, 'TEST-ROOM', 'Test Room');

  begin
    perform public.transition_exam_session(v_session_id, 'active');
    raise exception 'Exam without allocations or assignments was published.';
  exception when check_violation then null;
  end;

  insert into public.student_allocations (
    id, exam_session_id, student_id, student_name, room_id, zone
  ) values (
    gen_random_uuid(), v_session_id, 'STATE-TEST-1', 'State Test Student', v_room_id, 'A'
  );

  begin
    perform public.transition_exam_session(v_session_id, 'active');
    raise exception 'Exam without invigilator assignments was published.';
  exception when check_violation then null;
  end;

  insert into public.room_assignments (id, room_id, user_id)
  values (gen_random_uuid(), v_room_id, v_user_id);
  perform public.transition_exam_session(v_session_id, 'active');

  if (select status from public.exam_sessions where id = v_session_id) <> 'active'
    or not (select published from public.exam_sessions where id = v_session_id) then
    raise exception 'Valid draft exam was not published.';
  end if;

  begin
    perform public.transition_exam_session(v_session_id, 'active');
    raise exception 'Active exam was published twice.';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.delete_draft_exam_session(v_session_id);
    raise exception 'Active exam was permanently deleted.';
  exception when object_not_in_prerequisite_state then null;
  end;

  perform public.transition_exam_session(v_session_id, 'closed');
  if (select status from public.exam_sessions where id = v_session_id) <> 'closed'
    or (select published from public.exam_sessions where id = v_session_id) then
    raise exception 'Active exam was not closed.';
  end if;

  begin
    perform public.transition_exam_session(v_session_id, 'closed');
    raise exception 'Closed exam was closed twice.';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.transition_exam_session(v_session_id, 'active');
    raise exception 'Closed exam was reopened.';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.delete_draft_exam_session(v_session_id);
    raise exception 'Closed exam was permanently deleted.';
  exception when object_not_in_prerequisite_state then null;
  end;

  insert into public.exam_sessions (
    id, name, exam_date, start_time, published, status
  ) values (
    v_deletable_session_id, 'Deletable draft test', current_date, '10:00', false, 'draft'
  );
  perform public.delete_draft_exam_session(v_deletable_session_id);
  if exists (select 1 from public.exam_sessions where id = v_deletable_session_id) then
    raise exception 'Draft exam was not deleted.';
  end if;
end;
$$;

rollback;
