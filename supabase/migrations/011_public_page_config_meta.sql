-- Add a lightweight config metadata RPC and include freshness metadata in the public config payload.

create or replace function public.get_public_page_config_meta()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with site_payload as (
    select coalesce(
      (
        select jsonb_build_object(
          'announcement', sc.announcement,
          'links', sc.links,
          'socials', sc.socials,
          'updated_at', sc.updated_at
        )
        from public.site_config sc
        where sc.id = 1
      ),
      '{}'::jsonb
    ) as value
  ),
  events_payload as (
    select coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'date', e.date,
            'time', e.time,
            'signup_url', e.signup_url,
            'order_index', e.order_index,
            'created_at', e.created_at
          )
          order by e.order_index asc, e.created_at asc
        )
        from public.events e
      ),
      '[]'::jsonb
    ) as value
  )
  select jsonb_build_object(
    'cache_key', md5(site_payload.value::text || ':' || events_payload.value::text),
    'generated_at', now()
  )
  from site_payload, events_payload;
$$;

revoke all on function public.get_public_page_config_meta() from public;
grant execute on function public.get_public_page_config_meta() to anon, authenticated;

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
    ),
    'meta',
    public.get_public_page_config_meta()
  );
$$;

revoke all on function public.get_public_page_config() from public;
grant execute on function public.get_public_page_config() to anon, authenticated;
