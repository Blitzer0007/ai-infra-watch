/** Preserve stored fields for read-only diagnostics before legacy DTO coercions. */
const numeric = value => {
  if(typeof value==='boolean'||(typeof value!=='number'&&typeof value!=='string'))return null;
  if(typeof value==='string'&&(!value.trim()||value.length>80||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d{1,3})?$/i.test(value)))return null;
  const number=Number(value);return Number.isFinite(number)?number:null;
};
export function storedLedgerInputs(row) {
  return {
    contractVersion:'stored-ledger-inputs-v1',
    symbol:typeof row.symbol==='string'&&/^[A-Z0-9.^=-]{1,20}$/.test(row.symbol.trim().toUpperCase())?row.symbol.trim().toUpperCase():null,
    transactionType:['BUY','SELL'].includes(row.transaction_type)?row.transaction_type:null,
    quantity:numeric(row.quantity),amount:numeric(row.amount),brokerage:numeric(row.brokerage),
    currency:typeof row.currency==='string'&&/^[A-Za-z]{3}$/.test(row.currency)?row.currency:null,
    tradeDate:typeof row.trade_date==='string'&&row.trade_date.length===10?row.trade_date:null,
    executedAt:typeof row.order_executed_at==='string'&&row.order_executed_at.length<=40?row.order_executed_at:null,
    quantityDerived:typeof row.quantity_derived==='boolean'?row.quantity_derived:null,
    priceDerived:typeof row.price_derived==='boolean'?row.price_derived:null,
  };
}
export function storedHoldingInputs(row) {
  const symbol=typeof row.symbol==='string'?row.symbol.trim().toUpperCase():'';
  return {contractVersion:'stored-holding-inputs-v1',symbol:/^[A-Z0-9.^=-]{1,20}$/.test(symbol)?symbol:null,quantity:numeric(row.quantity)};
}

export function storedHoldingValuationInputs(row) {
  return { contractVersion: 'stored-holding-valuation-v1',
    symbol: storedHoldingInputs(row).symbol, quantity: numeric(row.quantity), averageCost: numeric(row.average_cost),
    currency: typeof row.currency === 'string' && /^[A-Za-z]{3}$/.test(row.currency) ? row.currency.toUpperCase() : null };
}

export function storedCashFlowInputs(row) {
  return {contractVersion:'stored-cash-flow-inputs-v1',eventDate:typeof row.event_date==='string'?row.event_date:null,
    flowType:['deposit','withdrawal','dividend','fee','reward'].includes(row.flow_type)?row.flow_type:null,
    amount:numeric(row.amount),currency:typeof row.currency==='string'&&/^[A-Z]{3}$/.test(row.currency)?row.currency:null,fxToUsd:numeric(row.fx_to_usd)};
}

export function transactionQuality(row) {
  const warnings = [];
  if (!row.trade_date || Number.isNaN(Date.parse(String(row.trade_date)))) warnings.push('invalid trade date');
  const quantity = Number(row.quantity);
  const amount = Number(row.amount);
  const price = row.price == null ? null : Number(row.price);
  if (!(quantity > 0)) warnings.push('non-positive quantity');
  if (!(amount > 0)) warnings.push('non-positive amount');
  if (price != null && Number.isFinite(price) && price > 0 && quantity > 0 && amount > 0) {
    const implied = quantity * price;
    const tolerance = Math.max(0.05, Math.abs(amount) * 0.01);
    if (Math.abs(implied - amount) > tolerance) warnings.push('price × quantity differs from amount');
  }
  if (row.quantity_derived) warnings.push('quantity derived');
  if (row.price_derived) warnings.push('price derived');
  const currency = String(row.currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) warnings.push('invalid currency');
  return {
    status: warnings.length ? 'review' : 'ok',
    warnings,
    currency,
  };
}
