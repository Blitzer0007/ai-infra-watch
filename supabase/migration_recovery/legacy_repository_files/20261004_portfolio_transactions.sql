create table if not exists public.portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  transaction_type text not null check (transaction_type in ('BUY','SELL')),
  order_type text,
  trade_date date not null,
  order_placed_at text,
  order_executed_at text,
  quantity numeric not null check (quantity > 0),
  price numeric,
  amount numeric not null check (amount > 0),
  brokerage numeric,
  source text not null default 'broker_order_report',
  source_row integer not null,
  quantity_derived boolean not null default false,
  price_derived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source, source_row)
);

create index if not exists portfolio_transactions_symbol_date_idx
  on public.portfolio_transactions (symbol, trade_date, source_row);

alter table public.portfolio_transactions enable row level security;

comment on table public.portfolio_transactions is
  'Broker transaction history used for purchase-date-aware portfolio calculations and counterfactual analysis.';
comment on column public.portfolio_transactions.source_row is
  'Original row number in the imported broker order report.';
comment on column public.portfolio_transactions.quantity_derived is
  'True when quantity was reconstructed from amount / price.';
comment on column public.portfolio_transactions.price_derived is
  'True when price was reconstructed from amount / quantity.';
