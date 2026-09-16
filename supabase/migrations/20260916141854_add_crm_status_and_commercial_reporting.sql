alter table public.leads
  add column if not exists crm_status text,
  add column if not exists robaws_client_id text,
  add column if not exists robaws_match_method text,
  add column if not exists commercial_status text,
  add column if not exists attributed_acquisition_cost numeric,
  add column if not exists attribution_level text;

alter table public.quotes
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists external_client_id text,
  add column if not exists quote_value_incl_vat numeric;

create unique index if not exists
  quotes_external_identity_idx
on public.quotes (
  external_source,
  external_id
);

comment on column public.leads.crm_status is
  'Exact current status from the source CRM, preserved without normalization.';

comment on column public.leads.robaws_match_method is
  'How the CRM lead was matched to ROBAWS: EMAIL, PHONE, EMAIL+PHONE, AMBIGUOUS, or NONE.';

comment on column public.leads.commercial_status is
  'Commercial outcome confirmed from systems such as ROBAWS, e.g. OFFER_SENT, OFFER_LOST, CLIENT_WON.';

comment on column public.leads.attributed_acquisition_cost is
  'Advertising acquisition cost attributed to this individual lead/client when reliable campaign/ad attribution is available.';
