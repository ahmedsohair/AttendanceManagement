begin transaction read only;

with integrity_counts as (
  select
    (
      select count(*)
      from public.attendance_events attendance
      left join public.rooms marked_room on marked_room.id = attendance.marked_in_room_id
      left join public.rooms expected_room on expected_room.id = attendance.expected_room_id
      where marked_room.id is null
        or expected_room.id is null
        or marked_room.exam_session_id is distinct from attendance.exam_session_id
        or expected_room.exam_session_id is distinct from attendance.exam_session_id
    ) as attendance_room_session,
    (
      select count(*)
      from public.attendance_events attendance
      left join public.student_allocations allocation
        on allocation.exam_session_id = attendance.exam_session_id
       and allocation.student_id = attendance.student_id
      where allocation.id is null
    ) as attendance_missing_allocation,
    (
      select count(*)
      from public.attendance_events attendance
      join public.student_allocations allocation
        on allocation.exam_session_id = attendance.exam_session_id
       and allocation.student_id = attendance.student_id
      where attendance.expected_room_id is distinct from allocation.room_id
    ) as attendance_expected_allocation,
    (
      select count(*)
      from public.attendance_events attendance
      where attendance.room_mismatch is distinct from
              (attendance.marked_in_room_id <> attendance.expected_room_id)
         or attendance.override_type is distinct from
              case
                when attendance.marked_in_room_id <> attendance.expected_room_id
                  then 'wrong_room_present'
                else 'none'
              end
    ) as attendance_flags,
    (
      select count(*)
      from public.incidents incident
      left join public.rooms room on room.id = incident.room_id
      where incident.room_id is not null
        and (room.id is null or room.exam_session_id is distinct from incident.exam_session_id)
    ) as incident_room_session,
    (
      select count(*)
      from public.incidents incident
      left join public.rooms expected_room on expected_room.id = incident.expected_room_id
      where incident.expected_room_id is not null
        and (
          expected_room.id is null
          or expected_room.exam_session_id is distinct from incident.exam_session_id
        )
    ) as incident_expected_room_session,
    (
      select count(*)
      from public.incidents incident
      where incident.incident_type in (
        'wrong_room_redirected',
        'wrong_room_present_override'
      )
        and (
          incident.student_id is null
          or incident.room_id is null
          or incident.expected_room_id is null
          or incident.room_id = incident.expected_room_id
        )
    ) as incident_wrong_room_shape,
    (
      select count(*)
      from public.incidents incident
      left join public.student_allocations allocation
        on allocation.exam_session_id = incident.exam_session_id
       and allocation.student_id = incident.student_id
      where incident.incident_type in (
        'wrong_room_redirected',
        'wrong_room_present_override'
      )
        and (
          allocation.id is null
          or allocation.room_id is distinct from incident.expected_room_id
        )
    ) as incident_wrong_room_allocation,
    (
      select count(*)
      from public.incidents incident
      where incident.incident_type = 'wrong_room_present_override'
        and not exists (
          select 1
          from public.attendance_events attendance
          where attendance.exam_session_id = incident.exam_session_id
            and attendance.student_id = incident.student_id
            and attendance.marked_in_room_id = incident.room_id
            and attendance.expected_room_id = incident.expected_room_id
            and attendance.room_mismatch
            and attendance.override_type = 'wrong_room_present'
        )
    ) as incident_override_missing_attendance
)
select jsonb_build_object(
  'attendanceRoomSession', attendance_room_session,
  'attendanceMissingAllocation', attendance_missing_allocation,
  'attendanceExpectedAllocation', attendance_expected_allocation,
  'attendanceFlags', attendance_flags,
  'incidentRoomSession', incident_room_session,
  'incidentExpectedRoomSession', incident_expected_room_session,
  'incidentWrongRoomShape', incident_wrong_room_shape,
  'incidentWrongRoomAllocation', incident_wrong_room_allocation,
  'incidentOverrideMissingAttendance', incident_override_missing_attendance,
  'total',
    attendance_room_session
    + attendance_missing_allocation
    + attendance_expected_allocation
    + attendance_flags
    + incident_room_session
    + incident_expected_room_session
    + incident_wrong_room_shape
    + incident_wrong_room_allocation
    + incident_override_missing_attendance
)
from integrity_counts;

rollback;
