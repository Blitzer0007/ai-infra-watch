create table if not exists public.reentry_watchlist (
  symbol text primary key check (symbol = upper(symbol) and length(symbol) between 1 and 20),
  sale_price numeric null check (sale_price is null or sale_price > 0),
  sale_date date null,
  target_price numeric not null check (target_price > 0),
  thesis text not null default '',
  thesis_invalidated boolean not null default false,
  active boolean not null default true,
  last_alert_signature text null,
  last_price numeric null,
  sma20 numeric null,
  sma50 numeric null,
  drawdown_from_52_week_high_pct numeric null,
  retrieved_at timestamptz null,
  updated_at timestamptz not null default now()
);
alter table public.reentry_watchlist enable row level security;
comment on table public.reentry_watchlist is 'User-managed sold-stock re-entry rules. Accessed through the server with service-role credentials; never stores broker credentials.';
