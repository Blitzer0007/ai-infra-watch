create index if not exists forecast_snapshots_validation_lookup_idx
  on public.forecast_snapshots (status, horizon, ticker, verified_at desc);

alter table public.forecast_snapshots
  add constraint forecast_evidence_snapshot_size_check
  check (pg_column_size(evidence_snapshot) <= 65536);

comment on constraint forecast_evidence_snapshot_size_check on public.forecast_snapshots is
  'Keeps creation-time evidence payloads bounded to protect database storage on the Free tier.';
