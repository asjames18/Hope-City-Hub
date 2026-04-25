-- Schedule a daily Supabase Cron job to call the keepalive RPC.

create extension if not exists pg_cron;

select cron.schedule(
  'supabase-keepalive-daily',
  '17 9 * * *',
  'select public.keepalive_ping();'
);
