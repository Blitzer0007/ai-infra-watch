    if (!list.length || businessDaysBetween(list[list.length-1], anchor) >= 20) list.push(anchor);
    byTicker.set(ticker, list);
  }
  return [...byTicker.values()].reduce((sum,list)=>sum+list.length,0);
}

function signed(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2);
}

function transactionNetCash(transaction) {
  const amount = Number(transaction.amount) || 0;
  const brokerage = Number(transaction.brokerage) || 0;
  return transaction.transaction_type === 'SELL' ? Math.max(0, amount - brokerage) : amount + brokerage;
}

function simulateSameCash(transactions, benchmarkHistory, benchmarkCurrent) {
  const ordered=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date))||Number(a.source_row||0)-Number(b.source_row||0));
  let shares=0, netDeposits=0, used=0, fallbackTrades=0; const skipped=[];
  for(const tx of ordered){
    const matched=previousOrSamePoint(benchmarkHistory?.points||[],tx.trade_date);
    const price=Number(matched?.price);
    if(!(price>0)){skipped.push(String(tx.trade_date||'unknown'));continue;}
    used++; if(String(matched.date)<String(tx.trade_date))fallbackTrades++;
    const cash=transactionNetCash(tx);
    if(tx.transaction_type==='BUY'){shares+=cash/price;netDeposits+=cash;}else{const sharesToSell=Math.min(shares,cash/price);shares-=sharesToSell;netDeposits-=cash;}
  }
  const live=Number(benchmarkCurrent), last=sortedHistoryPoints(benchmarkHistory).at(-1), current=live>0?live:Number(last?.price);
  const value=current>0?shares*current:null;
  return {value,netDeposits,pnl:value==null?null:value-netDeposits,shares,coverage:{
    totalTrades:ordered.length,tradesUsed:used,tradesSkipped:skipped.length,coveragePct:ordered.length?used/ordered.length*100:100,fallbackTrades,skippedDates:skipped,status:skipped.length?'partial':'complete'
  }};
}

function calculateActualPortfolio(holdings, transactionRows, quotes, histories = {}) {
  let currentValue=0, liveQuotes=0, staleFallbacks=0, missingQuotes=0;
  for(const holding of holdings){
    const symbol=String(holding.symbol).toUpperCase();
    const live=Number(quotes[symbol]?.price);
    if(live>0){currentValue+=live*Number(holding.quantity);liveQuotes++;continue;}
    const last=sortedHistoryPoints(histories[symbol]).at(-1);
    if(Number(last?.price)>0){currentValue+=Number(last.price)*Number(holding.quantity);staleFallbacks++;}else missingQuotes++;
  }
  let buyCash=0,saleCash=0;
  for(const tx of transactionRows){if(tx.transaction_type==='BUY')buyCash+=transactionNetCash(tx);else saleCash+=transactionNetCash(tx);}
  const netContributed=buyCash-saleCash;
  return {currentValue,buyCash,saleCash,netContributed,pnl:currentValue-netContributed,quoteCoverage:{
    totalHoldings:holdings.length,liveQuotes,staleFallbacks,missingQuotes,
    coveragePct:holdings.length?(liveQuotes+staleFallbacks)/holdings.length*100:100,
    status:missingQuotes?'partial':staleFallbacks?'stale-fallback':'complete'
  }};
}

function sortedHistoryPoints(history) {
  return Array.isArray(history?.points)
    ? [...history.points].filter(point => point?.date && Number(point?.price) > 0).sort((a,b) => String(a.date).localeCompare(String(b.date)))
    : [];
}

function dailyVolatilityPct(points, lookback = 20) {
  const ordered = sortedHistoryPoints({ points }).slice(-(lookback + 1));
  const returns = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = Number(ordered[i - 1]?.price);
    const current = Number(ordered[i]?.price);
    if (previous > 0 && current > 0) returns.push((current / previous - 1) * 100);
  }
  if (returns.length < 2) return null;
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;
  return Math.sqrt(Math.max(0, variance));