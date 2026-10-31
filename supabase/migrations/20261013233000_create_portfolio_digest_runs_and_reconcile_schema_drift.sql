-- Backfilled prerequisite and reconciliation migration.
-- Version 20261013233000 intentionally sorts immediately before the exact
-- recorded 20261013233140 portfolio_digest_runs RLS migration. That historical
-- migration assumes the table exists but does not create it.
--
-- Production already has the table and columns; IF NOT EXISTS makes this
-- migration safe for the current schema while allowing clean migration replay.
-- This migration was applied to production on 2026-10-31 and is recorded in
-- the linked Supabase migration ledger.

create table if not exists public.portfolio_digest_runs (
  slot_key text primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  delivery jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists portfolio_digest_runs_started_idx
  on public.portfolio_digest_runs (started_at desc);

comment on table public.portfolio_digest_runs is
  'Idempotency ledger for scheduled portfolio digest delivery across redundant schedulers.';

-- Reconcile additional schema deltas found in read-only production inspection.
alter table public.portfolio_signal_family_scorecard
  add column if not exists median_20d_excess_return_pct numeric;

alter table public.portfolio_holdings
  add column if not exists currency text not null default 'USD';
alter table public.portfolio_purchase_lots
  add column if not exists currency text not null default 'USD';
alter table public.portfolio_transactions
  add column if not exists currency text not null default 'USD';

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_currency_check;
alter table public.portfolio_holdings
  add constraint portfolio_holdings_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.portfolio_purchase_lots
  drop constraint if exists portfolio_purchase_lots_currency_check;
alter table public.portfolio_purchase_lots
  add constraint portfolio_purchase_lots_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.portfolio_transactions
  drop constraint if exists portfolio_transactions_currency_check;
alter table public.portfolio_transactions
  add constraint portfolio_transactions_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.portfolio_cash_flows
  drop constraint if exists portfolio_cash_flows_flow_type_check;
alter table public.portfolio_cash_flows
  add constraint portfolio_cash_flows_flow_type_check
  check (flow_type = any (array['deposit'::text, 'withdrawal'::text, 'dividend'::text, 'fee'::text, 'reward'::text]));

comment on table public.portfolio_cash_flows is
  'External deposits and withdrawals, dividends, rewards and fees used to reconcile account cash and performance. Amounts are stored in native currency with event-date USD conversion.';

-- forecast_model_config and forecast_snapshots have RLS enabled with no direct
-- user policies. Access is mediated by trusted server endpoints using service_role.
revoke all privileges on table
  public.forecast_model_config,
  public.forecast_snapshots
from anon, authenticated;
