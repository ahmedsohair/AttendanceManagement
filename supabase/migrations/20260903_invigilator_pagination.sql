create index if not exists idx_users_role_name
  on public.users(role, lower(full_name), id);

create or replace function public.get_invigilator_page(
  p_query text default null,
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 30
)
returns table (
  id uuid,
  email text,
  full_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := lower(nullif(btrim(p_query), ''));
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'name_asc');
begin
  if v_sort not in ('name_asc', 'name_desc') then
    raise exception 'Invigilator sort order is invalid.' using errcode = '22023';
  end if;
  if p_page < 1 then
    raise exception 'Page must be at least 1.' using errcode = '22023';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise exception 'Page size must be between 1 and 100.' using errcode = '22023';
  end if;

  return query
  select
    app_user.id,
    app_user.email,
    app_user.full_name,
    count(*) over() as total_count
  from public.users app_user
  where app_user.role = 'invigilator'
    and (
      v_query is null
      or strpos(lower(app_user.full_name), v_query) > 0
      or strpos(lower(app_user.email), v_query) > 0
    )
  order by
    case when v_sort = 'name_asc' then lower(app_user.full_name) end asc,
    case when v_sort = 'name_asc' then app_user.id end asc,
    case when v_sort = 'name_desc' then lower(app_user.full_name) end desc,
    case when v_sort = 'name_desc' then app_user.id end desc
  limit p_page_size
  offset ((p_page - 1)::bigint * p_page_size::bigint);
end;
$$;

revoke all on function public.get_invigilator_page(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_invigilator_page(text, text, integer, integer)
  to service_role;
