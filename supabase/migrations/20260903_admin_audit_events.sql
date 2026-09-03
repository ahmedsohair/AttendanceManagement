drop function if exists public.delete_draft_exam_session(uuid);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in (
    'exam_published',
    'exam_closed',
    'exam_reopened',
    'room_assignments_changed',
    'invigilator_code_staged',
    'invigilator_code_activated',
    'exam_deleted'
  )),
  entity_type text not null check (entity_type in ('exam_session', 'invigilator')),
  entity_id uuid not null,
  exam_session_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(details) = 'object')
);

create index if not exists idx_admin_audit_events_created_at
  on public.admin_audit_events(created_at desc, id desc);
create index if not exists idx_admin_audit_events_entity
  on public.admin_audit_events(entity_type, entity_id, created_at desc);
create index if not exists idx_admin_audit_events_exam
  on public.admin_audit_events(exam_session_id, created_at desc)
  where exam_session_id is not null;

alter table public.admin_audit_events enable row level security;
revoke all on table public.admin_audit_events from public, anon, authenticated;
grant select on table public.admin_audit_events to authenticated;

drop policy if exists "admins can read admin audit events" on public.admin_audit_events;
create policy "admins can read admin audit events"
on public.admin_audit_events for select
to authenticated
using (
  exists (
    select 1 from public.users actor
    where actor.id = auth.uid() and actor.role = 'admin'
  )
);

create or replace function public.prevent_admin_audit_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Admin audit events are immutable.' using errcode = '55000';
end;
$$;

drop trigger if exists protect_admin_audit_events on public.admin_audit_events;
create trigger protect_admin_audit_events
before update or delete on public.admin_audit_events
for each row execute function public.prevent_admin_audit_event_mutation();

create or replace function public.write_admin_audit_event(
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_exam_session_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  if not exists (
    select 1 from public.users
    where id = p_actor_user_id and role = 'admin'
  ) then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  insert into public.admin_audit_events (
    actor_user_id, action, entity_type, entity_id, exam_session_id, details
  ) values (
    p_actor_user_id, p_action, p_entity_type, p_entity_id, p_exam_session_id,
    coalesce(p_details, '{}'::jsonb)
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.write_admin_audit_event(uuid, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.transition_exam_session(
  p_exam_session_id uuid,
  p_target_status text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_action text;
begin
  v_result := public.transition_exam_session(p_exam_session_id, p_target_status);
  v_action := case
    when p_target_status = 'closed' then 'exam_closed'
    when v_result->>'previousStatus' = 'closed' then 'exam_reopened'
    else 'exam_published'
  end;

  perform public.write_admin_audit_event(
    p_actor_user_id,
    v_action,
    'exam_session',
    p_exam_session_id,
    p_exam_session_id,
    jsonb_build_object(
      'previousStatus', v_result->>'previousStatus',
      'status', v_result->>'status'
    )
  );
  return v_result;
end;
$$;

revoke all on function public.transition_exam_session(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.transition_exam_session(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_exam_session(uuid, text, uuid)
  to service_role;

create or replace function public.replace_room_assignments_atomic(
  p_exam_session_id uuid,
  p_expected_assignments jsonb,
  p_room_assignments jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.replace_room_assignments_atomic(
    p_exam_session_id, p_expected_assignments, p_room_assignments
  );
  perform public.write_admin_audit_event(
    p_actor_user_id,
    'room_assignments_changed',
    'exam_session',
    p_exam_session_id,
    p_exam_session_id,
    jsonb_build_object(
      'previousAssignments', p_expected_assignments,
      'assignments', p_room_assignments
    )
  );
  return v_result;
end;
$$;

revoke all on function public.replace_room_assignments_atomic(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.replace_room_assignments_atomic(uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_room_assignments_atomic(uuid, jsonb, jsonb, uuid)
  to service_role;

create or replace function public.stage_invigilator_access_code(
  p_user_id uuid,
  p_access_code_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.stage_invigilator_access_code(p_user_id, p_access_code_hash);
  perform public.write_admin_audit_event(
    p_actor_user_id, 'invigilator_code_staged', 'invigilator', p_user_id, null, '{}'::jsonb
  );
  return v_result;
end;
$$;

create or replace function public.activate_invigilator_access_code(
  p_user_id uuid,
  p_access_code_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  v_result := public.activate_invigilator_access_code(p_user_id, p_access_code_hash);
  perform public.write_admin_audit_event(
    p_actor_user_id, 'invigilator_code_activated', 'invigilator', p_user_id, null, '{}'::jsonb
  );
  return v_result;
end;
$$;

revoke all on function public.stage_invigilator_access_code(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_invigilator_access_code(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.stage_invigilator_access_code(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.activate_invigilator_access_code(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.stage_invigilator_access_code(uuid, text, uuid)
  to service_role;
grant execute on function public.activate_invigilator_access_code(uuid, text, uuid)
  to service_role;

create or replace function public.delete_draft_exam_session(
  p_exam_session_id uuid,
  p_confirmation_name text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.exam_sessions%rowtype;
begin
  select * into v_session
  from public.exam_sessions
  where id = p_exam_session_id
  for update;

  if not found then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;
  if p_confirmation_name is null or p_confirmation_name <> v_session.name then
    raise exception 'Exam name confirmation does not match.' using errcode = '23514';
  end if;
  if v_session.status <> 'draft' then
    raise exception 'Only draft exams can be permanently deleted. Close active exams and retain closed exams for audit history.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.attendance_events where exam_session_id = p_exam_session_id
  ) or exists (
    select 1 from public.incidents where exam_session_id = p_exam_session_id
  ) then
    raise exception 'Exams with attendance or incident history cannot be deleted.'
      using errcode = '55000';
  end if;

  perform public.write_admin_audit_event(
    p_actor_user_id,
    'exam_deleted',
    'exam_session',
    p_exam_session_id,
    p_exam_session_id,
    jsonb_build_object(
      'name', v_session.name,
      'examDate', v_session.exam_date,
      'startTime', v_session.start_time,
      'status', v_session.status
    )
  );
  delete from public.exam_sessions where id = p_exam_session_id;
  return p_exam_session_id;
end;
$$;

revoke all on function public.delete_draft_exam_session(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_draft_exam_session(uuid, text, uuid)
  to service_role;
