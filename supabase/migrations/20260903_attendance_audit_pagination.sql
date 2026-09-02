create index if not exists idx_attendance_events_session_created_at
  on public.attendance_events(exam_session_id, created_at desc, id desc);

create index if not exists idx_attendance_events_session_mismatch_created_at
  on public.attendance_events(exam_session_id, room_mismatch, created_at desc, id desc);

create or replace function public.get_attendance_audit_page(
  p_exam_session_filter text default 'active',
  p_query text default null,
  p_room_id uuid default null,
  p_status text default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  exam_session_id uuid,
  student_id text,
  student_name text,
  exam_name text,
  marked_in_room_id uuid,
  marked_in_room_code text,
  expected_room_id uuid,
  expected_room_code text,
  marked_by_user_id uuid,
  marked_by_name text,
  marked_by_email text,
  source text,
  override_type text,
  room_mismatch boolean,
  comment text,
  device_id text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam_session_filter text := coalesce(nullif(btrim(p_exam_session_filter), ''), 'active');
  v_exam_session_id uuid;
  v_query text := lower(nullif(btrim(p_query), ''));
  v_status text := coalesce(nullif(btrim(p_status), ''), 'all');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'newest');
begin
  if v_exam_session_filter not in ('active', 'all') then
    begin
      v_exam_session_id := v_exam_session_filter::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Exam session filter must be active, all, or a valid UUID.'
          using errcode = '22023';
    end;
  end if;

  if v_status not in ('all', 'standard', 'mismatch', 'commented') then
    raise exception 'Attendance status filter is invalid.' using errcode = '22023';
  end if;
  if v_sort not in ('newest', 'oldest') then
    raise exception 'Attendance sort order is invalid.' using errcode = '22023';
  end if;
  if p_page < 1 then
    raise exception 'Page must be at least 1.' using errcode = '22023';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise exception 'Page size must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  select
    attendance.id,
    attendance.exam_session_id,
    attendance.student_id,
    allocation.student_name,
    session.name,
    attendance.marked_in_room_id,
    marked_room.code,
    attendance.expected_room_id,
    expected_room.code,
    attendance.marked_by_user_id,
    marker.full_name,
    marker.email,
    attendance.source,
    attendance.override_type,
    attendance.room_mismatch,
    attendance.comment,
    attendance.device_id,
    attendance.created_at,
    count(*) over() as total_count
  from public.attendance_events attendance
  join public.exam_sessions session on session.id = attendance.exam_session_id
  left join public.student_allocations allocation
    on allocation.exam_session_id = attendance.exam_session_id
   and allocation.student_id = attendance.student_id
  join public.rooms marked_room on marked_room.id = attendance.marked_in_room_id
  join public.rooms expected_room on expected_room.id = attendance.expected_room_id
  join public.users marker on marker.id = attendance.marked_by_user_id
  where (
      v_exam_session_filter = 'all'
      or (v_exam_session_filter = 'active' and session.status = 'active')
      or (v_exam_session_id is not null and attendance.exam_session_id = v_exam_session_id)
    )
    and (p_room_id is null or attendance.marked_in_room_id = p_room_id)
    and (
      v_status = 'all'
      or (v_status = 'standard' and attendance.room_mismatch is false)
      or (v_status = 'mismatch' and attendance.room_mismatch is true)
      or (v_status = 'commented' and nullif(btrim(attendance.comment), '') is not null)
    )
    and (
      v_query is null
      or strpos(lower(attendance.student_id), v_query) > 0
      or strpos(lower(coalesce(allocation.student_name, '')), v_query) > 0
      or strpos(lower(session.name), v_query) > 0
      or strpos(lower(marker.full_name), v_query) > 0
      or strpos(lower(marker.email), v_query) > 0
      or strpos(lower(coalesce(attendance.comment, '')), v_query) > 0
    )
  order by
    case when v_sort = 'oldest' then attendance.created_at end asc,
    case when v_sort = 'oldest' then attendance.id end asc,
    case when v_sort = 'newest' then attendance.created_at end desc,
    case when v_sort = 'newest' then attendance.id end desc
  limit p_page_size
  offset ((p_page - 1)::bigint * p_page_size::bigint);
end;
$$;

revoke all on function public.get_attendance_audit_page(text, text, uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_attendance_audit_page(text, text, uuid, text, text, integer, integer)
  to service_role;
