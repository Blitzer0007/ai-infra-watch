create table if not exists public.decision_journal_entries (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid references public.portfolio_holdings(id) on delete set null,
  symbol text not null,
  decision_date date not null,
  decision text not null check (decision in ('HOLD','ADD_REVIEW','REDUCE_REVIEW','EXIT_REVIEW','WATCH')),
  thesis text not null,
  rule_text text,
  rule_snapshot jsonb not null default '{}'::jsonb,
  decision_price numeric not null check (decision_price > 0),
  benchmark_symbol text not null default 'SPY',
  benchmark_entry_price numeric,
  forecast_snapshot_id uuid references public.forecast_snapshots(id) on delete set null,
  forecast_median numeric,
  forecast_p25 numeric,
  forecast_p75 numeric,
  review_target_date date not null,
  review_status text not null default 'pending' check (review_status in ('pending','outcome_ready','completed')),
  outcome_date date,
  outcome_price numeric,
  outcome_return_pct numeric,
  benchmark_return_pct numeric,
  excess_return_pct numeric,
  forecast_error_pct numeric,
  rule_followed boolean,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists decision_journal_review_idx
  on public.decision_journal_entries (review_status, review_target_date);

create index if not exists decision_journal_symbol_date_idx
  on public.decision_journal_entries (symbol, decision_date);

alter table public.decision_journal_entries enable row level security;

comment on table public.decision_journal_entries is
  'Decision-first journal: immutable entry context plus automatically calculated 20-trading-session outcomes.';
comment on column public.decision_journal_entries.rule_snapshot is
  'Snapshot of the stored decision rule at the time the decision was logged.';
comment on column public.decision_journal_entries.forecast_snapshot_id is
  'Optional link to the most recent 20-session forecast available when the decision was logged.';
comment on column public.decision_journal_entries.review_status is
  'pending until the 20-session outcome is calculated, outcome_ready until the user records rule adherence, then completed.';
