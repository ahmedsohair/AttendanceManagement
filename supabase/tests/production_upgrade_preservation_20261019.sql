-- One-off cutover guard: aggregate fingerprints from the verified production
-- backup. These are whole-table digests, not user records or credentials.
do $preserve$
declare
  v_actual jsonb;
  v_expected constant jsonb := '{
    "users":{"rows":23,"digest":"dc5e83d08b529e198f3a35014f1418fe"},
    "exam_sessions":{"rows":6,"digest":"8a4f1f16d512244f16fb86d977af8dbd"},
    "rooms":{"rows":28,"digest":"6e839305ee1f28f63e455ba908d23344"},
    "attendance_events":{"rows":697,"digest":"9de0cb5abed92ba2402d704d412284a2"},
    "incidents":{"rows":19,"digest":"4d1c419cd0bdcae8b540eb6bc01ba861"},
    "room_assignments":{"rows":42,"digest":"46be616f443fea19b07cd913d6b2bae5"},
    "student_allocations":{"rows":2691,"digest":"046c6bbf54c05ae738c0c3ea5533b55f"}
  }';
begin
  with snapshots(name, rows, digest) as (
    select 'users', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,email,full_name,role,created_at,access_code_hash from public.users) original
    union all
    select 'exam_sessions', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,name,exam_date,start_time,published,created_by,created_at,venue,status from public.exam_sessions) original
    union all
    select 'rooms', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,exam_session_id,code,display_name,capacity from public.rooms) original
    union all
    select 'attendance_events', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,exam_session_id,student_id,marked_by_user_id,marked_in_room_id,expected_room_id,source,override_type,room_mismatch,comment,device_id,created_at from public.attendance_events) original
    union all
    select 'incidents', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,exam_session_id,student_id,room_id,expected_room_id,user_id,incident_type,details,created_at from public.incidents) original
    union all
    select 'room_assignments', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,room_id,user_id from public.room_assignments) original
    union all
    select 'student_allocations', count(*), md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))
    from (select id,exam_session_id,student_id,student_name,room_id,zone,course_code,program,cohort,seat from public.student_allocations) original
  )
  select jsonb_object_agg(name, jsonb_build_object('rows',rows,'digest',digest))
  into v_actual from snapshots;
  if v_actual is distinct from v_expected then
    raise exception 'Production preservation guard failed: records differ from the verified cutover backup. Stop and review drift; do not bypass.';
  end if;
end;
$preserve$;
