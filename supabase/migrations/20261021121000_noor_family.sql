-- Family circles. Accessed only by the noor-ai edge function (service_role).
create table if not exists public.noor_families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  owner uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists public.noor_members (
  uid uuid primary key,
  family_id uuid not null references public.noor_families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  stats jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists noor_members_family_idx on public.noor_members(family_id);
alter table public.noor_families enable row level security;
alter table public.noor_members enable row level security;
revoke all on public.noor_families, public.noor_members from anon, authenticated;
