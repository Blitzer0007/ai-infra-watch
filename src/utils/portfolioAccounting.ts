import { calculatePortfolioTradingPerformance as calculateShared } from '../../shared/portfolioAccounting.js';
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
  tradeDate?: string;
  sourceRow?: number;
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
  | 'mixed-currency'
  | 'unsupported-currency';

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
  reviewTransactionCount?: number;
  currency: string | null;
};

/** Typed compatibility adapter; calculations live in the shared pure module. */
export function calculatePortfolioTradingPerformance(holdings:PortfolioAccountingHolding[],transactions:PortfolioAccountingTransaction[],quoteCoverageComplete:boolean):PortfolioTradingPerformance {
  return calculateShared(holdings,transactions,quoteCoverageComplete) as PortfolioTradingPerformance;
}
