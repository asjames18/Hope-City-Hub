-- Store AI prayer conversations for admin review.

create table if not exists public.ai_chat_logs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  response text,
  error text,
  provider text,
  model text,
  origin text,
  path text,
  success boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_logs_created_at_idx
  on public.ai_chat_logs (created_at desc);

create index if not exists ai_chat_logs_success_created_at_idx
  on public.ai_chat_logs (success, created_at desc);

create index if not exists ai_chat_logs_provider_created_at_idx
  on public.ai_chat_logs (provider, created_at desc);

alter table public.ai_chat_logs enable row level security;

drop policy if exists "Admins can read ai_chat_logs" on public.ai_chat_logs;
create policy "Admins can read ai_chat_logs"
  on public.ai_chat_logs
  for select
  to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
