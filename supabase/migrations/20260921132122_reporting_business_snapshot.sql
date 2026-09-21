create or replace function public.reporting_business_snapshot(p_company_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'leads', (select count(*) from public.leads l where l.company_id = p_company_id),
    'signed', (select count(*) from public.leads l where l.company_id = p_company_id and lower(coalesce(l.crm_status,'')) = 'signed'),
    'commercial_clients', (select count(*) from public.commercial_clients c where c.company_id = p_company_id and c.commercial_status = 'CLIENT_WON'),
    'open_offers', (
      select count(*)
      from public.quotes q
      join public.leads l on l.id = q.lead_id
      where l.company_id = p_company_id
        and q.external_source = 'robaws'
        and q.sent_at is not null
        and lower(coalesce(q.status,'')) not in ('goedgekeurd','gefactureerd','deelfactuur','afgekeurd','accepted','approved','rejected','declined')
        and coalesce(q.attribution_status,'') not ilike '%DATE_CONFLICT%'
    ),
    'open_pipeline', (
      select coalesce(sum(q.quote_value_incl_vat),0)
      from public.quotes q
      join public.leads l on l.id = q.lead_id
      where l.company_id = p_company_id
        and q.external_source = 'robaws'
        and q.sent_at is not null
        and lower(coalesce(q.status,'')) not in ('goedgekeurd','gefactureerd','deelfactuur','afgekeurd','accepted','approved','rejected','declined')
        and coalesce(q.attribution_status,'') not ilike '%DATE_CONFLICT%'
    ),
    'project_value', (
      select coalesce(sum(p.project_value),0)
      from public.projects p
      join public.leads l on l.id = p.lead_id
      where l.company_id = p_company_id
        and coalesce(p.attribution_status,'') not ilike '%DATE_CONFLICT%'
    ),
    'invoiced', (
      select coalesce(sum(greatest(0, i.total_incl_vat - i.credited_total)),0)
      from public.commercial_invoices i
      where i.company_id = p_company_id
        and coalesce(i.attribution_status,'') not ilike '%DATE_CONFLICT%'
    ),
    'paid', (
      select coalesce(sum(i.paid_total),0)
      from public.commercial_invoices i
      where i.company_id = p_company_id
        and coalesce(i.attribution_status,'') not ilike '%DATE_CONFLICT%'
    ),
    'spend_ytd', (
      select coalesce(sum(m.spend),0)
      from public.daily_marketing_metrics m
      where m.company_id = p_company_id
        and m.date >= make_date(extract(year from current_date)::int,1,1)
        and m.date <= current_date
    )
  );
$$;

revoke all on function public.reporting_business_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.reporting_business_snapshot(uuid) to service_role;
