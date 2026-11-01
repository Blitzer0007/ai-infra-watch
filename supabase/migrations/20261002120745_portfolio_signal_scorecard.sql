create table if not exists public.portfolio_signal_scorecard (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  symbol text,
  signal_type text not null,
  signal_state text,
  confidence numeric,
  evidence jsonb not null default '{}'::jsonb,
  signal_price numeric,
  benchmark_price numeric,
  observed_at timestamptz not null default now(),
  target_5_status text not null default 'pending',
  target_5_date date,
  target_5_return_pct numeric,
  target_5_benchmark_return_pct numeric,
  target_5_excess_return_pct numeric,
  target_20_status text not null default 'pending',
  target_20_date date,
  target_20_return_pct numeric,
  target_20_benchmark_return_pct numeric,
  target_20_excess_return_pct numeric,
  lifecycle_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolio_signal_scorecard_due_idx
  on public.portfolio_signal_scorecard (target_5_status, target_20_status, observed_at);
alter table public.portfolio_signal_scorecard enable row level security;
revoke all on public.portfolio_signal_scorecard from anon, authenticated;
