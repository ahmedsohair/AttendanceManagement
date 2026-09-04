create table if not exists public.ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('api', 'scanner')),
  payload jsonb not null check (octet_length(payload::text) <= 10000)
);
create index if not exists ops_events_time on public.ops_events(created_at desc, id desc);
create table if not exists public.ops_scanners (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  seen_at timestamptz not null default now(),
  pending integer not null check (pending between 0 and 100000),
  conflicts integer not null check (conflicts between 0 and 100000)
);
create table if not exists public.ops_alerts (
  key text primary key check (key in ('mark_failures','api_failures','database_slow','email_bounces','scanner_errors','telemetry_missing')),
  claimed_at timestamptz not null,
  claim_id uuid not null,
  state text not null check (state in ('sending','accepted','unknown'))
);
alter table public.ops_events enable row level security;
alter table public.ops_scanners enable row level security;
alter table public.ops_alerts enable row level security;
revoke all on public.ops_events, public.ops_scanners, public.ops_alerts from public, anon, authenticated;
grant select, update on public.ops_alerts to service_role;
grant select on public.ops_events, public.ops_scanners to service_role;

create or replace function public.ops_ingest(p_kind text, p_payload jsonb,
  p_key text default null, p_pending integer default 0, p_conflicts integer default 0)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Bound retained diagnostic volume, not attendance data. Serialize pruning and insert.
  perform pg_advisory_xact_lock(84040904);
  delete from public.ops_events where created_at < now() - interval '48 hours';
  if (select count(*) from public.ops_events) >= 20000 then
    delete from public.ops_events where id in (select id from public.ops_events order by created_at, id limit 1000);
  end if;
  insert into public.ops_events(kind, payload) values(p_kind, p_payload);
  delete from public.ops_scanners where seen_at < now() - interval '24 hours';
  if p_key is not null then
    if (select count(*) from public.ops_scanners) >= 1000 and not exists(select 1 from public.ops_scanners where key = p_key) then
      delete from public.ops_scanners where key in (select key from public.ops_scanners order by seen_at limit 100);
    end if;
    insert into public.ops_scanners(key, pending, conflicts) values(p_key, p_pending, p_conflicts)
    on conflict(key) do update set pending = excluded.pending, conflicts = excluded.conflicts, seen_at = now();
  end if;
end $$;

create or replace function public.ops_claim_alert(p_key text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid := gen_random_uuid(); v_result uuid;
begin
  insert into public.ops_alerts(key, claimed_at, claim_id, state) values(p_key, now(), v_id, 'sending')
  on conflict(key) do update set claimed_at = now(), claim_id = excluded.claim_id, state = 'sending'
    where public.ops_alerts.claimed_at < now() - interval '15 minutes'
  returning claim_id into v_result;
  return v_result;
end $$;
revoke all on function public.ops_ingest(text,jsonb,text,integer,integer), public.ops_claim_alert(text) from public, anon, authenticated;
grant execute on function public.ops_ingest(text,jsonb,text,integer,integer), public.ops_claim_alert(text) to service_role;
