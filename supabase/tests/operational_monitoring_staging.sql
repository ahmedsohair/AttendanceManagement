begin;
do $$
declare v_claim uuid;
begin
  if has_function_privilege('anon', 'public.ops_ingest(text,jsonb,text,integer,integer)', 'execute')
    or has_function_privilege('authenticated', 'public.ops_claim_alert(text)', 'execute')
    or has_table_privilege('authenticated', 'public.ops_events', 'select') then
    raise exception 'Operational data is exposed to application clients.';
  end if;
  if exists(select 1 from pg_class where oid in ('public.ops_events'::regclass, 'public.ops_scanners'::regclass, 'public.ops_alerts'::regclass) and not relrowsecurity) then
    raise exception 'Operational RLS is missing.';
  end if;
  -- Entire fixture and pruning effects are rolled back, including existing diagnostic data.
  delete from public.ops_events;
  delete from public.ops_scanners;
  delete from public.ops_alerts;
  perform public.ops_ingest('scanner', '{"events":[]}'::jsonb, repeat('a',64), 3, 1);
  perform public.ops_ingest('scanner', '{"events":[]}'::jsonb, repeat('a',64), 1, 0);
  if (select count(*) from public.ops_scanners) <> 1 or (select pending from public.ops_scanners) <> 1 then
    raise exception 'Scanner heartbeat upsert failed.';
  end if;
  v_claim := public.ops_claim_alert('mark_failures');
  if v_claim is null or public.ops_claim_alert('mark_failures') is not null then
    raise exception 'Alert cooldown failed.';
  end if;
  update public.ops_alerts set claimed_at = now() - interval '16 minutes';
  if public.ops_claim_alert('mark_failures') is null then raise exception 'Alert cooldown did not expire.'; end if;
  begin
    perform public.ops_ingest('scanner', '{}'::jsonb, repeat('a',64), -1, 0);
    raise exception 'Negative queue size accepted.';
  exception when check_violation then null;
  end;
  insert into public.ops_events(kind,payload) select 'api','{}'::jsonb from generate_series(1,20000);
  insert into public.ops_events(kind,payload,created_at) values('api','{}',now() - interval '49 hours');
  perform public.ops_ingest('api','{}');
  if (select count(*) from public.ops_events) > 20000 or exists(select 1 from public.ops_events where created_at < now() - interval '48 hours') then
    raise exception 'Diagnostic retention bound failed.';
  end if;
end $$;
rollback;
