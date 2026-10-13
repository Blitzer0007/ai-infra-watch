export type PortfolioAccountingHolding = {
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number | null;
};

export type PortfolioAccountingTransaction = {
  symbol: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  amount: number;
  brokerage?: number | null;
  currency?: string | null;
  quantityDerived?: boolean;
  priceDerived?: boolean;
  dataQuality?: string;
};

export type PortfolioAccountingStatus =
  | 'complete'
  | 'review-transactions'
  | 'quotes-incomplete'
  | 'transaction-ledger-unavailable'
  | 'quantity-mismatch'
  | 'mixed-currency';

export type PortfolioTradingPerformance = {
  status: PortfolioAccountingStatus;
  currentValue: number | null;
  openCostBasis: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  totalTradingPnl: number | null;
  grossPurchaseCost: number | null;
  netSaleProceeds: number | null;
  returnVsGrossPurchaseCostPct: number | null;
  quantityMismatchSymbols: string[];
  derivedTransactionCount: number;
  currency: string | null;
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Splits the current holdings mark-to-market P&L from realized trading P&L.
 * This is dollar P&L from the transaction ledger, not an external-cash-flow
 * or time-weighted return calculation.
 */
export function calculatePortfolioTradingPerformance(
  holdings: PortfolioAccountingHolding[],
  transactions: PortfolioAccountingTransaction[],
  quoteCoverageComplete: boolean,
): PortfolioTradingPerformance {
  const holdingsOpenCostBasis = holdings.every(row =>
    Number.isFinite(Number(row.quantity)) &&
    Number(row.quantity) >= 0 &&
    Number.isFinite(Number(row.averageCost)) &&
    Number(row.averageCost) >= 0
  )
    ? holdings.reduce((sum, row) => sum + Number(row.quantity) * Number(row.averageCost), 0)
    : null;
  const allPricesAvailable = quoteCoverageComplete && holdings.every(row =>
    isFinitePositive(row.currentPrice)
  );
  const currentValue = allPricesAvailable
    ? holdings.reduce((sum, row) => sum + Number(row.currentPrice) * Number(row.quantity), 0)
    : null;

  const base: PortfolioTradingPerformance = {
    status: 'transaction-ledger-unavailable',
    currentValue,
    openCostBasis: holdingsOpenCostBasis,
    unrealizedPnl: currentValue != null && holdingsOpenCostBasis != null ? currentValue - holdingsOpenCostBasis : null,
    realizedPnl: null,
    totalTradingPnl: null,
    grossPurchaseCost: null,
    netSaleProceeds: null,
    returnVsGrossPurchaseCostPct: null,
    quantityMismatchSymbols: [],
    derivedTransactionCount: 0,
    currency: null,
  };
  if (!transactions.length) return base;

  const currencies = [...new Set(transactions.map(row => String(row.currency || 'USD').trim().toUpperCase()))];
  if (currencies.length !== 1) return { ...base, status: 'mixed-currency' };

  const hasInvalidTransactions = transactions.some(row =>
    !String(row.symbol || '').trim() ||
    !['BUY', 'SELL'].includes(row.transactionType) ||
    !isFinitePositive(Number(row.quantity)) ||
    !isFinitePositive(Number(row.amount)) ||
    !Number.isFinite(Number(row.brokerage ?? 0)) ||
    Number(row.brokerage ?? 0) < 0
  );
  if (hasInvalidTransactions) return { ...base, status: 'transaction-ledger-unavailable' };

  const holdingsBySymbol = new Map<string, number>();
  for (const row of holdings) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    holdingsBySymbol.set(symbol, (holdingsBySymbol.get(symbol) || 0) + Number(row.quantity));
  }

  const ledgerBySymbol = new Map<string, number>();
  const inventory = new Map<string, { quantity: number; costBasis: number }>();
  const orderedTransactions = [...transactions].sort((a, b) =>
    String(a.tradeDate || '').localeCompare(String(b.tradeDate || '')) ||
    Number(a.sourceRow || 0) - Number(b.sourceRow || 0)
  );
  let grossPurchaseCost = 0;
  let netSaleProceeds = 0;
  let realizedFromLedger = 0;
  const invalidSequenceSymbols = new Set<string>();

  for (const row of orderedTransactions) {
    const symbol = String(row.symbol).trim().toUpperCase();
    const quantity = Number(row.quantity);
    const signedQuantity = quantity * (row.transactionType === 'SELL' ? -1 : 1);
    ledgerBySymbol.set(symbol, (ledgerBySymbol.get(symbol) || 0) + signedQuantity);
    const holding = inventory.get(symbol) || { quantity: 0, costBasis: 0 };
    const brokerage = Number(row.brokerage || 0);
    if (row.transactionType === 'BUY') {
      const buyCost = Number(row.amount) + brokerage;
      grossPurchaseCost += buyCost;
      holding.quantity += quantity;
      holding.costBasis += buyCost;
    } else {
      const proceeds = Math.max(0, Number(row.amount) - brokerage);
      netSaleProceeds += proceeds;
      const tolerance = Math.max(0.00001, Math.abs(holding.quantity) * 0.0001);
      if (holding.quantity + tolerance < quantity || holding.quantity <= 0) {
        invalidSequenceSymbols.add(symbol);
      } else {
        const averageCost = holding.costBasis / holding.quantity;
        const soldCostBasis = averageCost * quantity;
        realizedFromLedger += proceeds - soldCostBasis;
        holding.quantity -= quantity;
        holding.costBasis -= soldCostBasis;
        if (holding.quantity <= tolerance) {
          holding.quantity = 0;
          holding.costBasis = 0;
        }
      }
    }
    inventory.set(symbol, holding);
  }

  const symbols = new Set([...holdingsBySymbol.keys(), ...ledgerBySymbol.keys()]);
  const quantityMismatchSymbols = [...symbols].filter(symbol => {
    const holdingQuantity = holdingsBySymbol.get(symbol) || 0;
    const ledgerQuantity = ledgerBySymbol.get(symbol) || 0;
    const tolerance = Math.max(0.00001, Math.abs(holdingQuantity) * 0.0001);
    return Math.abs(holdingQuantity - ledgerQuantity) > tolerance || invalidSequenceSymbols.has(symbol);
  }).sort();
  const ledgerOpenCostBasis = [...inventory.values()].reduce((sum, row) => sum + row.costBasis, 0);
  const derivedTransactionCount = orderedTransactions.filter(row => row.quantityDerived || row.priceDerived).length;
  const reviewTransactionCount = orderedTransactions.filter(row =>
    row.quantityDerived || row.priceDerived || row.dataQuality === 'review'
  ).length;
  const common = {
    ...base,
    grossPurchaseCost,
    netSaleProceeds,
    quantityMismatchSymbols,
    derivedTransactionCount,
    reviewTransactionCount,
    currency: currencies[0],
  };

  if (quantityMismatchSymbols.length) {
    return {
      ...common,
      status: 'quantity-mismatch',
      openCostBasis: holdingsOpenCostBasis,
      unrealizedPnl: currentValue != null && holdingsOpenCostBasis != null ? currentValue - holdingsOpenCostBasis : null,
    };
  }

  const unrealizedPnl = currentValue != null ? currentValue - ledgerOpenCostBasis : null;
  if (!allPricesAvailable || currentValue == null || unrealizedPnl == null) {
    return {
      ...common,
      status: 'quotes-incomplete',
      openCostBasis: ledgerOpenCostBasis,
      unrealizedPnl,
      realizedPnl: realizedFromLedger,
    };
  }

  const totalTradingPnl = realizedFromLedger + unrealizedPnl;
  const returnVsGrossPurchaseCostPct = grossPurchaseCost > 0
    ? totalTradingPnl / grossPurchaseCost * 100
    : null;
  return {
    ...common,
    status: reviewTransactionCount ? 'review-transactions' : 'complete',
    openCostBasis: ledgerOpenCostBasis,
    unrealizedPnl,
    realizedPnl: realizedFromLedger,
    totalTradingPnl,
    returnVsGrossPurchaseCostPct,
  };
}
