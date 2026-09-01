create table if not exists public.attendance_requests (
  request_id uuid primary key,
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  request_payload jsonb not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_attendance_requests_created_at
  on public.attendance_requests(created_at);
create index if not exists idx_attendance_requests_session_user
  on public.attendance_requests(exam_session_id, user_id);

alter table public.attendance_requests enable row level security;
revoke all on table public.attendance_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.attendance_requests to service_role;

do $$
begin
  if to_regprocedure(
    'public.mark_attendance_atomic_core(uuid,uuid,text,uuid,text,text,text,boolean,text)'
  ) is null then
    alter function public.mark_attendance_atomic(
      uuid, uuid, text, uuid, text, text, text, boolean, text
    ) rename to mark_attendance_atomic_core;
  end if;
end;
$$;

drop function if exists public.mark_attendance_atomic(
  uuid, uuid, text, uuid, text, text, text, boolean, text
);

revoke all on function public.mark_attendance_atomic_core(
  uuid, uuid, text, uuid, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.mark_attendance_atomic_core(
  uuid, uuid, text, uuid, text, text, text, boolean, text
) to service_role;

create or replace function public.mark_attendance_atomic(
  p_request_id uuid,
  p_exam_session_id uuid,
  p_room_id uuid,
  p_student_id text,
  p_user_id uuid,
  p_source text,
  p_device_id text,
  p_action text,
  p_override_wrong_room boolean default false,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_existing_payload jsonb;
  v_response jsonb;
  v_inserted integer;
begin
  v_payload := jsonb_build_object(
    'examSessionId', p_exam_session_id::text,
    'roomId', p_room_id::text,
    'studentId', btrim(coalesce(p_student_id, '')),
    'userId', p_user_id::text,
    'source', p_source,
    'deviceId', btrim(coalesce(p_device_id, '')),
    'action', p_action,
    'overrideWrongRoom', coalesce(p_override_wrong_room, false),
    'comment', nullif(btrim(coalesce(p_comment, '')), '')
  );

  insert into public.attendance_requests (
    request_id, exam_session_id, user_id, request_payload
  ) values (
    p_request_id, p_exam_session_id, p_user_id, v_payload
  )
  on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select request_payload, response_payload
      into v_existing_payload, v_response
    from public.attendance_requests
    where request_id = p_request_id
    for share;

    if v_existing_payload is distinct from v_payload then
      raise exception 'Idempotency key was already used for a different attendance request.'
        using errcode = '22023';
    end if;

    if v_response is null then
      raise exception 'Idempotent attendance request did not complete.'
        using errcode = '55000';
    end if;

    return v_response;
  end if;

  v_response := public.mark_attendance_atomic_core(
    p_exam_session_id,
    p_room_id,
    p_student_id,
    p_user_id,
    p_source,
    p_device_id,
    p_action,
    p_override_wrong_room,
    p_comment
  );

  update public.attendance_requests
  set response_payload = v_response,
      completed_at = now()
  where request_id = p_request_id;

  return v_response;
end;
$$;

revoke all on function public.mark_attendance_atomic(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.mark_attendance_atomic(
  uuid, uuid, uuid, text, uuid, text, text, text, boolean, text
) to service_role;
