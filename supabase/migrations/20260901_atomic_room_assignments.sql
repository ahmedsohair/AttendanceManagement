create or replace function public.replace_room_assignments_atomic(
  p_exam_session_id uuid,
  p_expected_assignments jsonb,
  p_room_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.exam_sessions%rowtype;
  v_room_count integer;
  v_committed jsonb;
begin
  if coalesce(jsonb_typeof(p_expected_assignments), '') <> 'array'
    or coalesce(jsonb_typeof(p_room_assignments), '') <> 'array' then
    raise exception 'Expected and submitted room assignments must be arrays.'
      using errcode = '22023';
  end if;

  select * into v_session
  from public.exam_sessions
  where id = p_exam_session_id
  for update;

  if not found then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;
  if v_session.status = 'closed' then
    raise exception 'Closed exams are read-only. Room assignments cannot be changed.'
      using errcode = '55000';
  end if;

  select count(*) into v_room_count
  from public.rooms
  where exam_session_id = p_exam_session_id;
  if v_room_count = 0 then
    raise exception 'No rooms found for this exam.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_room_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    where assignment."roomId" is null
      or coalesce(jsonb_typeof(assignment."invigilatorIds"), '') <> 'array'
  ) or exists (
    select 1
    from jsonb_to_recordset(p_expected_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    where assignment."roomId" is null
      or coalesce(jsonb_typeof(assignment."invigilatorIds"), '') <> 'array'
  ) then
    raise exception 'Every room assignment requires a room ID and invigilator array.'
      using errcode = '22023';
  end if;

  if (select count(*) from jsonb_to_recordset(p_room_assignments)
        as assignment("roomId" uuid)) <> v_room_count
    or (select count(*) from jsonb_to_recordset(p_expected_assignments)
        as assignment("roomId" uuid)) <> v_room_count
    or exists (
      select 1
      from jsonb_to_recordset(p_room_assignments) as assignment("roomId" uuid)
      group by assignment."roomId"
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_expected_assignments) as assignment("roomId" uuid)
      group by assignment."roomId"
      having count(*) > 1
    ) then
    raise exception 'Assignment snapshots must include every exam room exactly once.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_room_assignments) as assignment("roomId" uuid)
    left join public.rooms room
      on room.id = assignment."roomId"
     and room.exam_session_id = p_exam_session_id
    where room.id is null
  ) or exists (
    select 1
    from public.rooms room
    where room.exam_session_id = p_exam_session_id
      and not exists (
        select 1
        from jsonb_to_recordset(p_room_assignments) as assignment("roomId" uuid)
        where assignment."roomId" = room.id
      )
  ) or exists (
    select 1
    from jsonb_to_recordset(p_expected_assignments) as assignment("roomId" uuid)
    left join public.rooms room
      on room.id = assignment."roomId"
     and room.exam_session_id = p_exam_session_id
    where room.id is null
  ) then
    raise exception 'Assignment payload includes a room outside this exam.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_room_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    cross join lateral jsonb_array_elements_text(assignment."invigilatorIds") id(value)
    where id.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) or exists (
    select 1
    from jsonb_to_recordset(p_expected_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    cross join lateral jsonb_array_elements_text(assignment."invigilatorIds") id(value)
    where id.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Assignment payload includes an invalid invigilator ID.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_room_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    cross join lateral jsonb_array_elements_text(assignment."invigilatorIds") id(value)
    group by assignment."roomId", id.value
    having count(*) > 1
  ) then
    raise exception 'An invigilator can appear only once per room.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_room_assignments)
      as assignment("roomId" uuid, "invigilatorIds" jsonb)
    cross join lateral jsonb_array_elements_text(assignment."invigilatorIds") id(value)
    left join public.users candidate
      on candidate.id = id.value::uuid
     and candidate.role = 'invigilator'
    where candidate.id is null
  ) then
    raise exception 'Assignment payload includes an unknown invigilator.'
      using errcode = '23503';
  end if;

  if exists (
    (
      select assignment.room_id, assignment.user_id
      from public.room_assignments assignment
      join public.rooms room on room.id = assignment.room_id
      where room.exam_session_id = p_exam_session_id
      except
      select expected."roomId", id.value::uuid
      from jsonb_to_recordset(p_expected_assignments)
        as expected("roomId" uuid, "invigilatorIds" jsonb)
      cross join lateral jsonb_array_elements_text(expected."invigilatorIds") id(value)
    )
  ) or exists (
    (
      select expected."roomId", id.value::uuid
      from jsonb_to_recordset(p_expected_assignments)
        as expected("roomId" uuid, "invigilatorIds" jsonb)
      cross join lateral jsonb_array_elements_text(expected."invigilatorIds") id(value)
      except
      select assignment.room_id, assignment.user_id
      from public.room_assignments assignment
      join public.rooms room on room.id = assignment.room_id
      where room.exam_session_id = p_exam_session_id
    )
  ) then
    raise exception 'Room assignments changed since this page loaded. Refresh before saving.'
      using errcode = '40001';
  end if;

  delete from public.room_assignments assignment
  using public.rooms room
  where assignment.room_id = room.id
    and room.exam_session_id = p_exam_session_id;

  insert into public.room_assignments (room_id, user_id)
  select assignment."roomId", id.value::uuid
  from jsonb_to_recordset(p_room_assignments)
    as assignment("roomId" uuid, "invigilatorIds" jsonb)
  cross join lateral jsonb_array_elements_text(assignment."invigilatorIds") id(value);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'roomId', room.id::text,
        'invigilatorIds', coalesce(
          (
            select jsonb_agg(assignment.user_id::text order by assignment.user_id)
            from public.room_assignments assignment
            where assignment.room_id = room.id
          ),
          '[]'::jsonb
        )
      ) order by room.id
    ),
    '[]'::jsonb
  ) into v_committed
  from public.rooms room
  where room.exam_session_id = p_exam_session_id;

  return jsonb_build_object(
    'examSessionId', p_exam_session_id::text,
    'roomAssignments', v_committed
  );
end;
$$;

revoke all on function public.replace_room_assignments_atomic(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_room_assignments_atomic(uuid, jsonb, jsonb)
  to service_role;
