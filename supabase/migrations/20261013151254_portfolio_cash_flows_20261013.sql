create table if not exists public.portfolio_cash_flows (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  flow_type text not null check (flow_type in ('deposit','withdrawal','dividend','fee')),
  amount numeric not null check (amount > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fx_to_usd numeric not null default 1 check (fx_to_usd > 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint portfolio_cash_flows_usd_fx_check check (currency <> 'USD' or fx_to_usd = 1)
);
create index if not exists portfolio_cash_flows_event_date_idx on public.portfolio_cash_flows (event_date, created_at);
alter table public.portfolio_cash_flows enable row level security;
comment on table public.portfolio_cash_flows is 'External deposits and withdrawals, dividends and fees used to reconcile account cash and performance. Amounts are stored in native currency with event-date USD conversion.';
comment on column public.portfolio_cash_flows.fx_to_usd is 'Historical USD value of one unit of the event currency, entered at the event date. USD rows must use 1.';
