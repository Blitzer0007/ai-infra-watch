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
