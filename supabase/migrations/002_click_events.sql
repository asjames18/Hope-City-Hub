-- Track CTA/NFC click engagement events.
create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('connect', 'give', 'prayer', 'directions')),
  source text not null default 'unknown',
  tag text not null default '',
  target_url text not null,
  path text not null,
  query jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists click_events_created_at_idx
  on public.click_events (created_at desc);

create index if not exists click_events_action_created_at_idx
  on public.click_events (action, created_at desc);

create index if not exists click_events_source_created_at_idx
  on public.click_events (source, created_at desc);

alter table public.click_events enable row level security;

create policy "Public can insert click_events"
  on public.click_events
  for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated can read click_events"
  on public.click_events
  for select
  to authenticated
  using (true);
