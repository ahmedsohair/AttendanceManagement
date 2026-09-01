create or replace function public.validate_attendance_event_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_marked_session_id uuid;
  v_expected_session_id uuid;
  v_allocation_room_id uuid;
  v_is_mismatch boolean;
begin
  select exam_session_id into v_marked_session_id
  from public.rooms
  where id = new.marked_in_room_id;

  select exam_session_id into v_expected_session_id
  from public.rooms
  where id = new.expected_room_id;

  if v_marked_session_id is distinct from new.exam_session_id
    or v_expected_session_id is distinct from new.exam_session_id then
    raise exception 'Attendance rooms must belong to the attendance exam session.'
      using errcode = '23514';
  end if;

  select room_id into v_allocation_room_id
  from public.student_allocations
  where exam_session_id = new.exam_session_id
    and student_id = new.student_id;

  if not found then
    raise exception 'Attendance student must have an allocation in the exam session.'
      using errcode = '23514';
  end if;

  if new.expected_room_id is distinct from v_allocation_room_id then
    raise exception 'Attendance expected room must match the student allocation.'
      using errcode = '23514';
  end if;

  v_is_mismatch := new.marked_in_room_id <> new.expected_room_id;
  if new.room_mismatch is distinct from v_is_mismatch then
    raise exception 'Attendance room_mismatch does not match the marked and expected rooms.'
      using errcode = '23514';
  end if;

  if new.override_type is distinct from
      case when v_is_mismatch then 'wrong_room_present' else 'none' end then
    raise exception 'Attendance override_type is inconsistent with its room mismatch.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_events_validate_integrity
  on public.attendance_events;
create trigger attendance_events_validate_integrity
before insert or update of
  exam_session_id,
  student_id,
  marked_in_room_id,
  expected_room_id,
  override_type,
  room_mismatch
on public.attendance_events
for each row execute function public.validate_attendance_event_integrity();

create or replace function public.validate_incident_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room_session_id uuid;
  v_expected_session_id uuid;
  v_allocation_room_id uuid;
begin
  if new.room_id is not null then
    select exam_session_id into v_room_session_id
    from public.rooms
    where id = new.room_id;

    if v_room_session_id is distinct from new.exam_session_id then
      raise exception 'Incident room must belong to the incident exam session.'
        using errcode = '23514';
    end if;
  end if;

  if new.expected_room_id is not null then
    select exam_session_id into v_expected_session_id
    from public.rooms
    where id = new.expected_room_id;

    if v_expected_session_id is distinct from new.exam_session_id then
      raise exception 'Incident expected room must belong to the incident exam session.'
        using errcode = '23514';
    end if;
  end if;

  if new.incident_type in ('wrong_room_redirected', 'wrong_room_present_override') then
    if new.student_id is null
      or new.room_id is null
      or new.expected_room_id is null
      or new.room_id = new.expected_room_id then
      raise exception 'Wrong-room incidents require a student and two different rooms.'
        using errcode = '23514';
    end if;

    select room_id into v_allocation_room_id
    from public.student_allocations
    where exam_session_id = new.exam_session_id
      and student_id = new.student_id;

    if not found or new.expected_room_id is distinct from v_allocation_room_id then
      raise exception 'Wrong-room incident expected room must match the student allocation.'
        using errcode = '23514';
    end if;
  end if;

  if new.incident_type = 'wrong_room_present_override'
    and not exists (
      select 1
      from public.attendance_events attendance
      where attendance.exam_session_id = new.exam_session_id
        and attendance.student_id = new.student_id
        and attendance.marked_in_room_id = new.room_id
        and attendance.expected_room_id = new.expected_room_id
        and attendance.room_mismatch
        and attendance.override_type = 'wrong_room_present'
    ) then
    raise exception 'Mismatch-present incident requires its matching attendance event.'
      using errcode = '23514';
  end if;

  if new.incident_type = 'duplicate_attempt'
    and not exists (
      select 1
      from public.attendance_events attendance
      where attendance.exam_session_id = new.exam_session_id
        and attendance.student_id = new.student_id
    ) then
    raise exception 'Duplicate incident requires an existing attendance event.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists incidents_validate_integrity on public.incidents;
create trigger incidents_validate_integrity
before insert or update of
  exam_session_id,
  student_id,
  room_id,
  expected_room_id,
  incident_type
on public.incidents
for each row execute function public.validate_incident_integrity();

revoke all on function public.validate_attendance_event_integrity()
  from public, anon, authenticated;
revoke all on function public.validate_incident_integrity()
  from public, anon, authenticated;
