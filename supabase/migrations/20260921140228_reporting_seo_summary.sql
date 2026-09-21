create or replace function public.reporting_seo_summary(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'impressions', coalesce(sum(impressions),0),
    'clicks', coalesce(sum(clicks),0),
    'position_sum', coalesce(sum(position_sum),0),
    'branded_clicks', coalesce(sum(clicks) filter (where is_branded is true),0),
    'classified_clicks', coalesce(sum(clicks) filter (where is_branded is not null),0)
  )
  from public.seo_metrics
  where company_id = p_company_id
    and date >= p_from
    and date <= p_to;
$$;

grant execute on function public.reporting_seo_summary(uuid,date,date) to authenticated;
