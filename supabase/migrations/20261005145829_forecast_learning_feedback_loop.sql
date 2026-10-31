ALTER TABLE public.forecast_model_config
    ADD COLUMN IF NOT EXISTS baseline_direction numeric,
    ADD COLUMN IF NOT EXISTS baseline_error numeric,
    ADD COLUMN IF NOT EXISTS model_improvement_pct numeric,
    ADD COLUMN IF NOT EXISTS drift_status text,
    ADD COLUMN IF NOT EXISTS drift_score numeric,
    ADD COLUMN IF NOT EXISTS learning_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.forecast_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sample_size integer NOT NULL DEFAULT 0,
  model_direction_pct numeric,
  model_error numeric,
  baseline_error numeric,
  improvement_pct numeric,
  drift_status text NOT NULL DEFAULT 'insufficient',
  drift_score numeric,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.forecast_learning_runs ENABLE ROW LEVEL SECURITY;
