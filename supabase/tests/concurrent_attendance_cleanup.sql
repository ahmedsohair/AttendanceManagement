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
