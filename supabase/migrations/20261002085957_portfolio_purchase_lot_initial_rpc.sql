
create or replace function public.create_portfolio_holding(
  p_symbol text,
  p_quantity numeric,
  p_average_cost numeric,
  p_purchase_date date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.portfolio_holdings%rowtype;
  new_lot public.portfolio_purchase_lots%rowtype;
begin
  if coalesce(trim(p_symbol), '') = '' then
    raise exception 'symbol is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;
  if p_average_cost is null or p_average_cost < 0 then
    raise exception 'average cost must be non-negative';
  end if;

  insert into public.portfolio_holdings (
    symbol, quantity, average_cost, purchase_date, notes
  )
  values (
    upper(trim(p_symbol)), p_quantity, p_average_cost, p_purchase_date, p_notes
  )
  returning * into h;

  insert into public.portfolio_purchase_lots (
    holding_id, symbol, purchase_date, invested_amount,
    execution_price, quantity, notes
  )
  values (
    h.id, h.symbol, coalesce(p_purchase_date, current_date),
    round((p_quantity * p_average_cost)::numeric, 8),
    p_average_cost, p_quantity,
    case
      when coalesce(trim(p_notes), '') <> '' then p_notes
      else 'Initial purchase'
    end
  )
  returning * into new_lot;

  return jsonb_build_object(
    'lot', to_jsonb(new_lot),
    'holding', to_jsonb(h)
  );
exception
  when unique_violation then
    raise exception 'a holding for this symbol already exists; use Add purchase instead';
end;
$$;

revoke all on function public.create_portfolio_holding(text, numeric, numeric, date, text) from public;
grant execute on function public.create_portfolio_holding(text, numeric, numeric, date, text) to service_role;
