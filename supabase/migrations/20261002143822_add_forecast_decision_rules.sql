ALTER TABLE public.portfolio_holdings
    ADD COLUMN IF NOT EXISTS decision_thesis text,
    ADD COLUMN IF NOT EXISTS loss_limit_pct numeric,
    ADD COLUMN IF NOT EXISTS exit_rule_type text,
    ADD COLUMN IF NOT EXISTS exit_rule_value numeric,
    ADD COLUMN IF NOT EXISTS exit_rule_text text,
    ADD COLUMN IF NOT EXISTS practical_notes text,
    ADD COLUMN IF NOT EXISTS broker_alert_prices jsonb;

ALTER TABLE public.portfolio_holdings
    ADD CONSTRAINT portfolio_holdings_loss_limit_pct_check
      CHECK (loss_limit_pct IS NULL OR (loss_limit_pct >= 0 AND loss_limit_pct <= 100)),
    ADD CONSTRAINT portfolio_holdings_exit_rule_value_check
      CHECK (exit_rule_value IS NULL OR (exit_rule_value >= 0 AND exit_rule_value <= 100));

ALTER TABLE public.forecast_snapshots
    ADD COLUMN IF NOT EXISTS decision_thesis text,
    ADD COLUMN IF NOT EXISTS loss_limit_pct numeric,
    ADD COLUMN IF NOT EXISTS exit_rule_type text,
    ADD COLUMN IF NOT EXISTS exit_rule_value numeric,
    ADD COLUMN IF NOT EXISTS exit_rule_text text,
    ADD COLUMN IF NOT EXISTS practical_notes text;

ALTER TABLE public.forecast_snapshots
    ADD CONSTRAINT forecast_snapshots_loss_limit_pct_check
      CHECK (loss_limit_pct IS NULL OR (loss_limit_pct >= 0 AND loss_limit_pct <= 100)),
    ADD CONSTRAINT forecast_snapshots_exit_rule_value_check
      CHECK (exit_rule_value IS NULL OR (exit_rule_value >= 0 AND exit_rule_value <= 100));
