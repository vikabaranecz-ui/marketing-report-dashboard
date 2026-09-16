# WAT Reporting

Production-oriented marketing and sales performance dashboard for WAT Agency clients. The first two company workspaces are ISOPROTECH and RENO RANGERS; companies, channels, services, and memberships are database records so the platform can expand without changing reporting logic.

## Architecture

- Next.js 16 App Router, strict TypeScript, Tailwind CSS 4, Recharts
- Supabase Auth with server-verified sessions and Postgres Row Level Security
- Server-side reporting repository; browser components receive scoped reporting snapshots
- Central zero-safe KPI calculations in `src/lib/metrics/kpis.ts`
- Normalized connector contracts under `src/lib/integrations`
- Vercel-ready standard Next.js build

The full file structure, KPI definitions, data flow, and permission model are documented in `docs/architecture.md`.

## Local setup

1. Install Node.js 20.9 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add the Supabase URL and publishable key.
5. Run `npm run dev` and open `http://localhost:3000`.

When Supabase variables are absent, the app uses obviously synthetic records and shows a persistent **Demo data** label. Integration cards remain **Not connected**.

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/202609160001_initial_reporting_schema.sql` using the Supabase CLI or SQL editor.
3. For local development only, apply `supabase/seed.sql`.
4. Create users in Supabase Auth, insert matching `public.users` profiles, then assign client accounts in `public.company_users`.
5. Add your project URL and publishable key to `.env.local`.

The service-role key is optional for future server-side sync jobs only. Never prefix it with `NEXT_PUBLIC_`, log it, or use it in browser code.

## Environment variables

Required for live mode:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only, as integrations are implemented:

- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_ID`, `META_APP_SECRET`
- `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `MONDAY_API_TOKEN`

## Database and permissions

The migration creates normalized companies, users, company memberships, services, channels, campaign hierarchy, raw daily metrics, web/SEO/GBP facts, leads, events, appointments, quotes, projects, attribution, reporting integrations, and sync logs. Calculated KPIs are not persisted. Dashboard connections use `reporting_integration_connections` so they can coexist with other applications in the same Supabase project.

RLS allows agency-level roles to see organization companies and client roles to see assigned companies only. Integration credentials are server-side and not granted to anonymous users. Review and test policies with representative agency and client accounts before production rollout.

## Integrations

Each provider follows `IntegrationConnector`: fetch source records on the server, normalize them, then upsert raw facts. Meta-reported and Google-reported conversions remain separate from CRM leads and confirmed sales. Connector stubs deliberately fail closed until credentials and importer logic exist.

Recommended rollout:

1. Implement token storage/encryption outside the exposed schema.
2. Build source pagination and retry handling.
3. Normalize into raw metric or CRM tables.
4. Write a `sync_logs` row for every attempt.
5. Add idempotency keys using provider external IDs and dates.
6. Run scheduled imports from a server-only Vercel Cron or worker.

## Commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

## Vercel deployment

Import the repository in Vercel, add the environment variables for Preview and Production, and deploy. Set Supabase Auth site URL and redirect URLs to the Vercel domains. No secret key is required by the client bundle.

Before launch, connect real data sources, run the Supabase security advisors, verify RLS using users from both companies, and confirm that seeded demo data is not present in production.
