drop policy if exists "authorized users can read commercial clients"
on public.commercial_clients;

create policy "authorized users can read commercial clients"
on public.commercial_clients
for select
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and (
        (
          u.role in ('super_admin', 'agency_admin')
          and exists (
            select 1
            from public.companies c
            where c.id = commercial_clients.company_id
              and c.organization_id = u.organization_id
          )
        )
        or exists (
          select 1
          from public.company_users cu
          where cu.user_id = u.id
            and cu.company_id = commercial_clients.company_id
        )
      )
  )
);
