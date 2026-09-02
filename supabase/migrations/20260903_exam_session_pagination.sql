create index if not exists idx_exam_sessions_status_schedule
  on public.exam_sessions(status, exam_date desc, start_time desc, created_at desc, id desc);

create or replace function public.get_exam_session_page(
  p_status text,
  p_query text default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid,
  name text,
  exam_date date,
  start_time text,
  published boolean,
  status text,
  created_at timestamptz,
  room_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := btrim(coalesce(p_status, ''));
  v_query text := lower(nullif(btrim(p_query), ''));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'newest');
begin
  if v_status not in ('active', 'draft', 'closed') then
    raise exception 'Exam status filter is invalid.' using errcode = '22023';
  end if;
  if v_sort not in ('newest', 'oldest') then
    raise exception 'Exam sort order is invalid.' using errcode = '22023';
  end if;
  if p_page < 1 then
    raise exception 'Page must be at least 1.' using errcode = '22023';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise exception 'Page size must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  select
    session.id,
    session.name,
    session.exam_date,
    session.start_time,
    session.published,
    session.status,
    session.created_at,
    (select count(*) from public.rooms room where room.exam_session_id = session.id),
    count(*) over() as total_count
  from public.exam_sessions session
  where session.status = v_status
    and (
      v_query is null
      or strpos(lower(session.name), v_query) > 0
      or strpos(session.exam_date::text, v_query) > 0
      or strpos(lower(coalesce(session.venue, '')), v_query) > 0
    )
  order by
    case when v_sort = 'oldest' then session.exam_date end asc,
    case when v_sort = 'oldest' then session.start_time end asc,
    case when v_sort = 'oldest' then session.created_at end asc,
    case when v_sort = 'oldest' then session.id end asc,
    case when v_sort = 'newest' then session.exam_date end desc,
    case when v_sort = 'newest' then session.start_time end desc,
    case when v_sort = 'newest' then session.created_at end desc,
    case when v_sort = 'newest' then session.id end desc
  limit p_page_size
  offset ((p_page - 1)::bigint * p_page_size::bigint);
end;
$$;

revoke all on function public.get_exam_session_page(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_exam_session_page(text, text, text, integer, integer)
  to service_role;
