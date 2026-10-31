
create or replace function public.add_portfolio_purchase(
  p_holding_id uuid,
  p_invested_amount numeric,
  p_execution_price numeric,
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
  new_quantity numeric;
  new_total_quantity numeric;
  new_total_invested numeric;
  new_average_cost numeric;
begin
  if p_invested_amount is null or p_invested_amount <= 0 then
    raise exception 'invested amount must be greater than zero';
  end if;
  if p_execution_price is null or p_execution_price <= 0 then
    raise exception 'execution price must be greater than zero';
  end if;

  select *
    into h
  from public.portfolio_holdings
  where id = p_holding_id
  for update;

  if not found then
    raise exception 'holding not found';
  end if;

  new_quantity := round((p_invested_amount / p_execution_price)::numeric, 8);

  if new_quantity <= 0 then
    raise exception 'calculated quantity must be greater than zero';
  end if;

  insert into public.portfolio_purchase_lots (
    holding_id, symbol, purchase_date, invested_amount,
    execution_price, quantity, notes
  )
  values (
    h.id, h.symbol, coalesce(p_purchase_date, current_date),
    p_invested_amount, p_execution_price, new_quantity, p_notes
  )
  returning * into new_lot;

  new_total_quantity := h.quantity + new_quantity;
  new_total_invested := (h.quantity * h.average_cost) + p_invested_amount;
  new_average_cost := new_total_invested / new_total_quantity;

  update public.portfolio_holdings
  set
    quantity = round(new_total_quantity::numeric, 8),
    average_cost = round(new_average_cost::numeric, 8),
    updated_at = now()
  where id = h.id
  returning * into h;

  return jsonb_build_object(
    'lot', to_jsonb(new_lot),
    'holding', to_jsonb(h)
  );
end;
$$;

revoke all on function public.add_portfolio_purchase(uuid, numeric, numeric, date, text) from public;
grant execute on function public.add_portfolio_purchase(uuid, numeric, numeric, date, text) to service_role;
