begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_first_id uuid := gen_random_uuid();
  v_second_id uuid := gen_random_uuid();
  v_third_id uuid := gen_random_uuid();
  v_test_token text := 'staff-token-' || gen_random_uuid()::text;
  v_count bigint;
  v_first_name text;
begin
  insert into public.users (id, email, full_name, role)
  values
    (v_admin_id, v_test_token || '-admin@example.com', v_test_token || ' Admin', 'admin'),
    (v_first_id, v_test_token || '-one@example.com', v_test_token || ' Alpha', 'invigilator'),
    (v_second_id, v_test_token || '-two@example.com', v_test_token || ' Beta', 'invigilator'),
    (v_third_id, v_test_token || '-three@example.com', v_test_token || ' Gamma', 'invigilator');

  select total_count, full_name into strict v_count, v_first_name
  from public.get_invigilator_page(v_test_token, 'name_asc', 1, 2)
  order by lower(full_name), id
  limit 1;
  if v_count <> 3 or v_first_name <> v_test_token || ' Alpha' then
    raise exception 'Invigilator pagination, role filter, or ascending sort failed.';
  end if;

  select count(*) into v_count
  from public.get_invigilator_page(v_test_token, 'name_asc', 2, 2);
  if v_count <> 1 then
    raise exception 'Second invigilator page has an unexpected row count.';
  end if;

  select full_name into strict v_first_name
  from public.get_invigilator_page(v_test_token, 'name_desc', 1, 2)
  order by lower(full_name) desc, id desc
  limit 1;
  if v_first_name <> v_test_token || ' Gamma' then
    raise exception 'Descending invigilator sort failed.';
  end if;

  select count(*) into v_count
  from public.get_invigilator_page(v_test_token || '-two@example.com', 'name_asc', 1, 30);
  if v_count <> 1 then
    raise exception 'Invigilator email search failed.';
  end if;

  begin
    perform * from public.get_invigilator_page(null, 'invalid', 1, 30);
    raise exception 'Invalid invigilator sort was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  begin
    perform * from public.get_invigilator_page(null, 'name_asc', 1, 101);
    raise exception 'Oversized invigilator page was accepted.';
  exception
    when invalid_parameter_value then null;
  end;

  if has_function_privilege(
    'anon',
    'public.get_invigilator_page(text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anonymous role can execute the invigilator function.';
  end if;
end;
$$;

rollback;
