-- Instagram (Instagram API with Instagram Login) uses one server-side token
-- (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID), so it is enabled for ISOPROTECH only.
insert into public.reporting_integration_connections (company_id, provider)
select c.id, 'instagram'
from public.companies c
where c.slug = 'isoprotech'
on conflict (company_id, provider) do nothing;
