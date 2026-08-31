create table if not exists public.auth_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_auth_rate_limits_updated_at
on public.auth_rate_limits(updated_at);

alter table public.auth_rate_limits enable row level security;

create or replace function public.consume_auth_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.auth_rate_limits%rowtype;
begin
  if p_key_hash is null
    or length(p_key_hash) < 32
    or p_limit < 1
    or p_window_seconds < 1
    or p_block_seconds < 1 then
    raise exception 'Invalid rate-limit parameters.';
  end if;

  insert into public.auth_rate_limits (
    key_hash,
    window_started_at,
    attempt_count,
    blocked_until,
    updated_at
  )
  values (p_key_hash, v_now, 0, null, v_now)
  on conflict (key_hash) do nothing;

  select *
  into v_row
  from public.auth_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query
    select false, greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return;
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    v_row.window_started_at := v_now;
    v_row.attempt_count := 0;
    v_row.blocked_until := null;
  end if;

  v_row.attempt_count := v_row.attempt_count + 1;

  if v_row.attempt_count > p_limit then
    v_row.blocked_until := v_now + make_interval(secs => p_block_seconds);

    update public.auth_rate_limits
    set window_started_at = v_row.window_started_at,
        attempt_count = v_row.attempt_count,
        blocked_until = v_row.blocked_until,
        updated_at = v_now
    where key_hash = p_key_hash;

    return query select false, p_block_seconds;
    return;
  end if;

  update public.auth_rate_limits
  set window_started_at = v_row.window_started_at,
      attempt_count = v_row.attempt_count,
      blocked_until = null,
      updated_at = v_now
  where key_hash = p_key_hash;

  return query select true, 0;
end;
$$;

revoke all on table public.auth_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

revoke all on function public.consume_auth_rate_limit(text, integer, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, integer, integer, integer)
to service_role;

