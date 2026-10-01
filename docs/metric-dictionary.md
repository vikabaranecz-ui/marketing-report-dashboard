# Reporting metric dictionary

All date filtering uses ISO calendar dates in `Europe/Brussels`. Acquisition cohorts and calendar activity are separate views.

| Metric | Record grain | Authoritative source | Date rule | Formula / exclusion |
|---|---|---|---|---|
| New leads acquired | Unique CRM people | Monday/HubSpot/website-form rows in `leads` | Earliest trustworthy acquisition date; CRM creation unless an already-existing ROBAWS `client_since` proves a late CRM import | Exact normalized email or phone joins duplicate rows. Name alone never merges. Unknown acquisition dates are not assigned to a month. |
| Known acquired | Unique CRM people plus verified supplier-only people | `leads` + `reporting_overrides` | CRM people use acquisition date; supplier-only people stay YTD-only without a source acquisition date | Supplier counts must state that no CRM drill-down exists. |
| Qualified leads | Unique acquisition-cohort people with an explicit/progressed CRM stage | `leads.sales_stage` | Lead acquisition date for cohort reporting | Not a calendar-event metric because `qualified_at` is not available. |
| Offers created | Distinct offer documents | ROBAWS `quotes` | `quotes.created_at` for calendar activity; lead acquisition date for cohort outcome | Multiple offers for one client remain multiple documents. |
| Offers sent | Distinct offer documents | ROBAWS `quotes` | `quotes.sent_at` | A status can support cohort evidence, but it cannot invent a sent date for monthly activity. Current ROBAWS rows have no populated sent timestamps, so exact monthly sent activity is unavailable. |
| Won clients | Unique clients | ROBAWS `commercial_clients` | Acquisition month only when linked to a dated CRM lead; otherwise YTD/all-time only | Requires project, invoice, invoiced-value or paid-value evidence. Accepted offer alone is not won. |
| Won projects | Distinct projects | ROBAWS `projects` | `projects.won_at` | A client with several projects counts once as a client and once per project here. |
| Project completed | Distinct projects | ROBAWS `projects` | `projects.completed_at` | N/A where ROBAWS does not supply a completion timestamp. |
| Won project value | Project rows | ROBAWS `projects` | Project won date for activity; acquisition month for cohort value | Detailed project rows are authoritative while the client aggregate differs. Values are not profit. |
| Invoiced revenue | Distinct invoices | ROBAWS `commercial_invoices` | `invoice_date` | Sum `max(0, total_incl_vat - credited_total)`. Several invoices do not create several projects or clients. |
| Paid value to date | Invoice/client balance snapshot | ROBAWS invoice/client `paid_total` | No payment-event date available | May be attached to an invoice cohort, but must not be labelled cash received during that month. |
| Payments received | Payment transactions | Not currently available | `payment_received_at` | N/A until dated payment transactions are imported. |
| Advertising spend | Daily ad facts | Meta/Google `daily_marketing_metrics` | Fact `date` | Sum daily idempotent rows for exact range. Missing source cost is N/A, never zero. |
| CPL | Acquisition spend / known acquired leads | Daily facts or verified manual acquisition spend | Same acquisition period/window for numerator and denominator | Only sources with both cost and lead evidence. |
| Paid CAC | Attributable paid acquisition cost / paid-source won clients | Spend facts + ROBAWS | Cohort basis | Referrals, historical/returning clients, and unknown sources are excluded. |
| Cohort cash ROAS | Paid value to date attributed to cohort / cohort acquisition spend | ROBAWS balances + spend facts | Acquisition cohort | Explicitly a paid-value snapshot, not payment-date cash ROAS. |
| Customer payback scope | Won-client records with later project/invoice value | CRM acquisition date + ROBAWS commercial ledger | A selected month/quarter includes only clients with a trusted acquisition date inside that range; YTD retains the broader won-client view and labels unverified acquisition dates | Project, invoiced and paid-to-date values follow the selected clients even when those commercial events happened later. |

## Identity and attribution rules

- Stable external IDs are preferred for source joins.
- CRM duplicate people are merged only through exact normalized email or phone evidence.
- A name is a secondary review signal and never an automatic deduplication key.
- User-verified source overrides are preserved. Unmatched manual-source clients are included in YTD/all-time source truth but not assigned to a guessed acquisition month.
- Facebook Ads, Meta Ads and Instagram paid acquisition normalize to `Meta Ads / Facebook`. Individual campaigns remain separate.
- `Unknown` and `Unattributed` remain unresolved; they are not silently assigned to organic, direct or paid.
