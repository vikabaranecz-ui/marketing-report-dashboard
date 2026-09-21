create index if not exists reporting_change_events_sync_log_idx
  on public.reporting_change_events(sync_log_id);

create index if not exists reporting_overrides_updated_by_idx
  on public.reporting_overrides(updated_by);
