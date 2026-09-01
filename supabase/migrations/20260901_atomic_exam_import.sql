alter table public.exam_sessions
  add column if not exists import_checksum text,
  add column if not exists import_student_count integer,
  add column if not exists import_room_count integer;

create or replace function public.import_exam_session_atomic(
  p_session_id uuid,
  p_name text,
  p_exam_date date,
  p_start_time text,
  p_rooms jsonb,
  p_allocations jsonb,
  p_import_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_count integer;
  v_student_count integer;
begin
  if p_session_id is null then
    raise exception 'Session ID is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null or length(btrim(p_name)) > 200 then
    raise exception 'Exam name must contain 1 to 200 characters.' using errcode = '22023';
  end if;
  if p_exam_date is null then
    raise exception 'Exam date is required.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_start_time, '')), '') is null or length(btrim(p_start_time)) > 20 then
    raise exception 'Exam start time must contain 1 to 20 characters.' using errcode = '22023';
  end if;
  if coalesce(p_import_checksum, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Import checksum must be a lowercase SHA-256 value.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_rooms), '') <> 'array'
    or coalesce(jsonb_typeof(p_allocations), '') <> 'array' then
    raise exception 'Rooms and allocations must be JSON arrays.' using errcode = '22023';
  end if;

  v_room_count := jsonb_array_length(p_rooms);
  v_student_count := jsonb_array_length(p_allocations);
  if v_room_count < 1 or v_room_count > 2500 then
    raise exception 'Import must contain between 1 and 2500 rooms.' using errcode = '22023';
  end if;
  if v_student_count < 1 or v_student_count > 2500 then
    raise exception 'Import must contain between 1 and 2500 students.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rooms) as room(id uuid, code text, display_name text, capacity integer)
    where room.id is null
      or nullif(btrim(coalesce(room.code, '')), '') is null
      or length(btrim(room.code)) > 100
      or nullif(btrim(coalesce(room.display_name, '')), '') is null
      or length(btrim(room.display_name)) > 200
      or (room.capacity is not null and room.capacity < 0)
  ) then
    raise exception 'Import contains an invalid room.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rooms) as room(id uuid, code text)
    group by room.id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_rooms) as room(code text)
    group by btrim(room.code)
    having count(*) > 1
  ) then
    raise exception 'Import contains duplicate room IDs or codes.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as allocation(
      id uuid,
      student_id text,
      student_name text,
      room_id uuid,
      zone text,
      course_code text,
      program text
    )
    where allocation.id is null
      or nullif(btrim(coalesce(allocation.student_id, '')), '') is null
      or length(btrim(allocation.student_id)) > 50
      or nullif(btrim(coalesce(allocation.student_name, '')), '') is null
      or length(btrim(allocation.student_name)) > 200
      or allocation.room_id is null
      or nullif(btrim(coalesce(allocation.zone, '')), '') is null
      or length(btrim(allocation.zone)) > 100
      or length(coalesce(allocation.course_code, '')) > 200
      or length(coalesce(allocation.program, '')) > 200
  ) then
    raise exception 'Import contains an invalid student allocation.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as allocation(student_id text)
    group by btrim(allocation.student_id)
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_allocations) as allocation(id uuid)
    group by allocation.id
    having count(*) > 1
  ) then
    raise exception 'Import contains duplicate student or allocation IDs.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as allocation(room_id uuid)
    where not exists (
      select 1
      from jsonb_to_recordset(p_rooms) as room(id uuid)
      where room.id = allocation.room_id
    )
  ) then
    raise exception 'Every allocation room must be included in the same import.' using errcode = '23503';
  end if;

  insert into public.exam_sessions (
    id, name, exam_date, start_time, published, status,
    import_checksum, import_student_count, import_room_count
  ) values (
    p_session_id, btrim(p_name), p_exam_date, btrim(p_start_time), false, 'draft',
    p_import_checksum, v_student_count, v_room_count
  );

  insert into public.rooms (
    id, exam_session_id, code, display_name, capacity
  )
  select
    room.id,
    p_session_id,
    btrim(room.code),
    btrim(room.display_name),
    room.capacity
  from jsonb_to_recordset(p_rooms) as room(
    id uuid,
    code text,
    display_name text,
    capacity integer
  );

  insert into public.student_allocations (
    id, exam_session_id, student_id, student_name, room_id,
    zone, course_code, program
  )
  select
    allocation.id,
    p_session_id,
    btrim(allocation.student_id),
    btrim(allocation.student_name),
    allocation.room_id,
    btrim(allocation.zone),
    nullif(btrim(coalesce(allocation.course_code, '')), ''),
    nullif(btrim(coalesce(allocation.program, '')), '')
  from jsonb_to_recordset(p_allocations) as allocation(
    id uuid,
    student_id text,
    student_name text,
    room_id uuid,
    zone text,
    course_code text,
    program text
  );

  return jsonb_build_object(
    'sessionId', p_session_id::text,
    'checksum', p_import_checksum,
    'rooms', v_room_count,
    'students', v_student_count
  );
end;
$$;

revoke all on function public.import_exam_session_atomic(
  uuid, text, date, text, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.import_exam_session_atomic(
  uuid, text, date, text, jsonb, jsonb, text
) to service_role;
