\set ON_ERROR_STOP on

delete from public.attendance_requests
where request_id in (
  '7a200000-0000-4000-8000-000000000001',
  '7a200000-0000-4000-8000-000000000002'
);

delete from public.incidents
where exam_session_id = '10000000-0000-4000-8000-000000000001'
  and student_id = '9000991'
  and details ->> 'comment' like 'Phase 7.2 concurrency test%';

delete from public.attendance_events
where exam_session_id = '10000000-0000-4000-8000-000000000001'
  and student_id = '9000991'
  and device_id in ('phase-7.2-device-a', 'phase-7.2-device-b');

do $$
declare
  v_room_id uuid := '20000000-0000-4000-8000-000000000001';
  v_user_id uuid;
begin
  select id into strict v_user_id
  from public.users
  where email = 'invigilator01@example.com';

  if exists (
    select 1 from public.attendance_events
    where exam_session_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '9000991'
  ) then
    raise exception 'Concurrency fixture student already has unrelated attendance.';
  end if;

  if not exists (
    select 1 from public.student_allocations
    where exam_session_id = '10000000-0000-4000-8000-000000000001'
      and student_id = '9000991'
      and room_id = v_room_id
  ) then
    raise exception 'Concurrency fixture allocation is missing or changed.';
  end if;

  if not exists (
    select 1 from public.room_assignments
    where room_id = v_room_id and user_id = v_user_id
  ) then
    raise exception 'Concurrency fixture invigilator assignment is missing.';
  end if;
end;
$$;
