update public.exam_sessions session
set import_room_count = coalesce(
      session.import_room_count,
      (select count(*)::integer from public.rooms room where room.exam_session_id = session.id)
    ),
    import_student_count = coalesce(
      session.import_student_count,
      (select count(*)::integer from public.student_allocations allocation where allocation.exam_session_id = session.id)
    ),
    import_checksum = coalesce(
      nullif(session.import_checksum, ''),
      'legacy-' || md5(session.id::text || ':' || session.created_at::text)
    )
where session.import_room_count is null
  or session.import_student_count is null
  or nullif(session.import_checksum, '') is null;

create or replace function public.transition_exam_session(
  p_exam_session_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_unassigned_rooms text;
  v_unallocated_rooms text;
  v_actual_room_count integer;
  v_actual_student_count integer;
begin
  select * into v_session
  from public.exam_sessions
  where id = p_exam_session_id
  for update;

  if not found then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;

  if p_target_status = 'active' then
    if v_session.status <> 'draft' then
      raise exception 'Only draft exams can be published.' using errcode = '55000';
    end if;

    if v_session.import_room_count is null
      or v_session.import_student_count is null
      or nullif(v_session.import_checksum, '') is null then
      raise exception 'Import verification metadata is missing. Re-import this exam before publishing.'
        using errcode = '23514';
    end if;

    select count(*)::integer into v_actual_room_count
    from public.rooms
    where exam_session_id = p_exam_session_id;

    select count(*)::integer into v_actual_student_count
    from public.student_allocations
    where exam_session_id = p_exam_session_id;

    if v_actual_room_count <> v_session.import_room_count
      or v_actual_student_count <> v_session.import_student_count then
      raise exception 'Imported roster verification failed: expected % students and % rooms, but found % students and % rooms. Re-import this exam before publishing.',
        v_session.import_student_count,
        v_session.import_room_count,
        v_actual_student_count,
        v_actual_room_count
        using errcode = '23514';
    end if;

    if v_actual_room_count = 0 then
      raise exception 'This exam has no rooms to publish.' using errcode = '23514';
    end if;

    select string_agg(room.code, ', ' order by room.code)
    into v_unallocated_rooms
    from public.rooms room
    where room.exam_session_id = p_exam_session_id
      and not exists (
        select 1
        from public.student_allocations allocation
        where allocation.exam_session_id = p_exam_session_id
          and allocation.room_id = room.id
      );

    if v_unallocated_rooms is not null then
      raise exception 'Allocate students before publishing. Room(s) without students: %.',
        v_unallocated_rooms using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.student_allocations allocation
      join public.rooms room on room.id = allocation.room_id
      where allocation.exam_session_id = p_exam_session_id
        and room.exam_session_id <> p_exam_session_id
    ) then
      raise exception 'Student allocations reference rooms outside this exam.'
        using errcode = '23514';
    end if;

    select string_agg(room.code, ', ' order by room.code)
    into v_unassigned_rooms
    from public.rooms room
    where room.exam_session_id = p_exam_session_id
      and not exists (
        select 1 from public.room_assignments assignment
        where assignment.room_id = room.id
      );

    if v_unassigned_rooms is not null then
      raise exception 'Assign invigilators before publishing. Unassigned room(s): %.',
        v_unassigned_rooms using errcode = '23514';
    end if;

    update public.exam_sessions
    set status = 'active', published = true
    where id = p_exam_session_id;
  elsif p_target_status = 'closed' then
    if v_session.status <> 'active' then
      raise exception 'Only active exams can be closed.' using errcode = '55000';
    end if;

    update public.exam_sessions
    set status = 'closed', published = false
    where id = p_exam_session_id;
  else
    raise exception 'Unsupported exam status transition.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'examSessionId', p_exam_session_id::text,
    'previousStatus', v_session.status,
    'status', p_target_status
  );
end;
$$;

revoke all on function public.transition_exam_session(uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_exam_session(uuid, text)
  to service_role;
