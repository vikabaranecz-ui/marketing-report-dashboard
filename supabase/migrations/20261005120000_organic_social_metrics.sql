-- Organic Facebook Page and Instagram professional account performance.
-- Written only by the server-side Meta sync (service role); read by dashboard users
-- with the same company access rule as the other reporting tables.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  account_id text not null,
  account_name text,
  external_id text not null,
  published_at timestamptz not null,
  post_type text,
  caption text,
  permalink text,
  thumbnail_url text,
  reach integer,
  views integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  clicks integer,
  interactions integer,
  synced_at timestamptz not null default now(),
  unique (company_id, platform, external_id)
);

create index if not exists social_posts_company_published_idx
  on public.social_posts(company_id, published_at desc);

create table if not exists public.social_account_daily (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  account_id text not null,
  account_name text,
  date date not null,
  followers integer,
  synced_at timestamptz not null default now(),
  unique (company_id, platform, account_id, date)
);

create index if not exists social_account_daily_company_date_idx
  on public.social_account_daily(company_id, date desc);

alter table public.social_posts enable row level security;
alter table public.social_account_daily enable row level security;

drop policy if exists "authorized users can read social posts" on public.social_posts;
create policy "authorized users can read social posts"
on public.social_posts for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and (
        (
          u.role in ('super_admin','agency_admin')
          and exists (
            select 1 from public.companies c
            where c.id = social_posts.company_id
              and c.organization_id = u.organization_id
          )
        )
        or exists (
          select 1 from public.company_users cu
          where cu.user_id = u.id
            and cu.company_id = social_posts.company_id
        )
      )
  )
);

drop policy if exists "authorized users can read social account daily" on public.social_account_daily;
create policy "authorized users can read social account daily"
on public.social_account_daily for select to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and (
        (
          u.role in ('super_admin','agency_admin')
          and exists (
            select 1 from public.companies c
            where c.id = social_account_daily.company_id
              and c.organization_id = u.organization_id
          )
        )
        or exists (
          select 1 from public.company_users cu
          where cu.user_id = u.id
            and cu.company_id = social_account_daily.company_id
        )
      )
  )
);
