-- Daily per-user usage counters for noor-ai. Server (service_role) only.
create table if not exists public.noor_usage (
  uid uuid not null, day date not null default current_date, action text not null, n integer not null default 0,
  primary key (uid, day, action)
);
alter table public.noor_usage enable row level security;
revoke all on public.noor_usage from anon, authenticated;
create or replace function public.noor_bump(p_uid uuid, p_action text, p_cost integer default 1)
returns integer language sql security definer set search_path = public as $$
  insert into public.noor_usage (uid, day, action, n) values (p_uid, current_date, p_action, p_cost)
  on conflict (uid, day, action) do update set n = public.noor_usage.n + excluded.n returning n;
$$;
revoke all on function public.noor_bump(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.noor_bump(uuid, text, integer) to service_role;
create or replace function public.noor_usage_gc() returns void language sql security definer set search_path = public as $$
  delete from public.noor_usage where day < current_date - 30;
$$;
revoke all on function public.noor_usage_gc() from public, anon, authenticated;
grant execute on function public.noor_usage_gc() to service_role;
