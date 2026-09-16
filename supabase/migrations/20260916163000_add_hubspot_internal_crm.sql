alter table public.projects
  add column if not exists crm_source text,
  add column if not exists crm_external_id text;

create unique index if not exists
  projects_lead_crm_identity_idx
on public.projects (
  lead_id,
  crm_source,
  crm_external_id
);

create unique index if not exists
  revenue_attribution_project_model_idx
on public.revenue_attribution (
  project_id,
  model
);

-- ISOPROTECH uses Monday.
update public.reporting_integration_connections
set
  status = 'connected',
  configuration =
    configuration ||
    jsonb_build_object(
      'board_id', '5094302330',
      'board_name', 'Leads'
    ),
  error_message = null,
  updated_at = now()
where
  company_id =
    '00000000-0000-4000-8000-000000000101'
  and provider = 'monday';

-- Reno Rangers uses HubSpot instead of Monday.
delete from public.reporting_integration_connections
where
  company_id =
    '00000000-0000-4000-8000-000000000102'
  and provider = 'monday';

insert into public.reporting_integration_connections (
  company_id,
  provider,
  status,
  configuration
)
values (
  '00000000-0000-4000-8000-000000000102',
  'hubspot',
  'connected',
  jsonb_build_object(
    'portal_id', '148333642',
    'portal_name', 'Reno Rangers',
    'pipeline_id', 'default',
    'pipeline_name',
      'Renovation Sales Pipeline'
  )
)
on conflict (company_id, provider)
do update set
  status = 'connected',
  configuration = excluded.configuration,
  error_message = null,
  updated_at = now();
