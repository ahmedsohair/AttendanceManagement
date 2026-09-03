begin;

do $$
declare
  v_admin_id uuid;
  v_invigilator_id uuid;
  v_session_id uuid := gen_random_uuid();
begin
  select id into strict v_admin_id from public.users where role = 'admin' limit 1;
  select id into strict v_invigilator_id from public.users where role = 'invigilator' limit 1;

  if to_regprocedure('public.delete_draft_exam_session(uuid)') is not null then
    raise exception 'Unsafe one-argument deletion function still exists.';
  end if;

  insert into public.exam_sessions (id, name, exam_date, start_time, status, published, created_by)
  values (v_session_id, 'Typed deletion test', current_date, '09:00', 'draft', false, v_admin_id);

  begin
    perform public.delete_draft_exam_session(v_session_id, 'Wrong name', v_admin_id);
    raise exception 'Incorrect exam-name confirmation was accepted.';
  exception when check_violation then null;
  end;

  begin
    perform public.delete_draft_exam_session(v_session_id, 'Typed deletion test', v_invigilator_id);
    raise exception 'A non-admin actor deleted an exam.';
  exception when insufficient_privilege then null;
  end;

  perform public.delete_draft_exam_session(v_session_id, 'Typed deletion test', v_admin_id);
  if exists (select 1 from public.exam_sessions where id = v_session_id) then
    raise exception 'Correctly confirmed draft exam was not deleted.';
  end if;
end;
$$;

rollback;
