# Overview metric definitions

The Overview intentionally separates calendar-period business activity from acquisition-cohort performance.

## Calendar-period business metrics

- **Won project value**: ROBAWS project value for projects whose commercial won date falls inside the selected period.
- **Invoiced value**: invoice value net of credits for invoices whose invoice date falls inside the selected period.
- **Paid value on period invoices**: current paid total attached to those invoices. This is not labelled cash collected in the period because the current ROBAWS dataset does not include payment transaction dates.
- **Outstanding invoiced value**: selected-period invoiced value minus paid value attached to those invoices.
- **Not yet invoiced**: selected-period won project value minus selected-period invoiced value, floored at zero.

All period financial values are presented incl. VAT because invoice cash reporting is based on invoice totals.

## Acquisition-cohort metrics

The selected period chooses people by lead acquisition / creation date. Their downstream status and value are current outcomes.

Milestones are independently evidenced and are not assumed to form a strict sequential funnel.

- Unique leads
- Qualified leads
- Completed visits
- Offers sent
- Signed CRM leads
- Confirmed commercial customers

Every milestone percentage is scaled against unique leads.

## Acquisition economics

Cost metrics use only sources with known acquisition spend.

- CPL = covered spend / covered leads
- Cost per qualified = covered spend / covered qualified leads
- Cost per visit = covered spend / covered visits
- Cost per offer = covered spend / covered offers
- Cohort CAC = covered spend / attributable customers
- Cohort cash ROAS to date = lifetime paid value attributable to the selected acquired cohort / covered acquisition spend

Missing source cost remains missing and blocks cost metrics for that source.

## Cohort payback

Cohort payback keeps a customer attached to the lead acquisition period. Because payment transaction timestamps are not available, the timeline uses invoice month as its reliable timing anchor and shows current paid_total attached to those invoices. It must not be interpreted as a payment-date cash curve.

## Data trust

Overview explicitly reports marketing, CRM, commercial/ROBAWS and attribution coverage. Reconciliation differences are surfaced rather than silently hidden.
