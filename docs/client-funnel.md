# Client funnel reporting model

The dashboard uses one commercial journey for all reporting dimensions:

```
Tracked spend
→ CRM records
→ unique people
→ qualified
→ visit
→ offer created
→ offer sent
→ open sent pipeline
→ CRM signed
→ commercially verified project
→ revenue
```

## Identity rule

The client journey is person-based, not CRM-row-based.

CRM rows are merged when they share an exact normalized email, a normalized phone number, or a reliable exact normalized full name. Matching is deterministic; fuzzy name matching is not used.

For a merged person:
- the earliest CRM record owns first-touch source, campaign, ad and acquisition date;
- later CRM records can contribute current CRM status and sales ownership;
- appointments, ROBAWS offers and commercial projects linked to any merged CRM record attach to the same client card;
- the client drawer exposes how many CRM records were merged and which sources appeared.

## Funnel evidence

| Stage | Evidence |
| --- | --- |
| CRM records | Raw CRM lead rows in the selected acquisition cohort |
| Unique people | Deduplicated master people |
| Qualified | CRM quality/stage evidence or a downstream commercial event |
| Visit | Appointment record or explicit CRM visit-stage evidence |
| Offer created | Linked commercial offer from ROBAWS |
| Offer sent | `quotes.sent_at`, populated only from the source-system send date |
| Open sent pipeline | Open offer + verified sent timestamp |
| CRM signed | Explicit CRM signed status |
| Verified project | Commercial project evidence |
| Revenue | Attributable commercial project value |

CRM signed and verified project are intentionally separate.

## Offer dates and amounts

The dashboard keeps these fields separate:
- offer/document date;
- sent-to-client date;
- follow-up date;
- amount excl. VAT;
- amount incl. VAT;
- current status;
- days open;
- attribution status.

A missing `sent_at` is rendered as **Not verified**. The application must not infer that an offer was sent merely because an offer document exists.

ROBAWS fields:
- `sentDate` → `quotes.sent_at`
- `followUpDate` → `quotes.follow_up_at`

## Cohorts

The global month filter is an acquisition-cohort filter. A client acquired in April remains in the April cohort even if the visit, offer, signed status or project occurs later.

## Consistent dimensions

The same funnel definitions are used for:
- acquisition source;
- service;
- campaign;
- municipality;
- salesperson;
- acquisition month.

Spend-derived KPIs are only shown when the relevant spend exists. Geographic CPL/CAC is not inferred from overall spend.

## Operational use

The Client Journey board is the person-level view. Each card opens an evidence drawer with first-touch attribution, merged CRM-record count, contact data, appointments, offers, sent/follow-up dates, CRM signed evidence, and verified projects.

Offers & Pipeline is the commercial work queue. It separates:
- created offers;
- verified sent offers;
- open sent pipeline;
- open offers whose sending is not verified;
- follow-ups due;
- accepted and rejected value;
- pipeline aging.

## Data-quality rules

- DATE_CONFLICT commercial records are excluded from attributable funnel/revenue calculations.
- Missing evidence renders as missing; it is not replaced by a guessed value.
- Duplicate CRM records do not create extra client cards.
- Commercial status is not allowed to overwrite attribution source.
