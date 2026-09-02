create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid references public.exam_sessions(id) on delete set null,
  job_type text not null check (job_type in ('assignment_bulk', 'access_code_single')),
  idempotency_key text not null unique,
  template_version text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'partial', 'failed')),
  requested_by uuid references public.users(id) on delete set null,
  total_count integer not null default 0 check (total_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  exam_session_id uuid references public.exam_sessions(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  recipient_email text not null,
  template_type text not null check (template_type in ('assignment', 'access_code')),
  template_version text not null,
  template_data jsonb not null,
  provider text check (provider in ('resend', 'smtp')),
  provider_message_id text,
  status text not null default 'queued'
    check (status in (
      'queued', 'sending', 'accepted', 'delivered', 'bounced', 'complained',
      'failed', 'unknown'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_reason text,
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (job_id, recipient_email)
);

alter table public.email_deliveries
  add column if not exists template_data jsonb;
update public.email_deliveries
set template_data = '{}'::jsonb
where template_data is null;
alter table public.email_deliveries
  alter column template_data set not null;

create table if not exists public.email_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('resend')),
  provider_event_id text not null,
  event_type text not null,
  provider_message_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create unique index if not exists idx_email_deliveries_provider_message
  on public.email_deliveries(provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists idx_email_jobs_exam_created
  on public.email_jobs(exam_session_id, created_at desc);
create unique index if not exists idx_email_jobs_one_active_assignment
  on public.email_jobs(exam_session_id, job_type)
  where exam_session_id is not null
    and job_type = 'assignment_bulk'
    and status in ('queued', 'processing');
create index if not exists idx_email_deliveries_job_status
  on public.email_deliveries(job_id, status, next_attempt_at);
create index if not exists idx_email_deliveries_recipient
  on public.email_deliveries(recipient_email, requested_at desc);

alter table public.email_jobs enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.email_webhook_events enable row level security;

create or replace function public.refresh_email_job_status(p_job_id uuid)
returns public.email_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.email_jobs%rowtype;
begin
  update public.email_jobs job
  set total_count = summary.total_count,
      processed_count = summary.processed_count,
      accepted_count = summary.accepted_count,
      failed_count = summary.failed_count,
      status = case
        when summary.total_count = 0 then 'failed'
        when summary.pending_count > 0 and job.started_at is null then 'queued'
        when summary.pending_count > 0 then 'processing'
        when summary.failed_count = summary.total_count then 'failed'
        when summary.failed_count > 0 then 'partial'
        else 'completed'
      end,
      completed_at = case
        when summary.pending_count = 0 then coalesce(job.completed_at, clock_timestamp())
        else null
      end,
      updated_at = clock_timestamp()
  from (
    select
      count(*)::integer as total_count,
      count(*) filter (where status not in ('queued', 'sending'))::integer as processed_count,
      count(*) filter (where status in ('accepted', 'delivered'))::integer as accepted_count,
      count(*) filter (where status in ('failed', 'bounced', 'complained'))::integer as failed_count,
      count(*) filter (where status in ('queued', 'sending'))::integer as pending_count
    from public.email_deliveries
    where job_id = p_job_id
  ) summary
  where job.id = p_job_id
  returning job.* into v_job;

  if not found then
    raise exception 'Email job not found.' using errcode = 'P0002';
  end if;

  return v_job;
end;
$$;

create or replace function public.create_assignment_email_job(
  p_exam_session_id uuid,
  p_requested_by uuid,
  p_template_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.email_jobs%rowtype;
  v_created boolean := false;
begin
  if nullif(btrim(p_template_version), '') is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Template version and idempotency key are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.exam_sessions where id = p_exam_session_id) then
    raise exception 'Exam session not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.users where id = p_requested_by and role = 'admin'
  ) then
    raise exception 'Requesting administrator not found.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_exam_session_id::text || ':assignment_bulk', 0)
  );
  select * into v_job
  from public.email_jobs
  where exam_session_id = p_exam_session_id
    and job_type = 'assignment_bulk'
    and status in ('queued', 'processing')
  order by created_at
  limit 1;

  if found then
    return jsonb_build_object(
      'jobId', v_job.id::text,
      'created', false,
      'status', v_job.status,
      'totalCount', v_job.total_count,
      'processedCount', v_job.processed_count,
      'acceptedCount', v_job.accepted_count,
      'failedCount', v_job.failed_count
    );
  end if;

  insert into public.email_jobs (
    exam_session_id, job_type, idempotency_key, template_version, requested_by
  ) values (
    p_exam_session_id, 'assignment_bulk', btrim(p_idempotency_key),
    btrim(p_template_version), p_requested_by
  )
  on conflict (idempotency_key) do nothing
  returning * into v_job;

  v_created := found;

  if not v_created then
    select * into strict v_job
    from public.email_jobs
    where idempotency_key = btrim(p_idempotency_key);

    if v_job.exam_session_id is distinct from p_exam_session_id
      or v_job.job_type <> 'assignment_bulk'
      or v_job.template_version <> btrim(p_template_version) then
      raise exception 'Idempotency key is already used for a different email job.'
        using errcode = '23505';
    end if;
  else
    insert into public.email_deliveries (
      job_id, exam_session_id, user_id, recipient_email, template_type, template_version,
      template_data
    )
    select distinct
      v_job.id, p_exam_session_id, invigilator.id, lower(btrim(invigilator.email)),
      'assignment', btrim(p_template_version),
      jsonb_build_object(
        'fullName', invigilator.full_name,
        'session', jsonb_build_object(
          'id', session.id,
          'name', session.name,
          'examDate', session.exam_date,
          'startTime', session.start_time,
          'published', session.published,
          'status', session.status,
          'createdAt', session.created_at
        ),
        'rooms', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', assigned_room.id,
                'examSessionId', assigned_room.exam_session_id,
                'code', assigned_room.code,
                'displayName', assigned_room.display_name,
                'capacity', assigned_room.capacity
              ) order by assigned_room.code
            ),
            '[]'::jsonb
          )
          from public.room_assignments assigned
          join public.rooms assigned_room on assigned_room.id = assigned.room_id
          where assigned.user_id = invigilator.id
            and assigned_room.exam_session_id = p_exam_session_id
        )
      )
    from public.room_assignments assignment
    join public.rooms room on room.id = assignment.room_id
    join public.exam_sessions session on session.id = room.exam_session_id
    join public.users invigilator
      on invigilator.id = assignment.user_id and invigilator.role = 'invigilator'
    where room.exam_session_id = p_exam_session_id
    on conflict (job_id, recipient_email) do nothing;

    if not exists (select 1 from public.email_deliveries where job_id = v_job.id) then
      delete from public.email_jobs where id = v_job.id;
      raise exception 'No assigned invigilators were found for this exam.' using errcode = '23514';
    end if;

    select * into v_job from public.refresh_email_job_status(v_job.id);
  end if;

  return jsonb_build_object(
    'jobId', v_job.id::text,
    'created', v_created,
    'status', v_job.status,
    'totalCount', v_job.total_count,
    'processedCount', v_job.processed_count,
    'acceptedCount', v_job.accepted_count,
    'failedCount', v_job.failed_count
  );
