create or replace function public.get_admin_dashboard_summary(
  p_active_limit integer default 20,
  p_draft_limit integer default 10,
  p_closed_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_sessions jsonb;
  v_draft_sessions jsonb;
  v_closed_sessions jsonb;
  v_active_count bigint;
  v_draft_count bigint;
  v_present_count bigint;
  v_mismatch_count bigint;
  v_incident_count bigint;
  v_unassigned_active_rooms bigint;
begin
  if p_active_limit < 1 or p_active_limit > 100
    or p_draft_limit < 1 or p_draft_limit > 100
    or p_closed_limit < 1 or p_closed_limit > 100 then
    raise exception 'Dashboard preview limits must be between 1 and 100.'
      using errcode = '22023';
  end if;

  select count(*) filter (where status = 'active'),
         count(*) filter (where status = 'draft')
    into v_active_count, v_draft_count
  from public.exam_sessions;

  select coalesce(jsonb_agg(to_jsonb(preview) order by preview.exam_date desc,
      preview.start_time desc, preview.created_at desc, preview.id desc), '[]'::jsonb)
    into v_active_sessions
  from (
    select session.id, session.name, session.exam_date, session.start_time,
      session.published, session.status, session.created_at,
      (select count(*) from public.rooms room where room.exam_session_id = session.id) as room_count
    from public.exam_sessions session
    where session.status = 'active'
    order by session.exam_date desc, session.start_time desc, session.created_at desc, session.id desc
    limit p_active_limit
  ) preview;

  select coalesce(jsonb_agg(to_jsonb(preview) order by preview.exam_date desc,
      preview.start_time desc, preview.created_at desc, preview.id desc), '[]'::jsonb)
    into v_draft_sessions
  from (
    select session.id, session.name, session.exam_date, session.start_time,
      session.published, session.status, session.created_at,
      (select count(*) from public.rooms room where room.exam_session_id = session.id) as room_count
    from public.exam_sessions session
    where session.status = 'draft'
    order by session.exam_date desc, session.start_time desc, session.created_at desc, session.id desc
    limit p_draft_limit
  ) preview;

  select coalesce(jsonb_agg(to_jsonb(preview) order by preview.exam_date desc,
      preview.start_time desc, preview.created_at desc, preview.id desc), '[]'::jsonb)
    into v_closed_sessions
  from (
    select session.id, session.name, session.exam_date, session.start_time,
      session.published, session.status, session.created_at,
      (select count(*) from public.rooms room where room.exam_session_id = session.id) as room_count
    from public.exam_sessions session
    where session.status = 'closed'
    order by session.exam_date desc, session.start_time desc, session.created_at desc, session.id desc
    limit p_closed_limit
  ) preview;

  select count(*) into v_present_count
  from public.attendance_events attendance
  join public.exam_sessions session on session.id = attendance.exam_session_id
  where session.status = 'active';

  select count(*) into v_mismatch_count
  from public.attendance_events attendance
  join public.exam_sessions session on session.id = attendance.exam_session_id
  where session.status = 'active' and attendance.room_mismatch;

  select count(*) into v_incident_count
  from public.incidents incident
  join public.exam_sessions session on session.id = incident.exam_session_id
  where session.status = 'active';

  select count(*) into v_unassigned_active_rooms
  from public.rooms room
  join public.exam_sessions session on session.id = room.exam_session_id
  where session.status = 'active'
    and not exists (
      select 1 from public.room_assignments assignment where assignment.room_id = room.id
    );

  return jsonb_build_object(
    'activeSessions', v_active_sessions,
    'draftSessions', v_draft_sessions,
    'closedSessions', v_closed_sessions,
    'activeCount', v_active_count,
    'draftCount', v_draft_count,
    'presentCount', v_present_count,
    'mismatchCount', v_mismatch_count,
    'incidentCount', v_incident_count,
    'unassignedActiveRooms', v_unassigned_active_rooms
  );
end;
$$;

revoke all on function public.get_admin_dashboard_summary(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_summary(integer, integer, integer)
  to service_role;
