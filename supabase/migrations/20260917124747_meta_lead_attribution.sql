create table public.meta_lead_attribution (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meta_lead_id text not null,
  created_time timestamptz not null,
  page_id text,
  form_id text,
  campaign_external_id text,
  adset_external_id text,
  ad_external_id text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  ad_group_id uuid references public.ad_groups(id) on delete set null,
  ad_id uuid references public.ads(id) on delete set null,
  email_normalized text,
  phone_normalized text,
  matched_lead_id uuid references public.leads(id) on delete set null,
  match_method text not null default 'NONE'
    check (match_method in ('META_LEAD_ID', 'EMAIL+PHONE', 'EMAIL', 'PHONE', 'NONE', 'AMBIGUOUS')),
  match_status text not null default 'UNMATCHED'
    check (match_status in ('MATCHED', 'UNMATCHED', 'AMBIGUOUS')),
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meta_lead_id)
);

create index meta_lead_attribution_company_created_idx
  on public.meta_lead_attribution (company_id, created_time);
create index meta_lead_attribution_company_campaign_idx
  on public.meta_lead_attribution (company_id, campaign_id);
create index meta_lead_attribution_matched_lead_idx
  on public.meta_lead_attribution (matched_lead_id);
create index meta_lead_attribution_email_idx
  on public.meta_lead_attribution (company_id, email_normalized)
  where email_normalized is not null;
create index meta_lead_attribution_phone_idx
  on public.meta_lead_attribution (company_id, phone_normalized)
  where phone_normalized is not null;

alter table public.meta_lead_attribution enable row level security;
revoke all on table public.meta_lead_attribution from anon, authenticated;
grant select on table public.meta_lead_attribution to authenticated;

create policy "authorized users can read Meta lead attribution"
on public.meta_lead_attribution
for select
to authenticated
using (
  company_id in (
    select id
    from public.companies
  )
);

comment on table public.meta_lead_attribution is
  'Company-scoped Meta Lead Ads staging and deterministic CRM attribution. Meta submissions do not create CRM leads.';
comment on column public.meta_lead_attribution.email_normalized is
  'Normalized contact identifier used only for deterministic matching; protected by company RLS.';
comment on column public.meta_lead_attribution.phone_normalized is
  'Normalized contact identifier used only for deterministic matching; protected by company RLS.';
