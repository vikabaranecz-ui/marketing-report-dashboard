-- Separate connection for organic Facebook Page / Instagram posts (its own Meta app),
-- so the Meta Ads app keeps only the ads permissions.
insert into public.reporting_integration_connections (company_id, provider)
select c.id, 'meta_social'
from public.companies c
where c.is_active
on conflict (company_id, provider) do nothing;
