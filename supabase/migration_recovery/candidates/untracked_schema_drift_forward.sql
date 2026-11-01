-- REVIEW-ONLY CANDIDATE; not in supabase/migrations/ and not applied to production.
-- Reconciles schema deltas present in the read-only production inspection but
-- missing from the exact 30-version historical migration ledger.
-- All DDL is additive/idempotent. Validate with the disposable PostgreSQL test
-- before generating the active migration(s) with Supabase CLI.

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

-- These two tables have RLS enabled with no policies, but production still had
-- direct DML grants to anon/authenticated. Remove the unused direct grants.
-- service_role retains its existing privileges for trusted server endpoints.
revoke all privileges on table
  public.forecast_model_config,
  public.forecast_snapshots
from anon, authenticated;
