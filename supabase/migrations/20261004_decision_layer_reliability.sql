alter table public.portfolio_holdings
  add column if not exists broker_alerts jsonb default '[]'::jsonb,
  add column if not exists rule_stages jsonb default '[]'::jsonb,
  add column if not exists rule_stage_state jsonb default '{}'::jsonb,
  add column if not exists risk_group text,
  add column if not exists shock_sensitivity numeric default 1;

update public.portfolio_holdings
set broker_alerts = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'price', alert.price,
      'direction', case when alert.price < average_cost then 'below' else 'above' end,
      'label', case when alert.price < average_cost then 'stop / downside review' else 'target / upside review' end
    ) order by alert.ord
  ), '[]'::jsonb)
  from (
    select (value)::numeric as price, ordinality as ord
    from jsonb_array_elements_text(coalesce(broker_alert_prices, '[]'::jsonb)) with ordinality
    where (value)::numeric > 0
  ) alert
  where true
)
where (broker_alerts is null or broker_alerts = '[]'::jsonb)
  and jsonb_typeof(broker_alert_prices) = 'array';

update public.portfolio_holdings
set broker_alerts = '[]'::jsonb
where broker_alerts is null;

update public.portfolio_holdings
set rule_stages = jsonb_build_array(
  jsonb_build_object('type','stop','pct',loss_limit_pct,'basis','average_cost'),
  jsonb_build_object('type','trailing','pct',exit_rule_value,'activates_after',null)
)
where (rule_stages is null or rule_stages = '[]'::jsonb)
  and loss_limit_pct is not null
  and exit_rule_type ilike '%trailing%'
  and exit_rule_value is not null;

update public.portfolio_holdings
set risk_group = case
  when symbol in ('SOXL','NVDA','DRAM') then 'semiconductor'
  when symbol in ('DGXX','VIVO') then 'power'
  when symbol in ('NBIS','NOW','MSFT','META') then 'ai-platform'
  when symbol in ('RKLB') then 'space'
  when symbol in ('PHVS') then 'biotech'
  else coalesce(risk_group,'other')
end
where risk_group is null;

update public.portfolio_holdings
set shock_sensitivity = 1
where shock_sensitivity is null or shock_sensitivity <= 0;

-- Preserve the documented three-stage RKLB plan without treating stages as trade execution.
update public.portfolio_holdings
set rule_stages = '[
  {"type":"stop","pct":20,"basis":"average_cost"},
  {"type":"take_profit","pct":20,"action":"sell_fraction","fraction":0.5},
  {"type":"trailing","pct":15,"activates_after":"take_profit"}
]'::jsonb,
rule_stage_state = '{}'::jsonb
where symbol = 'RKLB';

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_shock_sensitivity_check;

alter table public.portfolio_holdings
  add constraint portfolio_holdings_shock_sensitivity_check
  check (shock_sensitivity is null or shock_sensitivity > 0);

comment on column public.portfolio_holdings.broker_alerts is
  'Directional broker review alerts: [{price, direction: below|above, label}]. Review/alert points only.';
comment on column public.portfolio_holdings.rule_stages is
  'Ordered review-rule stages such as stop, take_profit and trailing. These do not execute trades.';
comment on column public.portfolio_holdings.rule_stage_state is
  'Persisted stage progress such as hit timestamps and post-activation peak prices.';
comment on column public.portfolio_holdings.risk_group is
  'User-editable portfolio risk group used by scenario analysis.';
comment on column public.portfolio_holdings.shock_sensitivity is
  'User-editable multiplier for group shock scenarios.';

alter table public.decision_journal_entries
  add column if not exists decision_score_pct numeric,
  add column if not exists action_taken text,
  add column if not exists transaction_id uuid references public.portfolio_transactions(id) on delete set null;

alter table public.decision_journal_entries
  drop constraint if exists decision_journal_action_taken_check;

alter table public.decision_journal_entries
  add constraint decision_journal_action_taken_check
  check (action_taken is null or action_taken in ('none','BUY','SELL','HOLD','OTHER'));

alter table public.portfolio_signal_family_scorecard
  add column if not exists median_20d_excess_return_pct numeric;

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
  'Idempotency ledger for scheduled portfolio digest deliveries across redundant schedulers.';
