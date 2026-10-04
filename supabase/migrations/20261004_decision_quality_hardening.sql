alter table public.portfolio_holdings
  add column if not exists broker_alerts jsonb not null default '[]'::jsonb,
  add column if not exists broker_alerts_review_required boolean not null default false,
  add column if not exists rule_stages jsonb not null default '[]'::jsonb,
  add column if not exists rule_stage_state jsonb not null default '{}'::jsonb,
  add column if not exists risk_group text,
  add column if not exists risk_beta numeric,
  add column if not exists risk_leverage numeric not null default 1,
  add column if not exists scenario_shock_pct numeric not null default 15;

update public.portfolio_holdings
set broker_alerts = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'price', x.price,
      'direction', case when x.price < portfolio_holdings.average_cost then 'below' else 'above' end,
      'label', case when x.price < portfolio_holdings.average_cost then 'stop' else 'target' end
    )
  ), '[]'::jsonb)
  from (
    select value::numeric as price
    from jsonb_array_elements_text(coalesce(portfolio_holdings.broker_alert_prices, '[]'::jsonb))
    where value ~ '^[0-9]+(\.[0-9]+)?$' and value::numeric > 0
  ) x
)
where jsonb_array_length(coalesce(broker_alert_prices, '[]'::jsonb)) > 0
  and jsonb_array_length(broker_alerts) = 0;

update public.portfolio_holdings
set broker_alerts_review_required = true
where jsonb_array_length(coalesce(broker_alert_prices, '[]'::jsonb)) > 0;

update public.portfolio_holdings
set risk_group = case
  when upper(symbol) in ('SOXL','NVDA','DRAM','MU','SNDK','AMD') then 'semiconductor'
  when upper(symbol) in ('NBIS','DGXX') then 'ai-infrastructure'
  when upper(symbol) in ('META','MSFT','GOOG','NOW') then 'ai-platform'
  else coalesce(risk_group, 'other')
end
where risk_group is null;

update public.portfolio_holdings
set risk_beta = case
  when upper(symbol) = 'SOXL' then 1
  when upper(symbol) in ('NVDA','MU','SNDK','AMD') then 1
  else coalesce(risk_beta, 1)
end
where risk_beta is null;

update public.portfolio_holdings
set risk_leverage = case when upper(symbol) = 'SOXL' then 3 else 1 end
where risk_leverage is null or risk_leverage <= 0;

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_risk_beta_check;
alter table public.portfolio_holdings
  add constraint portfolio_holdings_risk_beta_check
  check (risk_beta is null or risk_beta >= 0);

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_risk_leverage_check;
alter table public.portfolio_holdings
  add constraint portfolio_holdings_risk_leverage_check
  check (risk_leverage > 0);

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_scenario_shock_pct_check;
alter table public.portfolio_holdings
  add constraint portfolio_holdings_scenario_shock_pct_check
  check (scenario_shock_pct >= 0 and scenario_shock_pct <= 100);

alter table public.decision_journal_entries
  add column if not exists decision_score_pct numeric,
  add column if not exists action_taken text,
  add column if not exists transaction_id uuid references public.portfolio_transactions(id) on delete set null;

alter table public.decision_journal_entries
  drop constraint if exists decision_journal_action_taken_check;
alter table public.decision_journal_entries
  add constraint decision_journal_action_taken_check
  check (action_taken is null or action_taken in ('none','BUY','SELL','HOLD','OTHER'));

comment on column public.portfolio_holdings.broker_alerts is
  'Explicit broker alert direction records: [{price,direction, label}].';
comment on column public.portfolio_holdings.broker_alerts_review_required is
  'True when alert direction was inferred from the legacy numeric broker_alert_prices array and should be manually reviewed.';
comment on column public.portfolio_holdings.rule_stages is
  'Ordered staged exit rules for review, e.g. stop, take_profit, trailing.';
comment on column public.portfolio_holdings.rule_stage_state is
  'Persisted stage observations such as activation date and trailing peak.';
comment on column public.portfolio_holdings.risk_group is
  'Editable user-defined risk group used for portfolio scenario aggregation.';
comment on column public.portfolio_holdings.risk_beta is
  'User-configured sensitivity multiplier used in scenario impact estimates.';
comment on column public.portfolio_holdings.risk_leverage is
  'Instrument leverage multiplier used in scenario impact estimates.';
comment on column public.portfolio_holdings.scenario_shock_pct is
  'Editable scenario shock size for this holding/group context.';
comment on column public.decision_journal_entries.decision_score_pct is
  'Signed decision quality score: positive means the decision direction aligned with subsequent benchmark-relative performance.';
comment on column public.decision_journal_entries.action_taken is
  'Observed action taken after the decision review, separate from the intended decision type.';
comment on column public.decision_journal_entries.transaction_id is
  'Optional link from a decision journal entry to the actual portfolio transaction.';
