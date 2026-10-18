-- Catalog-only snapshot. Run separately on staging and production and compare;
-- this does not infer which migration files have run or read business records.
begin transaction read only;
set local statement_timeout = '15s';

with expected_tables(name) as (
  values ('users'), ('exam_sessions'), ('rooms'), ('room_assignments'),
    ('student_allocations'), ('attendance_events'), ('incidents'),
    ('attendance_requests'), ('auth_rate_limits'), ('email_jobs'),
    ('email_deliveries'), ('email_webhook_events'), ('admin_audit_events'),
    ('ops_events'), ('ops_scanners'), ('ops_alerts')
), app_functions as (
  select p.oid, p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    md5(pg_get_functiondef(p.oid)) as definition_md5,
    p.prosecdef as security_definer,
    p.proconfig as settings
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname = any(array[
      'mark_attendance_atomic', 'mark_attendance_atomic_core',
      'import_exam_session_atomic', 'replace_room_assignments_atomic',
      'transition_exam_session', 'delete_draft_exam_session',
      'stage_invigilator_access_code', 'activate_invigilator_access_code',
      'write_admin_audit_event', 'prevent_admin_audit_event_mutation',
      'validate_attendance_event_integrity', 'validate_incident_integrity',
      'consume_auth_rate_limit', 'get_admin_dashboard_summary',
      'get_attendance_audit_page', 'get_incident_audit_page',
      'get_exam_session_page', 'get_invigilator_page', 'refresh_email_job_status',
      'create_assignment_email_job', 'create_access_code_email_job',
      'claim_email_deliveries', 'complete_email_delivery_attempt',
      'record_email_provider_event', 'retry_failed_email_deliveries',
      'ops_ingest', 'ops_claim_alert'
    ])
), legacy_signatures(signature) as (
  values ('public.transition_exam_session(uuid,text)'),
    ('public.replace_room_assignments_atomic(uuid,jsonb,jsonb)'),
    ('public.stage_invigilator_access_code(uuid,text)'),
    ('public.activate_invigilator_access_code(uuid,text)')
)
select jsonb_build_object(
  'capturedAt', current_timestamp,
  'serverVersion', current_setting('server_version'),
  'transactionReadOnly', current_setting('transaction_read_only'),
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', t.name, 'present', c.oid is not null,
    'rlsEnabled', c.relrowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull
    ) order by a.attnum) from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
  ) order by t.name) from expected_tables t
    left join pg_class c on c.oid = to_regclass('public.' || t.name)),
  'functions', (select jsonb_agg(jsonb_build_object(
    'name', proname, 'arguments', arguments, 'definitionMd5', definition_md5,
    'securityDefiner', security_definer, 'settings', settings,
    'anonExecute', has_function_privilege('anon', oid, 'EXECUTE'),
    'authenticatedExecute', has_function_privilege('authenticated', oid, 'EXECUTE'),
    'serviceRoleExecute', has_function_privilege('service_role', oid, 'EXECUTE')
  ) order by proname, arguments) from app_functions),
  'legacyCoreAccess', (select jsonb_agg(jsonb_build_object(
    'signature', signature,
    'present', to_regprocedure(signature) is not null,
    'serviceRoleExecute', case when to_regprocedure(signature) is not null
      then has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE')
      else null end
  ) order by signature) from legacy_signatures),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'table', c.relname, 'name', t.tgname, 'enabled', t.tgenabled,
    'definitionMd5', md5(pg_get_triggerdef(t.oid))
  ) order by c.relname, t.tgname)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and c.relname in (select name from expected_tables)),
  'unvalidatedConstraints', (select coalesce(jsonb_agg(jsonb_build_object(
    'table', c.relname, 'name', con.conname
  ) order by c.relname, con.conname), '[]'::jsonb)
    from pg_constraint con join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not con.convalidated
      and c.relname in (select name from expected_tables))
);

rollback;
