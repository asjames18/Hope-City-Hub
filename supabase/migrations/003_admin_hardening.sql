-- Admin hardening: transactional config save + aggregated click summary RPC.

-- Expand click action domain to include announcement clicks.
alter table public.click_events
  drop constraint if exists click_events_action_check;

alter table public.click_events
  add constraint click_events_action_check
  check (action in ('connect', 'give', 'prayer', 'directions', 'announcement'));

create or replace function public.admin_save_site_config(
  p_announcement jsonb,
  p_links jsonb,
  p_socials jsonb,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  event_item jsonb;
  event_id uuid;
  keep_ids uuid[] := '{}';
  saved_site_config jsonb;
  saved_events jsonb;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;

  insert into public.site_config (id, announcement, links, socials, updated_at)
  values (1, coalesce(p_announcement, '{}'::jsonb), coalesce(p_links, '{}'::jsonb), coalesce(p_socials, '{}'::jsonb), now())
  on conflict (id) do update
  set
    announcement = excluded.announcement,
    links = excluded.links,
    socials = excluded.socials,
    updated_at = now();

  for event_item in
    select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    if nullif(event_item->>'id', '') is not null
      and (event_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      event_id := (event_item->>'id')::uuid;

      insert into public.events (id, title, date, time, signup_url, order_index)
      values (
        event_id,
        coalesce(event_item->>'title', ''),
        coalesce(event_item->>'date', ''),
        coalesce(event_item->>'time', ''),
        coalesce(event_item->>'signup_url', ''),
        coalesce((event_item->>'order_index')::int, 0)
      )
      on conflict (id) do update
      set
        title = excluded.title,
        date = excluded.date,
        time = excluded.time,
        signup_url = excluded.signup_url,
        order_index = excluded.order_index;
    else
      insert into public.events (title, date, time, signup_url, order_index)
      values (
        coalesce(event_item->>'title', ''),
        coalesce(event_item->>'date', ''),
        coalesce(event_item->>'time', ''),
        coalesce(event_item->>'signup_url', ''),
        coalesce((event_item->>'order_index')::int, 0)
      )
      returning id into event_id;
    end if;

    keep_ids := array_append(keep_ids, event_id);
  end loop;

  if coalesce(array_length(keep_ids, 1), 0) = 0 then
    delete from public.events;
  else
    delete from public.events
    where id <> all(keep_ids);
  end if;

  select jsonb_build_object(
    'announcement', sc.announcement,
    'links', sc.links,
    'socials', sc.socials
  ) into saved_site_config
  from public.site_config sc
  where sc.id = 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'date', e.date,
        'time', e.time,
        'signup_url', e.signup_url,
        'order_index', e.order_index
      )
      order by e.order_index asc, e.created_at asc
    ),
    '[]'::jsonb
  ) into saved_events
  from public.events e;

  return jsonb_build_object(
    'site_config', saved_site_config,
    'events', saved_events
  );
end;
$$;

create or replace function public.admin_click_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count int := 0;
  by_action jsonb;
  top_sources jsonb;
  top_tags jsonb;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;

  with filtered as (
    select *
    from public.click_events
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
  )
  select count(*)::int into total_count from filtered;

  with filtered as (
    select *
    from public.click_events
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
  )
  select jsonb_build_object(
    'connect', count(*) filter (where action = 'connect'),
    'give', count(*) filter (where action = 'give'),
    'prayer', count(*) filter (where action = 'prayer'),
    'directions', count(*) filter (where action = 'directions'),
    'announcement', count(*) filter (where action = 'announcement')
  ) into by_action
  from filtered;

  with filtered as (
    select source
    from public.click_events
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('label', source, 'count', count_value) order by count_value desc, source asc),
    '[]'::jsonb
  )
  into top_sources
  from (
    select coalesce(nullif(trim(source), ''), 'unknown') as source, count(*)::int as count_value
    from filtered
    group by 1
    order by count(*) desc, 1 asc
    limit greatest(p_limit, 1)
  ) s;

  with filtered as (
    select tag
    from public.click_events
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at <= p_to)
      and coalesce(nullif(trim(tag), ''), '') <> ''
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('label', tag, 'count', count_value) order by count_value desc, tag asc),
    '[]'::jsonb
  )
  into top_tags
  from (
    select trim(tag) as tag, count(*)::int as count_value
    from filtered
    group by 1
    order by count(*) desc, 1 asc
    limit greatest(p_limit, 1)
  ) t;

  return jsonb_build_object(
    'total', total_count,
    'byAction', coalesce(by_action, '{}'::jsonb),
    'topSources', coalesce(top_sources, '[]'::jsonb),
    'topTags', coalesce(top_tags, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_save_site_config(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.admin_save_site_config(jsonb, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.admin_click_summary(timestamptz, timestamptz, int) from public;
grant execute on function public.admin_click_summary(timestamptz, timestamptz, int) to authenticated;
