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
