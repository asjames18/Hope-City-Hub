-- Lock down direct writes and harden click ingestion.

-- Restrict core content writes to explicit admins only.
drop policy if exists "Authenticated can update site_config" on public.site_config;
drop policy if exists "Admins can manage site_config" on public.site_config;
create policy "Admins can manage site_config"
  on public.site_config
  for all
  to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "Authenticated can manage events" on public.events;
drop policy if exists "Admins can manage events" on public.events;
create policy "Admins can manage events"
  on public.events
  for all
  to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- Harden click_events storage constraints.
alter table public.click_events
  drop constraint if exists click_events_source_len_check;
alter table public.click_events
  add constraint click_events_source_len_check
  check (char_length(source) <= 100);

alter table public.click_events
  drop constraint if exists click_events_tag_len_check;
alter table public.click_events
  add constraint click_events_tag_len_check
  check (char_length(tag) <= 100);

alter table public.click_events
  drop constraint if exists click_events_path_len_check;
alter table public.click_events
  add constraint click_events_path_len_check
  check (char_length(path) <= 200);

alter table public.click_events
  drop constraint if exists click_events_target_url_len_check;
alter table public.click_events
  add constraint click_events_target_url_len_check
  check (char_length(target_url) <= 2048);

alter table public.click_events
  drop constraint if exists click_events_query_object_check;
alter table public.click_events
  add constraint click_events_query_object_check
  check (jsonb_typeof(query) = 'object');

create index if not exists click_events_source_created_at_idx
  on public.click_events (source, created_at desc);

-- Block direct public inserts; inserts should go through log_click_event RPC.
drop policy if exists "Public can insert click_events" on public.click_events;

create or replace function public.log_click_event(
  p_action text,
  p_source text default 'unknown',
  p_tag text default '',
  p_target_url text default '',
  p_path text default '/',
  p_query jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_source text;
  v_tag text;
  v_target_url text;
  v_path text;
  v_query jsonb;
  v_recent_count int := 0;
begin
  -- Allow public and authenticated callers only.
  if auth.role() not in ('anon', 'authenticated') then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  v_action := lower(trim(coalesce(p_action, '')));
  if v_action not in ('connect', 'give', 'prayer', 'directions', 'announcement') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  v_source := left(trim(coalesce(p_source, 'unknown')), 100);
  if v_source = '' then v_source := 'unknown'; end if;

  v_tag := left(trim(coalesce(p_tag, '')), 100);
  v_target_url := left(trim(coalesce(p_target_url, '')), 2048);
  v_path := left(trim(coalesce(p_path, '/')), 200);
  if v_path = '' then v_path := '/'; end if;

  v_query := coalesce(p_query, '{}'::jsonb);
  if jsonb_typeof(v_query) <> 'object' then
    v_query := '{}'::jsonb;
  end if;

  -- Coarse abuse throttle: max 120 events per source per minute.
  select count(*)::int
  into v_recent_count
  from public.click_events
  where source = v_source
    and created_at >= now() - interval '1 minute';

  if v_recent_count >= 120 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.click_events (action, source, tag, target_url, path, query)
  values (v_action, v_source, v_tag, v_target_url, v_path, v_query);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.log_click_event(text, text, text, text, text, jsonb) from public;
grant execute on function public.log_click_event(text, text, text, text, text, jsonb) to anon, authenticated;