end;
$$;

create or replace function public.create_access_code_email_job(
  p_user_id uuid,
  p_requested_by uuid,
  p_template_version text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.email_jobs%rowtype;
  v_invigilator public.users%rowtype;
  v_created boolean := false;
begin
  if nullif(btrim(p_template_version), '') is null
    or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'Template version and idempotency key are required.' using errcode = '22023';
  end if;
  select * into v_invigilator
  from public.users
  where id = p_user_id and role = 'invigilator';
  if not found then
    raise exception 'Invigilator not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.users where id = p_requested_by and role = 'admin'
  ) then
    raise exception 'Requesting administrator not found.' using errcode = '42501';
  end if;

  insert into public.email_jobs (
    job_type, idempotency_key, template_version, requested_by
  ) values (
    'access_code_single', btrim(p_idempotency_key), btrim(p_template_version), p_requested_by
  )
  on conflict (idempotency_key) do nothing
  returning * into v_job;
  v_created := found;

  if not v_created then
    select * into strict v_job
    from public.email_jobs
    where idempotency_key = btrim(p_idempotency_key);

    if v_job.job_type <> 'access_code_single'
      or v_job.template_version <> btrim(p_template_version)
      or not exists (
        select 1 from public.email_deliveries
        where job_id = v_job.id and user_id = p_user_id
      ) then
      raise exception 'Idempotency key is already used for a different email job.'
        using errcode = '23505';
    end if;
  else
    insert into public.email_deliveries (
      job_id, user_id, recipient_email, template_type, template_version, template_data
    ) values (
      v_job.id, v_invigilator.id, lower(btrim(v_invigilator.email)), 'access_code',
      btrim(p_template_version), jsonb_build_object('fullName', v_invigilator.full_name)
    );
    select * into v_job from public.refresh_email_job_status(v_job.id);
  end if;

  return jsonb_build_object(
    'jobId', v_job.id::text,
    'created', v_created,
    'status', v_job.status,
    'totalCount', v_job.total_count,
    'processedCount', v_job.processed_count,
    'acceptedCount', v_job.accepted_count,
    'failedCount', v_job.failed_count
  );
