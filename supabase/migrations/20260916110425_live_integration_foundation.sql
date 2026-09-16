alter type public.integration_status add value if not exists 'connecting' after 'not_connected';

alter table public.reporting_integration_connections
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.leads
  add column if not exists landing_page text,
  add column if not exists referrer text,
  add column if not exists form_name text,
  add column if not exists form_type text,
  add column if not exists ingestion_key text,
  add column if not exists crm_source text,
  add column if not exists crm_external_id text;

alter table public.leads
  add constraint leads_company_ingestion_key_unique unique (company_id, ingestion_key),
  add constraint leads_company_crm_external_id_unique unique (company_id, crm_source, crm_external_id);

create unique index if not exists website_metrics_sync_identity_idx
  on public.website_metrics (date, company_id, landing_page, source, medium, device_category) nulls not distinct;

create unique index if not exists seo_metrics_sync_identity_idx
  on public.seo_metrics (date, company_id, query, page) nulls not distinct;

create unique index if not exists gbp_metrics_sync_identity_idx
  on public.gbp_metrics (date, company_id);

create unique index if not exists leads_company_meta_lead_id_idx
  on public.leads (company_id, meta_lead_id)
  where meta_lead_id is not null;

create policy "admins can update reporting integrations"
on public.reporting_integration_connections
for update
to authenticated
using (
  company_id in (select id from public.companies)
  and exists (
    select 1 from public.users
    where id = (select auth.uid())
      and role in ('super_admin', 'agency_admin', 'company_admin')
  )
)
with check (
  company_id in (select id from public.companies)
  and exists (
    select 1 from public.users
    where id = (select auth.uid())
      and role in ('super_admin', 'agency_admin', 'company_admin')
  )
);

create policy "admins can insert sync logs"
on public.sync_logs
for insert
to authenticated
with check (
  integration_connection_id in (select id from public.reporting_integration_connections)
);

grant update (status, configuration, last_successful_sync, last_attempted_sync, error_message, updated_at)
  on public.reporting_integration_connections to authenticated;
grant insert (integration_connection_id, started_at, completed_at, status, records_imported, error_message, metadata)
  on public.sync_logs to authenticated;

comment on column public.reporting_integration_connections.configuration is
  'Non-secret provider resource selection and column mappings only. OAuth tokens belong in reviewed private secret storage.';
comment on column public.leads.ingestion_key is
  'Caller-supplied idempotency key for website or webhook ingestion.';
