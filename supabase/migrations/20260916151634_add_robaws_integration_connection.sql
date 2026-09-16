
insert into public.reporting_integration_connections (
  company_id,
  provider,
  status,
  configuration
)
select
  id,
  'robaws',
  'not_connected',
  '{"account_name":"ROBAWS"}'::jsonb
from public.companies
where slug = 'isoprotech'
on conflict (company_id, provider)
do nothing;
