# WAT Reporting architecture

## File structure

```text
src/app/(dashboard)     Authenticated reporting routes and shared shell
src/app/auth            Supabase authentication callbacks and sign-in
src/components          Reusable controls, charts, tables, and page sections
src/lib/data            Reporting repository boundary and demo adapter
src/lib/metrics         Centralized, zero-safe KPI calculations
src/lib/supabase        Browser, server, and middleware Supabase clients
src/lib/integrations    Normalized connector contracts per external source
supabase/migrations     Postgres schema, indexes, and row-level security
supabase/seed.sql       Clearly synthetic local/demo data
```

## KPI definitions

All ratios are calculated at query/reporting time from raw facts. A zero denominator returns `null`, rendered as an em dash.

| KPI | Definition |
| --- | --- |
| CPL | marketing spend / leads |
| Qualified CPL | marketing spend / qualified leads |
| Cost per visit | marketing spend / completed visits |
| CAC | marketing spend / won projects |
| Lead-to-sale rate | won projects / leads × 100 |
| ROAS | marketing-attributed revenue / marketing spend |
| Website lead conversion | website leads / relevant sessions × 100 |
| CTR | clicks / impressions × 100 |
| CPC | spend / clicks |

## Data flow

External provider → OAuth/server-only connector → source-specific normalizer → idempotent Supabase upsert → server repository → aggregate metrics → UI. Platform conversions, CRM leads, CRM-confirmed projects, and attributed revenue remain separate facts. First-touch is the initial attribution model; `revenue_attribution.model` supports later last-touch and multi-touch models.

OAuth token exchange and persistence are intentionally disabled until the credential-store security review is complete. `reporting_integration_connections.configuration` contains only non-secret resource IDs, display names, and Monday column mappings. The `reporting_private` schema remains inaccessible to browser roles.

Website leads use a timestamped HMAC-signed server request. The API writes the normalized lead to Supabase before any future CRM forwarding. Existing Formspree forms remain untouched until this endpoint has been tested per website.

If Supabase environment variables are absent, the repository returns the bundled synthetic dataset and the UI displays a persistent **Demo data** label. No integration is shown as connected in demo mode.

## Authentication and permissions

Supabase Auth owns identity. `public.users` stores authorization role and organization membership; it never trusts user-editable JWT metadata. `company_users` maps client users to companies. Postgres RLS enforces:

- `super_admin` and `agency_admin`: every company in their organization;
- `company_admin` and `viewer`: assigned companies only;
- service-role connector jobs: server-only environment variable, never exposed to the browser. Provider tokens live in the isolated `reporting_private` schema.

The Next.js proxy refreshes sessions. Protected server layouts verify the user with `getUser()` and redirect unauthenticated visitors when Supabase is configured. Frontend company filters are convenience controls, not an authorization boundary.

## Reporting queries

Pages receive scoped, aggregated server data. Production implementations should add SQL views/RPCs with `security_invoker = true` for larger datasets, keeping date/company/filter predicates in SQL. The browser never receives all database rows or secret credentials.
