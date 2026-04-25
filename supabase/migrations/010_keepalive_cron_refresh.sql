-- Recreate the keepalive job so it warms the same public config path the site reads.

create extension if not exists pg_cron;

select cron.unschedule('supabase-keepalive-daily')
where exists (
  select 1
  from cron.job
  where jobname = 'supabase-keepalive-daily'
);

select cron.unschedule('supabase-keepalive-hourly')
where exists (
  select 1
  from cron.job
  where jobname = 'supabase-keepalive-hourly'
);

select cron.schedule(
  'supabase-keepalive-hourly',
  '17 * * * *',
  'select public.keepalive_touch();'
);
