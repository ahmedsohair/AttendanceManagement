begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_invigilator_one uuid := gen_random_uuid();
  v_invigilator_two uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_room_one uuid := gen_random_uuid();
  v_room_two uuid := gen_random_uuid();
  v_job_id uuid;
  v_delivery_id uuid;
  v_message_id text := 'staging-message-' || gen_random_uuid()::text;
  v_response jsonb;
  v_claimed integer;
  v_claimed_ids uuid[];
begin
  insert into public.users (id, email, full_name, role)
  values
    (v_admin_id, 'email-admin-' || v_admin_id || '@example.com', 'Email Admin', 'admin'),
    (v_invigilator_one, 'email-invigilator-one-' || v_invigilator_one || '@example.com', 'One', 'invigilator'),
    (v_invigilator_two, 'email-invigilator-two-' || v_invigilator_two || '@example.com', 'Two', 'invigilator');

  insert into public.exam_sessions (id, name, exam_date, start_time, status, created_by)
  values (v_session_id, 'Email Queue Test', current_date, '09:00', 'active', v_admin_id);

  insert into public.rooms (id, exam_session_id, code, display_name)
  values
    (v_room_one, v_session_id, 'EMAIL-1', 'Email Room 1'),
    (v_room_two, v_session_id, 'EMAIL-2', 'Email Room 2');

  insert into public.room_assignments (room_id, user_id)
  values
    (v_room_one, v_invigilator_one),
    (v_room_two, v_invigilator_one),
    (v_room_two, v_invigilator_two);

  v_response := public.create_assignment_email_job(
    v_session_id, v_admin_id, 'assignment-v1', 'staging-email-job-' || v_session_id::text
  );
  v_job_id := (v_response ->> 'jobId')::uuid;

  if (v_response ->> 'created')::boolean is not true
    or (v_response ->> 'totalCount')::integer <> 2
    or (select count(*) from public.email_deliveries where job_id = v_job_id) <> 2 then
    raise exception 'Email job did not snapshot each invigilator exactly once.';
  end if;
  if (select jsonb_array_length(template_data -> 'rooms')
      from public.email_deliveries
      where job_id = v_job_id and user_id = v_invigilator_one) <> 2 then
    raise exception 'Email job did not preserve the assigned-room snapshot.';
  end if;

  v_response := public.create_assignment_email_job(
    v_session_id, v_admin_id, 'assignment-v1', 'staging-email-job-' || v_session_id::text
  );
  if (v_response ->> 'created')::boolean is not false
    or (v_response ->> 'jobId')::uuid <> v_job_id
    or (select count(*) from public.email_deliveries where job_id = v_job_id) <> 2 then
    raise exception 'Email job idempotency failed.';
  end if;

  select count(*), array_agg(id) into v_claimed, v_claimed_ids
  from public.claim_email_deliveries(v_job_id, 'worker-one', 1, 60);
  if v_claimed <> 1 then
    raise exception 'First worker did not claim one delivery.';
  end if;
  v_delivery_id := v_claimed_ids[1];

  select count(*) into v_claimed
  from public.claim_email_deliveries(v_job_id, 'worker-two', 2, 60);
  if v_claimed <> 1 then
    raise exception 'Second worker claimed an already leased delivery.';
  end if;

  v_response := public.complete_email_delivery_attempt(
    v_delivery_id, 'worker-one', 'accepted', 'resend', v_message_id, null, null
  );
  if v_response ->> 'deliveryStatus' <> 'accepted' then
    raise exception 'Accepted provider response was not recorded.';
  end if;

  select id into strict v_delivery_id
  from public.email_deliveries
  where job_id = v_job_id and status = 'sending';

  perform public.complete_email_delivery_attempt(
    v_delivery_id, 'worker-two', 'failed', 'resend', null, 'provider unavailable', null
  );

  if (select status from public.email_jobs where id = v_job_id) <> 'partial'
    or (select accepted_count from public.email_jobs where id = v_job_id) <> 1
    or (select failed_count from public.email_jobs where id = v_job_id) <> 1 then
    raise exception 'Email job counters or partial status are incorrect.';
  end if;

  v_response := public.retry_failed_email_deliveries(v_job_id, array[v_delivery_id]);
  if (v_response ->> 'retriedCount')::integer <> 1
    or (select status from public.email_deliveries where id = v_delivery_id) <> 'queued' then
    raise exception 'Selected failed delivery was not safely requeued.';
  end if;

  select id into strict v_delivery_id
  from public.email_deliveries
  where job_id = v_job_id and status = 'accepted';
  begin
    perform public.retry_failed_email_deliveries(v_job_id, array[v_delivery_id]);
    raise exception 'Accepted delivery was incorrectly retried.';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  v_response := public.record_email_provider_event(
    'resend', 'event-delivered-' || v_job_id::text, 'email.delivered',
    v_message_id, jsonb_build_object('type', 'email.delivered')
  );
  if (v_response ->> 'matched')::boolean is not true
    or v_response ->> 'deliveryStatus' <> 'delivered' then
    raise exception 'Delivery webhook was not applied.';
  end if;

  v_response := public.record_email_provider_event(
    'resend', 'event-delivered-' || v_job_id::text, 'email.delivered',
    v_message_id, jsonb_build_object('type', 'email.delivered')
  );
  if (v_response ->> 'duplicate')::boolean is not true
    or (select count(*) from public.email_webhook_events
        where provider_event_id = 'event-delivered-' || v_job_id::text) <> 1 then
    raise exception 'Webhook event idempotency failed.';
  end if;
end;
$$;

rollback;
