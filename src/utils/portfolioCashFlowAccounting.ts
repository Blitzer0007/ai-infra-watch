export type CashFlowType = 'deposit' | 'withdrawal' | 'dividend' | 'fee' | 'reward';
export type CashFlowHolding = { symbol: string; quantity: number; currentPrice: number | null };
export type CashFlowTrade = { symbol: string; transactionType: 'BUY' | 'SELL'; quantity: number; amount: number; brokerage?: number | null; currency?: string | null };
export type CashFlowRecord = { flowType: CashFlowType; amount: number; currency: string; fxToUsd: number };
export type AccountCashFlowPerformance = {
  status: 'complete' | 'quotes-incomplete' | 'quantity-mismatch' | 'mixed-trade-currency' | 'external-flows-missing' | 'invalid-records';
  holdingsValueUsd: number | null; cashBalanceUsd: number | null; accountValueUsd: number | null;
  netContributionsUsd: number | null; dividendsUsd: number | null; feesUsd: number | null; rewardsUsd: number | null;
  totalPnlUsd: number | null; pnlOnNetContributionsPct: number | null; quantityMismatchSymbols: string[]; note: string;
};

export function calculateAccountCashFlowPerformance(holdings: CashFlowHolding[], trades: CashFlowTrade[], cashFlows: CashFlowRecord[], quoteCoverageComplete: boolean): AccountCashFlowPerformance {
  const base: AccountCashFlowPerformance = {
    status: 'invalid-records', holdingsValueUsd: null, cashBalanceUsd: null, accountValueUsd: null, netContributionsUsd: null,
    dividendsUsd: null, feesUsd: null, rewardsUsd: null, totalPnlUsd: null, pnlOnNetContributionsPct: null, quantityMismatchSymbols: [],
    note: 'Account performance is withheld until holdings, trades and cash-flow records can be reconciled.',
  };
  if (trades.some(row => String(row.currency || 'USD').toUpperCase() !== 'USD')) return { ...base, status: 'mixed-trade-currency', note: 'Account totals are withheld because trade history contains non-USD trades without stored historical FX conversion.' };
  const invalidTrade = trades.some(row => !String(row.symbol || '').trim() || !['BUY', 'SELL'].includes(row.transactionType)
    || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0 || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0
    || !Number.isFinite(Number(row.brokerage ?? 0)) || Number(row.brokerage ?? 0) < 0);
  const invalidFlow = cashFlows.some(row => !['deposit', 'withdrawal', 'dividend', 'fee', 'reward'].includes(row.flowType)
    || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0 || !/^[A-Z]{3}$/.test(String(row.currency || '').toUpperCase())
    || !Number.isFinite(Number(row.fxToUsd)) || Number(row.fxToUsd) <= 0
    || (String(row.currency).toUpperCase() === 'USD' && Math.abs(Number(row.fxToUsd) - 1) > 0.000001));
  if (invalidTrade || invalidFlow) return base;

  const holdingQty = new Map<string, number>();
  for (const row of holdings) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    if (!symbol || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0) return base;
    holdingQty.set(symbol, (holdingQty.get(symbol) || 0) + Number(row.quantity));
  }
  const tradeQty = new Map<string, number>();
  let tradeCashUsd = 0;
  for (const row of trades) {
    const symbol = String(row.symbol).trim().toUpperCase(), quantity = Number(row.quantity), amount = Number(row.amount), brokerage = Number(row.brokerage || 0);
    tradeQty.set(symbol, (tradeQty.get(symbol) || 0) + (row.transactionType === 'SELL' ? -quantity : quantity));
    tradeCashUsd += row.transactionType === 'BUY' ? -(amount + brokerage) : Math.max(0, amount - brokerage);
  }
  const symbols = new Set([...holdingQty.keys(), ...tradeQty.keys()]);
  const quantityMismatchSymbols = [...symbols].filter(symbol => {
    const held = holdingQty.get(symbol) || 0, traded = tradeQty.get(symbol) || 0;
    return Math.abs(held - traded) > Math.max(0.00001, Math.abs(held) * 0.0001);
  }).sort();
  if (quantityMismatchSymbols.length) return { ...base, status: 'quantity-mismatch', quantityMismatchSymbols, note: 'Account totals are withheld because recorded buys/sells do not reconcile to current holdings.' };

  let deposits = 0, withdrawals = 0, dividends = 0, fees = 0, rewards = 0, flowCashUsd = 0;
  for (const row of cashFlows) {
    const usd = Number(row.amount) * Number(row.fxToUsd);
    if (row.flowType === 'deposit') { deposits += usd; flowCashUsd += usd; }
    else if (row.flowType === 'withdrawal') { withdrawals += usd; flowCashUsd -= usd; }
    else if (row.flowType === 'dividend') { dividends += usd; flowCashUsd += usd; }
    else if (row.flowType === 'reward') { rewards += usd; flowCashUsd += usd; }
    else { fees += usd; flowCashUsd -= usd; }
  }
  const netContributionsUsd = deposits - withdrawals;
  if (!(deposits > 0) || !cashFlows.length) return { ...base, status: 'external-flows-missing', netContributionsUsd, dividendsUsd: dividends, feesUsd: fees, rewardsUsd: rewards,
    note: 'Add the account’s opening deposit and record later deposits/withdrawals, dividends and fees before using account-level performance.' };

  const allQuotes = quoteCoverageComplete && holdings.every(row => Number(row.currentPrice) > 0 && Number.isFinite(Number(row.currentPrice)));
  const holdingsValueUsd = allQuotes ? holdings.reduce((sum, row) => sum + Number(row.currentPrice) * Number(row.quantity), 0) : null;
  const cashBalanceUsd = flowCashUsd + tradeCashUsd;
  if (!allQuotes || holdingsValueUsd == null) return { ...base, status: 'quotes-incomplete', cashBalanceUsd, netContributionsUsd, dividendsUsd: dividends, feesUsd: fees,
    note: 'Cash balance is calculated, but account value and P&L are withheld until every holding has a fresh quote.' };
  const accountValueUsd = holdingsValueUsd + cashBalanceUsd, totalPnlUsd = accountValueUsd - netContributionsUsd;
  return {
    status: 'complete', holdingsValueUsd, cashBalanceUsd, accountValueUsd, netContributionsUsd, dividendsUsd: dividends, feesUsd: fees, rewardsUsd: rewards,
    totalPnlUsd, pnlOnNetContributionsPct: netContributionsUsd > 0 ? totalPnlUsd / netContributionsUsd * 100 : null,
    quantityMismatchSymbols: [],
    note: 'Uses recorded external cash flows, stock trades and current quotes. The percentage is P&L divided by net contributions, not time-weighted return; unrecorded cash flows or missing FX rates will distort results.',
  };
}
