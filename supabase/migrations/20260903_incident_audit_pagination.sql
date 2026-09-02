create index if not exists idx_incidents_session_created_at
  on public.incidents(exam_session_id, created_at desc, id desc);

create index if not exists idx_incidents_session_type_created_at
  on public.incidents(exam_session_id, incident_type, created_at desc, id desc);

create or replace function public.get_incident_audit_page(
  p_exam_session_filter text default 'active',
  p_query text default null,
  p_room_id uuid default null,
  p_incident_type text default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  exam_session_id uuid,
  student_id text,
  exam_name text,
  room_id uuid,
  room_code text,
  expected_room_id uuid,
  expected_room_code text,
  user_id uuid,
  raised_by_name text,
  raised_by_email text,
  incident_type text,
  details jsonb,
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
  v_incident_type text := coalesce(nullif(btrim(p_incident_type), ''), 'all');
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

  if v_incident_type not in (
    'all', 'wrong_room_redirected', 'wrong_room_present_override',
    'duplicate_attempt', 'student_not_found'
  ) then
    raise exception 'Incident type filter is invalid.' using errcode = '22023';
  end if;
  if v_sort not in ('newest', 'oldest') then
    raise exception 'Incident sort order is invalid.' using errcode = '22023';
  end if;
  if p_page < 1 then
    raise exception 'Page must be at least 1.' using errcode = '22023';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise exception 'Page size must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  select
    incident.id,
    incident.exam_session_id,
    incident.student_id,
    session.name,
    incident.room_id,
    room.code,
    incident.expected_room_id,
    expected_room.code,
    incident.user_id,
    marker.full_name,
    marker.email,
    incident.incident_type,
    incident.details,
    incident.created_at,
    count(*) over() as total_count
  from public.incidents incident
  join public.exam_sessions session on session.id = incident.exam_session_id
  left join public.rooms room on room.id = incident.room_id
  left join public.rooms expected_room on expected_room.id = incident.expected_room_id
  left join public.users marker on marker.id = incident.user_id
  where (
      v_exam_session_filter = 'all'
      or (v_exam_session_filter = 'active' and session.status = 'active')
      or (v_exam_session_id is not null and incident.exam_session_id = v_exam_session_id)
    )
    and (p_room_id is null or incident.room_id = p_room_id)
    and (v_incident_type = 'all' or incident.incident_type = v_incident_type)
    and (
      v_query is null
      or strpos(lower(coalesce(incident.student_id, '')), v_query) > 0
      or strpos(lower(session.name), v_query) > 0
      or strpos(lower(coalesce(room.code, '')), v_query) > 0
      or strpos(lower(coalesce(expected_room.code, '')), v_query) > 0
      or strpos(lower(coalesce(marker.full_name, '')), v_query) > 0
      or strpos(lower(coalesce(marker.email, '')), v_query) > 0
      or strpos(lower(coalesce(incident.details ->> 'comment', '')), v_query) > 0
    )
  order by
    case when v_sort = 'oldest' then incident.created_at end asc,
    case when v_sort = 'oldest' then incident.id end asc,
    case when v_sort = 'newest' then incident.created_at end desc,
    case when v_sort = 'newest' then incident.id end desc
  limit p_page_size
  offset ((p_page - 1)::bigint * p_page_size::bigint);
end;
$$;

revoke all on function public.get_incident_audit_page(text, text, uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_incident_audit_page(text, text, uuid, text, text, integer, integer)
  to service_role;
