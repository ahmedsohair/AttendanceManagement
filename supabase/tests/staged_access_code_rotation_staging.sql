begin;

do $$
declare
  v_user_id uuid;
  v_original_hash text;
  v_pending_hash text := repeat('b', 64);
  v_replacement_hash text := repeat('c', 64);
  v_response jsonb;
begin
  select id, access_code_hash into strict v_user_id, v_original_hash
  from public.users
  where email = 'invigilator01@example.com';

  v_response := public.stage_invigilator_access_code(v_user_id, v_pending_hash);
  if v_response ->> 'status' <> 'pending' then
    raise exception 'Staging did not return pending status.';
  end if;
  if (select access_code_hash from public.users where id = v_user_id)
      is distinct from v_original_hash then
    raise exception 'Staging changed the active access code.';
  end if;

  begin
    perform public.activate_invigilator_access_code(v_user_id, v_replacement_hash);
    raise exception 'Mismatched pending code was activated.';
  exception
    when serialization_failure then null;
  end;
  if (select access_code_hash from public.users where id = v_user_id)
      is distinct from v_original_hash then
    raise exception 'Failed activation changed the active access code.';
  end if;

  v_response := public.activate_invigilator_access_code(v_user_id, v_pending_hash);
  if v_response ->> 'status' <> 'active'
    or (select access_code_hash from public.users where id = v_user_id) <> v_pending_hash
    or (select pending_access_code_hash from public.users where id = v_user_id) is not null
    or (select access_code_activated_at from public.users where id = v_user_id) is null
    or (select access_code_revoked_at from public.users where id = v_user_id) is null then
    raise exception 'Activation did not atomically promote the pending code.';
  end if;

  perform public.record_invigilator_access_code_emailed(v_user_id, v_pending_hash);
  if (select access_code_emailed_at from public.users where id = v_user_id) is null then
    raise exception 'Email timestamp was not recorded.';
  end if;

  perform public.stage_invigilator_access_code(v_user_id, v_replacement_hash);
  perform public.cancel_pending_invigilator_access_code(v_user_id, v_replacement_hash);
  if (select pending_access_code_hash from public.users where id = v_user_id) is not null
    or (select access_code_hash from public.users where id = v_user_id) <> v_pending_hash then
    raise exception 'Cancelling a pending code changed active credentials.';
  end if;
end;
$$;

rollback;
