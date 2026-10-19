do $catalog$
declare
  v_name text;
  v_signature text;
  v_oid regprocedure;
begin
  foreach v_name in array array[
    'users','exam_sessions','rooms','room_assignments','student_allocations',
    'attendance_events','incidents','attendance_requests','auth_rate_limits',
    'email_jobs','email_deliveries','email_webhook_events','admin_audit_events',
    'ops_events','ops_scanners','ops_alerts'
  ] loop
    if not exists(select 1 from pg_class c
      where c.oid = to_regclass('public.' || v_name) and c.relrowsecurity) then
      raise exception 'Production catalog guard failed: required RLS table missing or unprotected.';
    end if;
  end loop;
  foreach v_signature in array array[
    'public.ops_ingest(text,jsonb,text,integer,integer)',
    'public.ops_claim_alert(text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null
      or not has_function_privilege('service_role',v_oid,'execute')
      or has_function_privilege('anon',v_oid,'execute')
      or has_function_privilege('authenticated',v_oid,'execute') then
      raise exception 'Production operations guard failed: required restricted RPC missing or incorrectly exposed.';
    end if;
  end loop;
  foreach v_name in array array['ops_events','ops_scanners','ops_alerts'] loop
    if has_table_privilege('anon','public.' || v_name,'select')
      or has_table_privilege('authenticated','public.' || v_name,'select') then
      raise exception 'Production operations guard failed: private monitoring table exposed.';
    end if;
  end loop;
  foreach v_signature in array array[
    'public.transition_exam_session(uuid,text)',
    'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)',
    'public.stage_invigilator_access_code(uuid,text)',
    'public.activate_invigilator_access_code(uuid,text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null or has_function_privilege('service_role',v_oid,'execute') then
      raise exception 'Production catalog guard failed: unaudited legacy core is accessible or missing.';
    end if;
  end loop;
  if (select count(*) from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and t.tgenabled='O'
      and (c.relname,t.tgname) in (
        ('attendance_events','attendance_events_validate_integrity'),
        ('incidents','incidents_validate_integrity'),
        ('admin_audit_events','protect_admin_audit_events')
      )) <> 3 then
    raise exception 'Production catalog guard failed: audit/integrity trigger missing or disabled.';
  end if;
end;
$catalog$;
