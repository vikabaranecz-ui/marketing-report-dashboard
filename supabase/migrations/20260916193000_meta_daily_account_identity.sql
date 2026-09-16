alter table public.daily_marketing_metrics
  add column if not exists ad_account_id text;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.daily_marketing_metrics'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%date, company_id, channel_id, campaign_id, ad_group_id, ad_id, service_id%'
    and pg_get_constraintdef(oid) not like '%ad_account_id%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.daily_marketing_metrics drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.daily_marketing_metrics
  add constraint daily_marketing_metrics_daily_external_identity_key
  unique nulls not distinct (
    company_id,
    date,
    ad_account_id,
    channel_id,
    campaign_id,
    ad_group_id,
    ad_id,
    service_id
  );

create index if not exists daily_metrics_company_account_date_idx
  on public.daily_marketing_metrics (company_id, ad_account_id, date);
