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

Server-only, as integrations are activated:

- `SUPABASE_SECRET_KEY`
- `INTEGRATION_STATE_SECRET`
- `OAUTH_TOKEN_STORAGE_REVIEWED` (keep `false` until the credential store is approved)
- `META_APP_ID`, `META_APP_SECRET`
- Google application credentials are stored once in Supabase Vault through the authenticated `/api/admin/integrations/google-app-config` endpoint; no Google-specific Vercel environment variables are required.
- `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET`
- `LEAD_INGEST_SECRETS_JSON`

## Database and permissions

The migration creates normalized companies, users, company memberships, services, channels, campaign hierarchy, raw daily metrics, web/SEO/GBP facts, leads, events, appointments, quotes, projects, attribution, reporting integrations, and sync logs. Calculated KPIs are not persisted. Dashboard connections use `reporting_integration_connections` so they can coexist with other applications in the same Supabase project.

RLS allows agency-level roles to see organization companies and client roles to see assigned companies only. Integration credentials are server-side and not granted to anonymous users. Review and test policies with representative agency and client accounts before production rollout.

## Integrations

Google reporting connectors call the official REST APIs on the server, normalize their responses, and upsert raw reporting facts. Meta-reported and Google-reported conversions remain separate from CRM leads and confirmed sales. Integrations fail closed until credentials, explicit resource selections, and the reviewed credential store exist. See `docs/integrations.md` for the OAuth, sync, Monday mapping, and signed lead-ingestion contracts.

### Meta Lead Ads access

The Meta OAuth flow keeps the existing Insights scopes and requests the current Lead Ads permissions used by Graph API v26: `ads_read`, `ads_management`, `business_management`, `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, and `pages_manage_ads`. The importer uses Page/form lead retrieval and does not subscribe to webhooks, so it does not request `pages_manage_metadata`.

Before production Lead Ads import can work, request App Review / Advanced Access for the restricted permissions used by the app, provide Meta's required review screencast and instructions, and assign the integration user/app access to each Page in Leads Access Manager. Existing connections must reconnect after the approved scopes are available so the stored token contains them. See Meta's [Lead Ads retrieval guide](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/) and [permission reference](https://developers.facebook.com/docs/permissions#l).

Recommended rollout:

1. Implement token storage/encryption outside the exposed schema.
2. Build source pagination and retry handling.
3. Normalize into raw metric or CRM tables.
4. Write a `sync_logs` row for every attempt.
5. Add idempotency keys using provider external IDs and dates.
6. Run scheduled imports from a server-only Vercel Cron or worker.

### Google application configuration

After applying the migrations, sign in as a `super_admin` or `agency_admin` and send the shared Google OAuth application configuration to the protected server endpoint. The endpoint accepts the current Supabase session cookie or a verified Supabase access token, writes the payload to Vault, and returns only configuration status.

```bash
read -s SUPABASE_ADMIN_ACCESS_TOKEN
curl --request POST "$DASHBOARD_ORIGIN/api/admin/integrations/google-app-config" \
  --header "Authorization: Bearer $SUPABASE_ADMIN_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data-binary @-
```

Paste the following JSON at the prompt, then press `Ctrl-D`:

```json
{
  "clientId": "...",
  "clientSecret": "...",
  "projectId": "..."
}
```

The same operation rotates the configuration. `GET /api/admin/integrations/google-app-config` returns only `{ "configured": true|false }`; existing secret values are never revealed.

Google Ads API access is determined by the Google Cloud project that owns the OAuth client. Developer tokens were sunset on September 9, 2026, so the integration does not store a developer token or send a `developer-token` header.

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
