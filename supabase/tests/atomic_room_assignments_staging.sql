begin;

do $$
declare
  v_session_id uuid := '10000000-0000-4000-8000-000000000001';
  v_room_one uuid;
  v_room_two uuid;
  v_user_one uuid;
  v_user_two uuid;
  v_expected jsonb;
  v_submitted jsonb;
  v_response jsonb;
  v_committed_before_stale jsonb;
begin
  select id into strict v_room_one
  from public.rooms
  where exam_session_id = v_session_id
  order by id
  limit 1;

  select id into strict v_room_two
  from public.rooms
  where exam_session_id = v_session_id
  order by id
  offset 1 limit 1;

  select id into strict v_user_one from public.users
  where email = 'invigilator01@example.com';
  select id into strict v_user_two from public.users
  where email = 'invigilator02@example.com';

  select jsonb_agg(
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
  ) into v_expected
  from public.rooms room
  where room.exam_session_id = v_session_id;

  select jsonb_agg(
    jsonb_build_object(
      'roomId', room.id::text,
      'invigilatorIds', case
        when room.id = v_room_one then (
          select jsonb_agg(id.value order by id.value)
          from (values (v_user_one::text), (v_user_two::text)) as id(value)
        )
        when room.id = v_room_two then '[]'::jsonb
        else coalesce(
          (
            select jsonb_agg(assignment.user_id::text order by assignment.user_id)
            from public.room_assignments assignment
            where assignment.room_id = room.id
          ),
          '[]'::jsonb
        )
      end
    ) order by room.id
  ) into v_submitted
  from public.rooms room
  where room.exam_session_id = v_session_id;

  v_response := public.replace_room_assignments_atomic(
    v_session_id, v_expected, v_submitted
  );
  if v_response -> 'roomAssignments' is distinct from v_submitted then
    raise exception 'Atomic assignment replacement returned an unexpected snapshot.';
  end if;

  v_committed_before_stale := v_response -> 'roomAssignments';
  begin
    perform public.replace_room_assignments_atomic(
      v_session_id, v_expected, v_expected
    );
    raise exception 'A stale assignment snapshot was accepted.';
  exception when serialization_failure then null;
  end;

  if (
    select jsonb_agg(
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
    )
    from public.rooms room
    where room.exam_session_id = v_session_id
  ) is distinct from v_committed_before_stale then
    raise exception 'Failed assignment save changed the committed snapshot.';
  end if;

  begin
    perform public.replace_room_assignments_atomic(
      v_session_id,
      v_committed_before_stale,
      jsonb_build_array(
        jsonb_build_object('roomId', v_room_one, 'invigilatorIds', jsonb_build_array(gen_random_uuid()))
      )
    );
    raise exception 'Incomplete assignment snapshot was accepted.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

rollback;
