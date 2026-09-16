create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  provider text not null check (provider in ('ga4','search_console','instagram','facebook','tiktok','linkedin','google_ads','meta_ads')),
  status text not null default 'setup_required' check (status in ('connected','disconnected','error','setup_required')),
  external_account_id text,
  external_account_name text,
  property_id text,
  property_url text,
  encrypted_credentials text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id, provider)
);

alter table public.integration_connections enable row level security;
revoke all on public.integration_connections from anon, authenticated;
create index if not exists integration_connections_owner_client_idx on public.integration_connections(user_id, client_id);
;
