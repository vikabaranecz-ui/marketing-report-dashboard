
create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  crm_source text not null,
  crm_external_id text not null,

  name text not null,
  stage text,
  pipeline_group text,

  deal_value numeric,
  offer_status text,
  offer_number text,
  lost_reason text,

  linked_lead_id uuid
    references public.leads(id)
    on delete set null,

  created_at_external timestamptz,
  updated_at timestamptz not null default now(),

  unique (
    company_id,
    crm_source,
    crm_external_id
  )
);

create index if not exists
  crm_deals_company_idx
on public.crm_deals(company_id);

create index if not exists
  crm_deals_linked_lead_idx
on public.crm_deals(linked_lead_id);

alter table public.crm_deals
  enable row level security;

drop policy if exists
  "users can read crm deals"
on public.crm_deals;

create policy
  "users can read crm deals"
on public.crm_deals
for select
to authenticated
using (
  exists (
    select 1
    from public.companies c
    join public.users u
      on u.organization_id = c.organization_id
    where c.id = crm_deals.company_id
      and u.id = (select auth.uid())
      and u.role in (
        'super_admin',
        'agency_admin'
      )
  )
  or exists (
    select 1
    from public.company_users cu
    where cu.company_id = crm_deals.company_id
      and cu.user_id = (select auth.uid())
  )
);

grant select
on public.crm_deals
to authenticated;
