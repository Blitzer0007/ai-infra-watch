-- The dashboard accesses these private records only through authenticated server
-- endpoints that use the Supabase service role. No browser Supabase client is used.
-- RLS is already enabled with no direct-user policies on these tables; remove the
-- stale broad table grants as defense in depth. The service_role grant is untouched.

revoke all privileges on table
  public.ai_quality_runs,
  public.decision_journal_entries,
  public.forecast_learning_runs,
  public.forecast_scheduler_runs,
  public.historical_data_artifacts,
  public.jev_paper_proposals,
  public.portfolio_cash_flows,
  public.portfolio_digest_runs,
  public.portfolio_holdings,
  public.portfolio_purchase_lots,
  public.portfolio_signal_family_scorecard,
  public.portfolio_signal_scorecard,
  public.portfolio_transactions,
  public.reentry_telegram_deliveries,
  public.reentry_watchlist,
  public.server_alert_config,
  public.server_alert_state
from anon, authenticated;

-- Keep the intended access boundary explicit: authenticated app access is mediated
-- by the private API layer; direct PostgREST access remains denied without a policy.