end;
$$;

create or replace function public.claim_email_deliveries(
  p_job_id uuid,
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 60
)
returns setof public.email_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_worker_id), '') is null
    or p_limit < 1 or p_limit > 25
    or p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'Invalid email delivery claim parameters.' using errcode = '22023';
  end if;

  update public.email_jobs
  set status = 'processing',
      started_at = coalesce(started_at, clock_timestamp()),
      completed_at = null,
      updated_at = clock_timestamp()
  where id = p_job_id
    and status in ('queued', 'processing', 'partial', 'failed');

  return query
  with candidates as (
    select delivery.id
    from public.email_deliveries delivery
    where delivery.job_id = p_job_id
      and (
        (delivery.status = 'queued' and delivery.next_attempt_at <= clock_timestamp())
        or (delivery.status = 'sending' and delivery.lease_expires_at < clock_timestamp())
      )
    order by delivery.requested_at, delivery.id
    for update skip locked
    limit p_limit
  )
  update public.email_deliveries delivery
  set status = 'sending',
      attempt_count = delivery.attempt_count + 1,
      lease_owner = btrim(p_worker_id),
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      failure_reason = null,
      updated_at = clock_timestamp()
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

create or replace function public.complete_email_delivery_attempt(
  p_delivery_id uuid,
  p_worker_id text,
  p_status text,
  p_provider text default null,
  p_provider_message_id text default null,
  p_failure_reason text default null,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.email_deliveries%rowtype;
  v_job public.email_jobs%rowtype;
  v_next_status text;
begin
  if p_status not in ('accepted', 'failed') then
    raise exception 'Attempt status must be accepted or failed.' using errcode = '22023';
  end if;
  if p_provider is not null and p_provider not in ('resend', 'smtp') then
    raise exception 'Unsupported email provider.' using errcode = '22023';
  end if;
  if p_retry_after_seconds is not null
    and (p_retry_after_seconds < 1 or p_retry_after_seconds > 86400) then
    raise exception 'Invalid retry delay.' using errcode = '22023';
  end if;

  v_next_status := case
    when p_status = 'failed' and p_retry_after_seconds is not null then 'queued'
    else p_status
  end;

  update public.email_deliveries
  set status = v_next_status,
      provider = coalesce(p_provider, provider),
      provider_message_id = coalesce(nullif(btrim(p_provider_message_id), ''), provider_message_id),
      failure_reason = nullif(btrim(p_failure_reason), ''),
      next_attempt_at = case
        when v_next_status = 'queued'
          then clock_timestamp() + make_interval(secs => p_retry_after_seconds)
        else next_attempt_at
      end,
      accepted_at = case when p_status = 'accepted' then clock_timestamp() else accepted_at end,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where id = p_delivery_id
    and status = 'sending'
    and lease_owner = btrim(p_worker_id)
  returning * into v_delivery;

  if not found then
    raise exception 'Email delivery claim is no longer owned by this worker.' using errcode = '40001';
  end if;

  select * into v_job from public.refresh_email_job_status(v_delivery.job_id);
  return jsonb_build_object(
    'deliveryId', v_delivery.id::text,
    'deliveryStatus', v_delivery.status,
    'jobId', v_job.id::text,
    'jobStatus', v_job.status
  );
end;
$$;

create or replace function public.record_email_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_delivery public.email_deliveries%rowtype;
  v_inserted boolean := false;
  v_status text;
begin
  if p_provider <> 'resend'
    or nullif(btrim(p_provider_event_id), '') is null
    or nullif(btrim(p_event_type), '') is null then
    raise exception 'Invalid provider event.' using errcode = '22023';
  end if;

  insert into public.email_webhook_events (
    provider, provider_event_id, event_type, provider_message_id, payload
  ) values (
    p_provider, btrim(p_provider_event_id), btrim(p_event_type),
    nullif(btrim(p_provider_message_id), ''), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id, true into v_event_id, v_inserted;

  if v_inserted is not true then
    select id into v_event_id
    from public.email_webhook_events
    where provider = p_provider and provider_event_id = btrim(p_provider_event_id);

    return jsonb_build_object('eventId', v_event_id::text, 'duplicate', true);
  end if;

  v_status := case btrim(p_event_type)
    when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    else 'unknown'
  end;

  update public.email_deliveries
  set status = case
        when status in ('bounced', 'complained') then status
        when v_status = 'unknown' and status in ('accepted', 'delivered') then status
        else v_status
      end,
      delivered_at = case when v_status = 'delivered' then clock_timestamp() else delivered_at end,
      failure_reason = case
        when v_status in ('bounced', 'complained') then btrim(p_event_type)
        else failure_reason
      end,
      updated_at = clock_timestamp()
  where provider = p_provider
    and provider_message_id = nullif(btrim(p_provider_message_id), '')
  returning * into v_delivery;

  update public.email_webhook_events
  set processed_at = clock_timestamp()
  where id = v_event_id;

  if v_delivery.id is not null then
    perform public.refresh_email_job_status(v_delivery.job_id);
  end if;

  return jsonb_build_object(
    'eventId', v_event_id::text,
    'duplicate', false,
    'matched', v_delivery.id is not null,
    'deliveryStatus', v_delivery.status
  );
end;
$$;

create or replace function public.retry_failed_email_deliveries(
  p_job_id uuid,
  p_delivery_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_retried integer;
  v_job public.email_jobs%rowtype;
begin
  if p_delivery_ids is null or cardinality(p_delivery_ids) = 0 then
    raise exception 'Select at least one failed email delivery.' using errcode = '22023';
  end if;

  update public.email_deliveries
  set status = 'queued',
      failure_reason = null,
      next_attempt_at = clock_timestamp(),
      lease_owner = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where job_id = p_job_id
    and id = any(p_delivery_ids)
    and status = 'failed';

  get diagnostics v_retried = row_count;
  if v_retried = 0 then
    raise exception 'No selected failed email deliveries can be retried.' using errcode = '55000';
  end if;

  select * into v_job from public.refresh_email_job_status(p_job_id);
  return jsonb_build_object(
    'jobId', v_job.id::text,
    'status', v_job.status,
    'retriedCount', v_retried
  );
end;
$$;

revoke all on table public.email_jobs from public, anon, authenticated;
revoke all on table public.email_deliveries from public, anon, authenticated;
revoke all on table public.email_webhook_events from public, anon, authenticated;
revoke all on function public.refresh_email_job_status(uuid) from public, anon, authenticated;
revoke all on function public.create_assignment_email_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_access_code_email_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_email_deliveries(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_email_delivery_attempt(uuid, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.record_email_provider_event(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.retry_failed_email_deliveries(uuid, uuid[]) from public, anon, authenticated;

grant select, insert, update, delete on table public.email_jobs to service_role;
grant select, insert, update, delete on table public.email_deliveries to service_role;
grant select, insert, update, delete on table public.email_webhook_events to service_role;
grant execute on function public.refresh_email_job_status(uuid) to service_role;
grant execute on function public.create_assignment_email_job(uuid, uuid, text, text) to service_role;
grant execute on function public.create_access_code_email_job(uuid, uuid, text, text) to service_role;
grant execute on function public.claim_email_deliveries(uuid, text, integer, integer) to service_role;
grant execute on function public.complete_email_delivery_attempt(uuid, text, text, text, text, text, integer) to service_role;
grant execute on function public.record_email_provider_event(text, text, text, text, jsonb) to service_role;
grant execute on function public.retry_failed_email_deliveries(uuid, uuid[]) to service_role;
