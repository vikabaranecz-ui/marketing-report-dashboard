alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists follow_up_at timestamptz;

comment on column public.quotes.sent_at is
  'Timestamp/date the commercial offer was sent to the client when supplied by the source system (for ROBAWS: offer.sentDate). Null means sending is not verified.';

comment on column public.quotes.follow_up_at is
  'Commercial offer follow-up date when supplied by the source system (for ROBAWS: offer.followUpDate).';

create index if not exists quotes_lead_sent_at_idx
  on public.quotes (lead_id, sent_at desc);

create index if not exists quotes_follow_up_at_idx
  on public.quotes (follow_up_at)
  where follow_up_at is not null;
