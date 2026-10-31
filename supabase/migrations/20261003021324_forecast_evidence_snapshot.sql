alter table public.forecast_snapshots
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb;

comment on column public.forecast_snapshots.evidence_snapshot is
  'Immutable creation-time evidence context for the forecast; verification updates must not rewrite this snapshot.';
