create table if not exists public.portfolio_holdings (
    id uuid primary key default gen_random_uuid(),
    symbol text not null unique,
    quantity numeric(20,8) not null check (quantity > 0),
    average_cost numeric(20,8) not null check (average_cost >= 0),
    purchase_date date,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

create index if not exists portfolio_holdings_symbol_idx on public.portfolio_holdings(symbol);

create or replace function public.set_portfolio_holdings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_holdings_updated_at on public.portfolio_holdings;
create trigger portfolio_holdings_updated_at
before update on public.portfolio_holdings
for each row execute function public.set_portfolio_holdings_updated_at();

alter table public.portfolio_holdings enable row level security;
