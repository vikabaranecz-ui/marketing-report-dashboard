# Data integrity audit — 2026-10-01

Scope: live Supabase reporting records for ISOPROTECH and Reno Rangers, shared reporting calculations, September 2026, ROBAWS reconciliation, marketing spend, source overrides and integration freshness.

## Root causes corrected

1. **Identity merging was too broad.** The shared funnel merged records on an exact normalized name even when email and phone differed. Automatic grouping now requires exact normalized email or phone; name-only matches remain review evidence.
2. **Unmatched clients were assigned to calendar cohorts.** A monthly source/drill-down could use ROBAWS `client_since` for a manually sourced client with no CRM lead. That is not a verified acquisition date. Such clients now remain visible in YTD/all-time source totals but are excluded from monthly cohorts.
3. **A source click could switch analytical clocks.** The source table used cohort clients while the Leads & Sales executive row recomputed all-time source clients independently. It now consumes the same source-performance client IDs. All-time company ledger metrics are explicitly labelled as all time.
4. **Name-only duplicate warnings reinforced the same unsafe assumption.** Data-health duplicate counts now use exact email/phone evidence only.
5. **Visit metrics were not sufficiently reliable for executive acquisition economics.** The unsupported completed-visit and cost-per-recorded-visit cards were removed from Overview. Appointment data remains available for operational review where an actual appointment record exists.

## Live reconciliation

Verified with read-only SQL against Supabase project `xyvpresvfubmmfweyasf` on 2026-10-01.

### September 2026 — ISOPROTECH

| Metric | Previous dashboard value | Corrected / authoritative value | Reason |
|---|---:|---:|---|
| New lead rows | 27 | 27 | Raw CRM rows whose effective acquisition date is in September. |
| Unique acquired people | 27 in raw-row widgets; 26 in some drill-downs | 26 | One exact-email duplicate pair. Shared person grouping is authoritative. |
| Facebook/Meta acquired people | 17 raw rows | 16 | The same duplicate pair is Facebook-sourced. |
| Qualified leads | Conflicted between pages | Cohort/status-derived; not an exact September event count | No `qualified_at` timestamp exists. It must be labelled cohort state, not calendar activity. |
| Won clients from September cohort | Some views showed 1 or unmatched historical clients | 0 | No September-acquired CRM person currently has canonical ROBAWS project/invoice evidence. |
| Offers created in September | Cohort offer totals were sometimes presented as activity | 16 documents | Exact `quotes.created_at` in September. |
| Offers sent in September | Status-derived values appeared as dated activity | N/A | All 87 loaded ROBAWS offers have `sent_at = null`; an exact monthly sent count cannot be produced. |
| Won projects in September | 1 | 1 | Exact project `won_at`; value €7,181.50 incl. VAT. |
| Invoices dated in September | 9 | 9 | Net invoiced value €51,025.37 incl. VAT. |
| Received revenue in September | Paid totals were shown against September invoices | N/A | Payment transaction dates are absent. €41,649.86 is only the current paid snapshot attached to September-dated invoices. |
| Meta advertising spend | A section previously showed about €832 | €740.97 | Exact September daily Meta facts: 125 ad-day rows, 686 clicks and 15 platform lead actions. |
| Google Ads spend | Values could appear as zero | N/A | No successful Google Ads import/resource configuration exists; missing spend must not be treated as zero. |
| CAC | Conflicted because source/client clocks differed | N/A where cost or cohort customer evidence is missing | Calculated only on matching paid-source cohort evidence. |

### Previously reported cross-page contradictions

| Metric/display | Previous observed value | Corrected interpretation/value | Root cause |
|---|---:|---:|---|
| Leads → client summary vs opened records | 7 vs 18 | One shared cohort/source client-ID set | The summary used an acquisition subset while the drill-down independently added all-time manually sourced clients. |
| Projects vs clients | 41 projects vs 31 clients | 41 distinct projects; 32 canonical won clients | Different record grains were presented without an all-time label. One client can own multiple projects; the canonical client predicate finds 32. |
| September project vs September cohort client | 1 vs 0 | Both remain: 1 project won during September; 0 September-acquired people won to date | Calendar activity and acquisition cohort clocks were visually adjacent but under-labelled. They are different facts and must not be forced equal. |
| August project vs August cohort client | 1 vs 0 | Same separation as September | An August project can belong to an earlier or acquisition-date-unverified client. |
| Paid / won value | 580% | Removed | Dividing current paid balances on period invoices by projects won in the same month mixes unrelated document cohorts and is not a useful conversion metric. |

### ROBAWS commercial ledger — ISOPROTECH

| Reconciliation | Authoritative detail | Aggregate / coverage | Status |
|---|---:|---:|---|
| Won clients | 32 unique clients | 9 CRM-linked; 23 unmatched | Client count is not project count. |
| Projects | 41 distinct project rows | Client aggregate also reports 41 | Count reconciles. |
| Project value | €624,791.99 detailed rows | €636,709.57 client aggregate | **Open gap €11,917.58.** Detailed project rows drive reporting. |
| Invoices | 136 distinct invoice rows | Client aggregate also reports 136 | Count reconciles. |
| Invoiced | €565,142.39 invoice detail | €565,142.39 client aggregate | Reconciled. |
| Paid value to date | €501,702.71 invoice detail | €501,702.71 client aggregate | Reconciled; payment timing unavailable. |
| Source-known won clients | 29 | 3 unresolved/unknown | Manual overrides are preserved. |

The 41 projects versus 32 clients is valid: clients can own multiple distinct projects. It must never be displayed as 41 clients.

### Advertising facts by company

- ISOPROTECH Meta: 559 daily ad rows, €6,363.27 from 2026-03-10 through 2026-10-01. Monthly spend: Mar €407.12, Apr €392.83, May €86.51, Jun €2,150.47, Jul €1,812.48, Aug €762.09, Sep €740.97, Oct MTD €10.80. January and February have no imported rows.
- Reno Rangers Meta: 164 daily ad rows, €3,045.33 from 2026-04-05 through 2026-06-28. Monthly spend: Apr €163.24, May €742.07, Jun €2,140.02. January–March and July–October have no imported rows and must not be shown as verified zero spend.

## Remaining data-quality issues

- 23 of 32 ISOPROTECH won clients are not linked to a CRM lead. Manual source assignments provide source truth for many, but cannot create a reliable acquisition month.
- 3 won clients remain unknown/unattributed.
- Detailed project value is €11,917.58 below the ROBAWS client aggregate; record counts reconcile. The detailed project ledger remains authoritative pending source review.
- ROBAWS offer `sent_at` is missing for all 87 offers. Status can describe present state, but exact offer-sent month is unavailable.
- Payment transaction dates/amounts are absent. “Paid” is a current balance snapshot, not monthly cash receipts.
- Meta Lead Ads retrieval lacks `leads_retrieval` and `pages_manage_ads`; Ads Insights still syncs.
- GA4 and Search Console tokens are expired/revoked for both companies.
- Google Ads and Google Business have no selected resource/successful import.
- Reno Rangers has no ROBAWS commercial connection, so client/revenue attribution is unavailable there.

No source records were deleted or overwritten by this reconstruction. No migration is required.
