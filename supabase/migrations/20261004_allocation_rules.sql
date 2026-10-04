alter table public.portfolio_holdings
  add column if not exists target_allocation_pct numeric,
  add column if not exists max_allocation_pct numeric;

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_target_allocation_pct_check;

alter table public.portfolio_holdings
  add constraint portfolio_holdings_target_allocation_pct_check
  check (target_allocation_pct is null or (target_allocation_pct >= 0 and target_allocation_pct <= 100));

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_max_allocation_pct_check;

alter table public.portfolio_holdings
  add constraint portfolio_holdings_max_allocation_pct_check
  check (max_allocation_pct is null or (max_allocation_pct >= 0 and max_allocation_pct <= 100));

alter table public.portfolio_holdings
  drop constraint if exists portfolio_holdings_allocation_order_check;

alter table public.portfolio_holdings
  add constraint portfolio_holdings_allocation_order_check
  check (
    target_allocation_pct is null
    or max_allocation_pct is null
    or target_allocation_pct <= max_allocation_pct
  );

comment on column public.portfolio_holdings.target_allocation_pct is
  'User-defined desired portfolio weight for allocation review. This is a review target, not an automatic trade instruction.';

comment on column public.portfolio_holdings.max_allocation_pct is
  'User-defined maximum portfolio weight. Crossing this level creates a reduce/sell-review signal; it does not execute trades.';