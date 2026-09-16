alter table public.leads
  add column if not exists commercial_attribution_status text;

alter table public.quotes
  add column if not exists project_external_id text,
  add column if not exists attribution_status text;

alter table public.projects
  add column if not exists external_client_id text,
  add column if not exists project_value_excl_vat numeric,
  add column if not exists external_status text,
  add column if not exists attribution_status text;

create index if not exists quotes_project_external_id_idx
  on public.quotes(project_external_id);

create index if not exists projects_external_client_id_idx
  on public.projects(external_client_id);

create table if not exists public.commercial_invoices (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  lead_id uuid
    references public.leads(id)
    on delete set null,

  external_source text not null default 'robaws',
  external_id text not null,
  external_client_id text not null,

  invoice_number text,
  invoice_date date,

  status text,
  invoice_type text,
  origin_type text,
  document_id text,

  total_excl_vat numeric,
  total_incl_vat numeric,
  paid_total numeric,
  credited_total numeric,

  attribution_status text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(external_source, external_id)
);

create index if not exists commercial_invoices_company_idx
  on public.commercial_invoices(company_id);

create index if not exists commercial_invoices_lead_idx
  on public.commercial_invoices(lead_id);

create index if not exists commercial_invoices_client_idx
  on public.commercial_invoices(external_client_id);

create index if not exists commercial_invoices_date_idx
  on public.commercial_invoices(invoice_date);

alter table public.commercial_invoices
  enable row level security;

drop policy if exists
  "authorized users can read commercial invoices"
on public.commercial_invoices;

create policy
  "authorized users can read commercial invoices"
on public.commercial_invoices
for select
to authenticated
using (
  company_id in (
    select id
    from public.companies
  )
);

grant select
on public.commercial_invoices
to authenticated;
