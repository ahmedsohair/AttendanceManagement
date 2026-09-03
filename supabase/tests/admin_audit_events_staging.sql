begin;

do $$
declare
  v_admin_id uuid;
  v_invigilator_one uuid;
  v_invigilator_two uuid;
  v_session_id uuid := gen_random_uuid();
  v_delete_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_hash text := md5(gen_random_uuid()::text);
  v_event_id uuid;
  v_expected jsonb;
  v_submitted jsonb;
begin
  select id into strict v_admin_id from public.users where role = 'admin' limit 1;
  select id into strict v_invigilator_one from public.users where role = 'invigilator' order by id limit 1;
  select id into strict v_invigilator_two from public.users where role = 'invigilator' and id <> v_invigilator_one order by id limit 1;

  if has_function_privilege('service_role', 'public.transition_exam_session(uuid,text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.stage_invigilator_access_code(uuid,text)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.activate_invigilator_access_code(uuid,text)', 'EXECUTE') then
    raise exception 'Service role can bypass an audited function wrapper.';
  end if;

  insert into public.exam_sessions (
    id, name, exam_date, start_time, status, published, created_by,
    import_checksum, import_student_count, import_room_count
  ) values (
    v_session_id, 'Audit lifecycle test', current_date, '09:00', 'draft', false, v_admin_id,
    repeat('a', 64), 1, 1
  );
  insert into public.rooms (id, exam_session_id, code, display_name)
  values (v_room_id, v_session_id, 'AUDIT-ROOM', 'Audit Room');
  insert into public.room_assignments (room_id, user_id)
  values (v_room_id, v_invigilator_one);

  v_expected := jsonb_build_array(jsonb_build_object(
    'roomId', v_room_id, 'invigilatorIds', jsonb_build_array(v_invigilator_one)
  ));
  v_submitted := jsonb_build_array(jsonb_build_object(
    'roomId', v_room_id, 'invigilatorIds', jsonb_build_array(v_invigilator_two)
  ));
  perform public.replace_room_assignments_atomic(
    v_session_id, v_expected, v_submitted, v_admin_id
  );

  insert into public.student_allocations (
    exam_session_id, student_id, student_name, room_id, zone
  ) values (v_session_id, 'AUDIT-001', 'Audit Student', v_room_id, 'A');

  perform public.transition_exam_session(v_session_id, 'active', v_admin_id);
  perform public.transition_exam_session(v_session_id, 'closed', v_admin_id);
  perform public.stage_invigilator_access_code(v_invigilator_one, v_hash, v_admin_id);
  perform public.activate_invigilator_access_code(v_invigilator_one, v_hash, v_admin_id);

  insert into public.exam_sessions (id, name, exam_date, start_time, status, published, created_by)
  values (v_delete_id, 'Audited deletion test', current_date, '10:00', 'draft', false, v_admin_id);
  perform public.delete_draft_exam_session(v_delete_id, 'Audited deletion test', v_admin_id);

  if (select count(*) from public.admin_audit_events where actor_user_id = v_admin_id
      and (entity_id = v_session_id or entity_id = v_delete_id or entity_id = v_invigilator_one)) <> 6 then
    raise exception 'Expected six lifecycle audit events.';
  end if;

  select id into strict v_event_id
  from public.admin_audit_events
  where entity_id = v_delete_id and action = 'exam_deleted';
  begin
    update public.admin_audit_events set details = '{}'::jsonb where id = v_event_id;
    raise exception 'Audit event mutation was accepted.';
  exception when object_not_in_prerequisite_state then null;
  end;

  if has_table_privilege('anon', 'public.admin_audit_events', 'SELECT') then
    raise exception 'Anonymous role can read admin audit events.';
  end if;
end;
$$;

rollback;
