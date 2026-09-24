# Overview metric contract

This document is the calculation contract for the marketing-report-dashboard Overview.

## Scope model

The dashboard deliberately keeps two different scopes separate.

### Calendar period

Question: **What happened in the company between the selected dates?**

Calendar-period commercial metrics use ROBAWS commercial dates:

- project won value: `projects.won_at`
- invoiced value: `commercial_invoices.invoice_date`
- paid value on period invoices: current `commercial_invoices.paid_total` for invoices whose `invoice_date` is inside the period

Source and campaign filters do **not** change these company-wide period metrics.

### Acquisition cohort

Question: **What eventually happened to leads acquired between the selected dates?**

The cohort starts from deduplicated CRM people whose lead creation date is inside the selected period. Source and campaign filters apply to this cohort and to acquisition economics.

Later customer/project/invoice outcomes remain attached to the acquisition cohort where an evidence-safe CRM/ROBAWS link exists.

## Payment terminology

The current commercial schema contains:

- `invoice_date`
- `paid_total`

It does not contain reliable `payment_date` + `payment_amount` transactions.

Therefore:

- use **Paid value on period invoices**
- use **Cohort paid value to date**
- do not label invoice `paid_total` as **Cash collected this period**
- cohort payback timing is anchored to invoice dates and must state that limitation

Actual cash collection by payment date requires a payment transaction source.

## Business money flow

Calendar-period business flow:

1. Won project value
2. Invoiced value
3. Paid value on period invoices

Supporting ratios:

- invoiced / won value
- paid / invoiced
- paid / won value

Outstanding invoiced value is:

`max(0, net invoice incl. VAT - paid_total)`

The aggregate difference between period won value and period invoiced value may be displayed as a timing gap / not-yet-invoiced comparison. It must never be described as lost revenue because period invoices can belong to projects won earlier.

## Acquisition milestones

Milestones are independently evidenced against unique acquired people:

- unique leads
- qualified
- completed visits
- offers sent
- signed CRM
- confirmed commercial customers

Each milestone percentage is:

`milestone people / unique acquired people`

A stage-to-stage sequential funnel is only valid when record-level sets prove that each later stage is a subset of the preceding stage. Otherwise the UI must state **Non-sequential CRM evidence**.

## Acquisition economics

Cost-based metrics use only paid acquisition sources whose spend is actually known.

Missing cost remains `null` / missing and is never converted to zero.

Definitions:

- CPL = covered acquisition spend / covered leads
- cost / qualified = covered acquisition spend / covered qualified leads
- cost / visit = covered acquisition spend / covered completed visits
- cost / offer = covered acquisition spend / covered offers
- cohort CAC = covered acquisition spend / attributable commercial customers
- cohort cash ROAS to date = attributable lifetime paid value / covered acquisition spend

The dashboard must use the full label **Cohort cash ROAS to date**.

## Source attribution

ROBAWS financial records exist independently of CRM attribution.

A commercial client source is evidence-safe when it is supported by:

- a CRM-matched lead source, or
- an explicit manual client-source override

Unmatched ROBAWS clients are never assigned a guessed marketing source.

## VAT basis

- invoice and paid-value reporting: incl. VAT, net of invoice credits where applicable
- acquisition project value: excl. VAT where ROBAWS provides a reliable excl.-VAT value
- marketing spend: source-reported amount, because current spend data does not consistently include VAT metadata

The UI must label the basis where mixing would otherwise be ambiguous.

## Cohort payback

Customers are grouped by acquisition month.

For each cohort show, when supported:

- acquisition spend
- customers acquired
- project value to date
- invoiced value to date
- paid value to date

Cumulative payback uses months since acquisition. Because payment timestamps are not currently available, paid value is attached to the month of the underlying invoice and the chart must disclose that it is invoice-date anchored.

Manual YTD source spend must not be spread across months by assumption. Monthly spend is shown only when it has an exact dated/monthly basis.

## Reconciliation

The dashboard performs internal checks for:

- covered source spend versus covered acquisition spend
- period project rows versus period won project value
- period invoice rows versus period invoiced value
- ROBAWS client-level expected invoice count versus detailed invoice rows
- ROBAWS client-level expected project count versus detailed project rows

A discrepancy is surfaced in Data Trust / Action Required instead of silently hidden.

## Drilldown requirement

Important aggregates must open their underlying records:

- projects → project rows
- invoices / paid value → invoice rows
- leads / qualification / visits → CRM and appointment rows
- offers → offer rows
- customers → commercial client rows
- spend → source/campaign spend evidence
- cohort value → customers and linked commercial records
