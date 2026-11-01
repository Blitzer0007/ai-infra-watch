
create table if not exists public.portfolio_purchase_lots (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.portfolio_holdings(id) on delete cascade,
  symbol text not null,
  purchase_date date,
  invested_amount numeric(20,8) not null check (invested_amount > 0),
  execution_price numeric(20,8) not null check (execution_price > 0),
  quantity numeric(20,8) not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_purchase_lots_holding_idx
  on public.portfolio_purchase_lots(holding_id, purchase_date, created_at);

create index if not exists portfolio_purchase_lots_symbol_idx
  on public.portfolio_purchase_lots(symbol, purchase_date, created_at);

alter table public.portfolio_purchase_lots enable row level security;

insert into public.portfolio_purchase_lots
  (holding_id, symbol, purchase_date, invested_amount, execution_price, quantity, notes)
select
  h.id,
  h.symbol,
  h.purchase_date,
  round((h.quantity * h.average_cost)::numeric, 8),
  h.average_cost,
  h.quantity,
  case
    when coalesce(h.notes, '') <> '' then 'Migrated opening position. ' || h.notes
    else 'Migrated opening position from portfolio holding.'
  end
from public.portfolio_holdings h
where not exists (
  select 1
  from public.portfolio_purchase_lots l
  where l.holding_id = h.id
);
