alter table public.quotes
  add column if not exists sent_at timestamptz;

comment on column public.quotes.sent_at is
  'Timestamp/date the commercial offer was sent to the client when supplied by the source system (for ROBAWS: offer.sentDate). Null means sending is not verified.';

create index if not exists quotes_lead_sent_at_idx
  on public.quotes (lead_id, sent_at desc);
