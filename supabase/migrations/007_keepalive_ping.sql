-- Add a lightweight public RPC for scheduled keepalive checks.

create or replace function public.keepalive_ping()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() not in ('anon', 'authenticated') then
    raise exception 'Not allowed';
  end if;

  -- Touch the primary public tables so PostgREST and the database stay warm.
  perform 1
  from public.site_config
  where id = 1;

  perform 1
  from public.events
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;
