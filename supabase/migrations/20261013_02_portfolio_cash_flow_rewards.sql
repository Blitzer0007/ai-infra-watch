alter table public.portfolio_cash_flows
  drop constraint if exists portfolio_cash_flows_flow_type_check;

alter table public.portfolio_cash_flows
  add constraint portfolio_cash_flows_flow_type_check
  check (flow_type = any (array['deposit'::text, 'withdrawal'::text, 'dividend'::text, 'fee'::text, 'reward'::text]));

comment on table public.portfolio_cash_flows is 'External deposits and withdrawals, dividends, rewards and fees used to reconcile account cash and performance. Amounts are stored in native currency with event-date USD conversion.';
