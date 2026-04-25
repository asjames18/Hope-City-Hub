-- Add a single-response public config RPC and align keepalive with the same read path.

create or replace function public.get_public_page_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'site_config',
    (
      select jsonb_build_object(
        'announcement', sc.announcement,
        'links', sc.links,
        'socials', sc.socials
      )
      from public.site_config sc
      where sc.id = 1
    ),
    'events',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'date', e.date,
            'time', e.time,
            'signup_url', e.signup_url,
            'order_index', e.order_index
          )
          order by e.order_index asc, e.created_at asc
        )
        from public.events e
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_public_page_config() from public;
grant execute on function public.get_public_page_config() to anon, authenticated;

create or replace function public.keepalive_touch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.get_public_page_config();

  return jsonb_build_object(
    'ok', true,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.keepalive_touch() from public;

create or replace function public.keepalive_ping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'Not allowed';
  end if;

  return public.keepalive_touch();
end;
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
