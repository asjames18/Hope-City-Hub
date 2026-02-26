-- Add admin audit log and log configuration changes.

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_actor_created_at_idx
  on public.admin_audit_log (actor_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins can read admin_audit_log" on public.admin_audit_log;
create policy "Admins can read admin_audit_log"
  on public.admin_audit_log
  for select
  to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

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
  actor_id uuid := auth.uid();
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin_user(actor_id) then
    raise exception 'Not authorized';
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

  insert into public.admin_audit_log (actor_user_id, action, details)
  values (
    actor_id,
    'save_site_config',
    jsonb_build_object(
      'announcement_active', coalesce((saved_site_config->'announcement'->>'active')::boolean, false),
      'events_count', jsonb_array_length(saved_events),
      'links_keys', coalesce(
        (select jsonb_agg(k.key order by k.key)
         from jsonb_object_keys(coalesce(saved_site_config->'links', '{}'::jsonb)) as k(key)),
        '[]'::jsonb
      )
    )
  );

  return jsonb_build_object(
    'site_config', saved_site_config,
    'events', saved_events
  );
end;
$$;

revoke all on function public.admin_save_site_config(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.admin_save_site_config(jsonb, jsonb, jsonb, jsonb) to authenticated;
