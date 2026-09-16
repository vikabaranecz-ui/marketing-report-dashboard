# Live integration foundation

## Connection lifecycle

Every company/provider pair uses its existing `reporting_integration_connections` row. Valid states are `not_connected`, `connecting`, `connected`, and `error`. The Integration Center renders the database state, selected non-secret resource, last attempt, last successful sync, imported row count, and the latest human-readable connection error.

Routes are server-side only:

- `GET /api/integrations/:provider/authorize?companyId=...`
- `GET /api/integrations/:provider/callback`
- `PATCH /api/integrations/:provider/configuration`
- `POST /api/integrations/:provider/sync`
- `POST /api/integrations/:provider/disconnect`

The user session and RLS authorize the selected company. OAuth state is signed with `INTEGRATION_STATE_SECRET`, expires after ten minutes, and binds company, provider, and user. Provider tokens are never returned to the browser.

`OAUTH_TOKEN_STORAGE_REVIEWED` defaults to false. While false, authorization stops before redirecting to providers. The callback also stops before code exchange. This is deliberate: no access or refresh token is written to Postgres until the `CredentialStore` implementation is approved.

## Provider resource configuration

`reporting_integration_connections.configuration` may store only these non-secret selections:

- Meta: ad account ID/name
- Google Ads: customer ID/name
- GA4: property ID/name
- Search Console: site URL
- Business Profile: account/location ID/name
- Monday: board ID/name and a map from normalized fields to Monday column IDs
- Website forms: endpoint display name

Monday reporting code must resolve configured column IDs at normalization time. It must not couple reporting logic to board-specific column titles.

## Sync contract

An initial sync requests a 90-day window. Incremental sync overlaps the previous successful date by one day so late conversions can be refreshed. Unique database identities support upsert without duplicates. Every attempt must create a `sync_logs` row; a provider failure is isolated and cannot prevent other providers from running.

## Website lead ingestion

`POST /api/leads/ingest` accepts JSON and requires:

- `x-idempotency-key`: stable per website submission
- `x-lead-timestamp`: Unix seconds, within five minutes
- `x-lead-signature`: `sha256=<hex HMAC>` over `<timestamp>.<raw JSON body>`

The signing secret is selected by company slug from the server-only `LEAD_INGEST_SECRETS_JSON` environment value. The endpoint is server-to-server; never embed a signing secret in browser JavaScript. It upserts into `leads` before any later CRM forwarding and leaves current Formspree forms unchanged.

Example normalized payload:

```json
{
  "company": "isoprotech",
  "name": "Example lead",
  "email": "lead@example.com",
  "phone": "+32...",
  "service": "Spouwmuurisolatie",
  "municipality": "Antwerpen",
  "postal_code": "2000",
  "landing_page": "https://example.com/service",
  "referrer": "https://www.google.com/",
  "source": "website",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "example",
  "gclid": "...",
  "fbclid": "...",
  "form_name": "Quote request",
  "form_type": "website_quote",
  "notes": "Optional message"
}
```
