\set ON_ERROR_STOP on

do $$
declare
  v_event_count integer;
  v_duplicate_count integer;
  v_request_count integer;
  v_ready_count integer;
  v_already_marked_count integer;
begin
  select count(*) into v_event_count
  from public.attendance_events
  where exam_session_id = '10000000-0000-4000-8000-000000000001'
    and student_id = '9000991'
    and device_id in ('phase-7.2-device-a', 'phase-7.2-device-b');

  select count(*) into v_duplicate_count
  from public.incidents
  where exam_session_id = '10000000-0000-4000-8000-000000000001'
    and student_id = '9000991'
    and incident_type = 'duplicate_attempt'
    and details ->> 'comment' like 'Phase 7.2 concurrency test%';

  select
    count(*),
    count(*) filter (where response_payload #>> '{result,status}' = 'ready_to_mark'),
    count(*) filter (where response_payload #>> '{result,status}' = 'already_marked')
  into v_request_count, v_ready_count, v_already_marked_count
  from public.attendance_requests
  where request_id in (
    '7a200000-0000-4000-8000-000000000001',
    '7a200000-0000-4000-8000-000000000002'
  ) and completed_at is not null;

  if v_event_count <> 1
    or v_duplicate_count <> 1
    or v_request_count <> 2
    or v_ready_count <> 1
    or v_already_marked_count <> 1 then
    raise exception
      'Concurrent mark result invalid: events %, duplicates %, requests %, ready %, already marked %.',
      v_event_count, v_duplicate_count, v_request_count, v_ready_count, v_already_marked_count;
  end if;
end;
$$;
