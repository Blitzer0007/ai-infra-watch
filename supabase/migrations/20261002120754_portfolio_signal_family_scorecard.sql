create table if not exists public.portfolio_signal_family_scorecard (
  signal_type text primary key,
  evaluated_samples integer not null default 0,
  mean_5d_excess_return_pct numeric,
  mean_20d_excess_return_pct numeric,
  win_rate_20d numeric,
  lifecycle_status text not null default 'active',
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.portfolio_signal_family_scorecard enable row level security;
revoke all on public.portfolio_signal_family_scorecard from anon, authenticated;
