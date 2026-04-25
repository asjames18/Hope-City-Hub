-- Retain AI prayer conversations for 30 days and clean them up daily.

create extension if not exists pg_cron;

create or replace function public.cleanup_ai_chat_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.ai_chat_logs
  where created_at < now() - interval '30 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_ai_chat_logs() from public;

select cron.unschedule('hope-city-ai-chat-log-retention')
where exists (
  select 1
  from cron.job
  where jobname = 'hope-city-ai-chat-log-retention'
);

select cron.schedule(
  'hope-city-ai-chat-log-retention',
  '41 3 * * *',
  'select public.cleanup_ai_chat_logs();'
);
