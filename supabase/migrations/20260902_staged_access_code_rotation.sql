alter table public.users
  add column if not exists pending_access_code_hash text,
  add column if not exists access_code_created_at timestamptz,
  add column if not exists access_code_activated_at timestamptz,
  add column if not exists access_code_emailed_at timestamptz,
  add column if not exists access_code_revoked_at timestamptz;

create unique index if not exists idx_users_pending_access_code_hash
  on public.users(pending_access_code_hash)
  where pending_access_code_hash is not null;

create or replace function public.stage_invigilator_access_code(
  p_user_id uuid,
  p_access_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_created_at timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_access_code_hash), '') is null then
    raise exception 'Access-code hash is required.' using errcode = '22023';
  end if;

  update public.users
  set pending_access_code_hash = p_access_code_hash,
      access_code_created_at = v_created_at
  where id = p_user_id
    and role = 'invigilator';

  if not found then
    raise exception 'Invigilator not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'userId', p_user_id::text,
    'status', 'pending',
    'createdAt', v_created_at
  );
end;
$$;

create or replace function public.activate_invigilator_access_code(
  p_user_id uuid,
  p_access_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users%rowtype;
  v_activated_at timestamptz := clock_timestamp();
begin
  select * into v_user
  from public.users
  where id = p_user_id
    and role = 'invigilator'
  for update;

  if not found then
    raise exception 'Invigilator not found.' using errcode = 'P0002';
  end if;

  if v_user.pending_access_code_hash is distinct from p_access_code_hash then
    raise exception 'Pending access code does not match.' using errcode = '40001';
  end if;

  update public.users
  set access_code_hash = pending_access_code_hash,
      pending_access_code_hash = null,
      access_code_activated_at = v_activated_at,
      access_code_emailed_at = null,
      access_code_revoked_at = case
        when access_code_hash is not null then v_activated_at
        else access_code_revoked_at
      end
  where id = p_user_id;

  return jsonb_build_object(
    'userId', p_user_id::text,
    'status', 'active',
    'activatedAt', v_activated_at
  );
end;
$$;

create or replace function public.cancel_pending_invigilator_access_code(
  p_user_id uuid,
  p_access_code_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.users
  set pending_access_code_hash = null
  where id = p_user_id
    and role = 'invigilator'
    and pending_access_code_hash = p_access_code_hash;

  if not found then
    raise exception 'Pending access code does not match.' using errcode = '40001';
  end if;
end;
$$;

create or replace function public.record_invigilator_access_code_emailed(
  p_user_id uuid,
  p_access_code_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emailed_at timestamptz := clock_timestamp();
begin
  update public.users
  set access_code_emailed_at = v_emailed_at
  where id = p_user_id
    and role = 'invigilator'
    and access_code_hash = p_access_code_hash;

  if not found then
    raise exception 'Active access code does not match.' using errcode = '40001';
  end if;

  return v_emailed_at;
end;
$$;

revoke all on function public.stage_invigilator_access_code(uuid, text)
  from public, anon, authenticated;
revoke all on function public.activate_invigilator_access_code(uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_pending_invigilator_access_code(uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_invigilator_access_code_emailed(uuid, text)
  from public, anon, authenticated;

grant execute on function public.stage_invigilator_access_code(uuid, text)
  to service_role;
grant execute on function public.activate_invigilator_access_code(uuid, text)
  to service_role;
grant execute on function public.cancel_pending_invigilator_access_code(uuid, text)
  to service_role;
grant execute on function public.record_invigilator_access_code_emailed(uuid, text)
  to service_role;
