alter table public.projects
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

update public.projects p
set company_id = l.company_id
from public.leads l
where p.company_id is null
  and p.lead_id = l.id;

alter table public.projects
  alter column lead_id drop not null;

alter table public.projects
  alter column company_id set not null;

create index if not exists projects_company_won_at_idx
  on public.projects(company_id, won_at);

create unique index if not exists projects_company_crm_identity_idx
  on public.projects(company_id, crm_source, crm_external_id);

drop policy if exists "authorized users can read projects" on public.projects;

create policy "authorized users can read projects"
  on public.projects
  for select
  to authenticated
  using (company_id in (select companies.id from companies));
