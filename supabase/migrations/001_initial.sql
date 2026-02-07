-- Hope City Hub: site config (single row) + events
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) or via Supabase CLI.

-- Single row for announcement, links, socials
create table if not exists public.site_config (
  id int primary key default 1 check (id = 1),
  announcement jsonb not null default '{"active":true,"text":"","link":"#"}',
  links jsonb not null default '{}',
  socials jsonb not null default '{}',
  updated_at timestamptz default now()
);

insert into public.site_config (id, announcement, links, socials)
values (
  1,
  '{"active":true,"text":"🎉 Easter Service Times: 9AM & 11AM. Plan your visit today!","link":"#"}',
  '{"connectCard":"https://hopecity.elvanto.net/form/connect-card-uuid","prayerRequest":"https://hopecity.elvanto.net/form/prayer-uuid","giving":"https://tithe.ly/give_new/www/#/tithely/give-one-time/123456","baptism":"https://hopecity.elvanto.net/form/baptism-uuid","dreamTeam":"https://hopecity.elvanto.net/form/volunteer-uuid","directions":"https://maps.google.com/?q=1700+Simpson+Ave+Sebring+FL+33870","youtube":"https://www.youtube.com/channel/YOUR_CHANNEL_ID"}',
  '{"instagram":"#","facebook":"#","youtube":"#"}'
)
on conflict (id) do nothing;

-- Events (order_index for display order)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date text not null,
  time text not null,
  signup_url text not null default '',
  order_index int not null default 0,
  created_at timestamptz default now()
);

-- Seed events
-- Seed events (run migration once; omit this block if you prefer empty events)
insert into public.events (title, date, time, signup_url, order_index)
values
  ('Cultural Sunday & Potluck', 'Feb 22', '10:00 AM', 'https://hopecity.elvanto.net/form/event-registration-1', 0),
  ('Worship Night', 'Feb 28', '6:30 PM', '', 1),
  ('Outreach: Nursing Ministry', 'Sundays', '2:00 PM', 'https://hopecity.elvanto.net/form/outreach-signup', 2);

-- RLS: anyone can read; only authenticated users can write
alter table public.site_config enable row level security;
alter table public.events enable row level security;

create policy "Public can read site_config"
  on public.site_config for select
  using (true);

create policy "Authenticated can update site_config"
  on public.site_config for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Public can read events"
  on public.events for select
  using (true);

create policy "Authenticated can manage events"
  on public.events for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
