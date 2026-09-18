create table if not exists public.commercial_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_source text not null default 'robaws',
  external_id text not null,
  name text not null,
  email text,
  phone text,
  client_since timestamptz,
  matched_lead_id uuid references public.leads(id) on delete set null,
  match_method text,
  commercial_status text,
  offer_count integer not null default 0,
  project_count integer not null default 0,
  invoice_count integer not null default 0,
  invoiced_total numeric not null default 0,
  paid_total numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(company_id, external_source, external_id)
);

create index if not exists commercial_clients_company_idx on public.commercial_clients(company_id);
create index if not exists commercial_clients_matched_lead_idx on public.commercial_clients(matched_lead_id);
create index if not exists commercial_clients_status_idx on public.commercial_clients(company_id, commercial_status);

alter table public.commercial_clients enable row level security;

drop policy if exists "authorized users can read commercial clients" on public.commercial_clients;
create policy "authorized users can read commercial clients"
on public.commercial_clients
for select
to authenticated
using (company_id in (select id from public.companies));

grant select on public.commercial_clients to authenticated;
