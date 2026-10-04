import { authFetch, authHeaders } from './apiAuth';

export type StoredPortfolioHolding = {
  id: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  purchaseDate: string | null;
  notes: string;
  decisionThesis?: string;
  lossLimitPct?: number | null;
  exitRuleType?: string | null;
  exitRuleValue?: number | null;
  exitRuleText?: string;
  practicalNotes?: string;
  brokerAlertPrices?: number[];
  targetAllocationPct?: number | null;
  maxAllocationPct?: number | null;
  createdAt?: string;
  updatedAt?: string;
  purchaseLots?: PortfolioPurchaseLot[];
};

export type PortfolioTransaction = {
  id: string;
  symbol: string;
  transactionType: 'BUY' | 'SELL';
  orderType?: string | null;
  tradeDate: string;
  orderPlacedAt?: string | null;
  orderExecutedAt?: string | null;
  quantity: number;
  price: number | null;
  amount: number;
  brokerage: number | null;
  source: string;
  sourceRow: number;
  quantityDerived?: boolean;
  priceDerived?: boolean;
  createdAt?: string;
};

export type PortfolioPurchaseLot = {
  id: string;
  holdingId: string;
  symbol: string;
  purchaseDate: string | null;
  investedAmount: number;
  executionPrice: number;
  quantity: number;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchPortfolioTransactions(): Promise<PortfolioTransaction[]> {
  const response = await authFetch('/api/portfolio?includeTransactions=true', { cache: 'no-store' });
  if (!response.ok) throw new Error('Transaction history service unavailable');
  const data = await response.json();
  if (!Array.isArray(data?.transactions)) throw new Error('Transaction history service returned invalid transactions');
  return data.transactions;
}

export async function fetchPortfolioPurchaseLots(holdingId: string): Promise<PortfolioPurchaseLot[]> {
  const response = await authFetch('/api/portfolio?holdingId=' + encodeURIComponent(holdingId), { cache: 'no-store' });
  if (!response.ok) throw new Error('Purchase history service unavailable');
  const data = await response.json();
  if (!Array.isArray(data?.lots)) throw new Error('Purchase history service returned invalid lots');
  return data.lots;
}

export async function addPortfolioPurchase(input: {
  holdingId: string;
  investedAmount: number;
  executionPrice: number;
  purchaseDate?: string | null;
  notes?: string;
  targetAllocationPct?: number | null;
  maxAllocationPct?: number | null;
}) {
  const response = await authFetch('/api/portfolio', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'purchase', ...input }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Unable to save purchase');
  return {
    lot: data.lot as PortfolioPurchaseLot,
    holding: data.holding as StoredPortfolioHolding,
  };
}

export async function fetchPortfolioHoldings(): Promise<StoredPortfolioHolding[]> {
  const response = await authFetch('/api/portfolio?includeLots=true', { cache: 'no-store' });
  if (!response.ok) throw new Error('Portfolio service unavailable');
  const data = await response.json();
  if (!Array.isArray(data?.holdings)) throw new Error('Portfolio service returned invalid holdings');
  return data.holdings;
}

export async function createPortfolioHolding(input: {
  symbol: string;
  quantity: number;
  averageCost: number;
  purchaseDate?: string | null;
  notes?: string;
}) {
  const response = await authFetch('/api/portfolio', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Unable to save holding');
  return { ...data.holding, purchaseLots: data.lot ? [data.lot as PortfolioPurchaseLot] : [] } as StoredPortfolioHolding;
}

export async function updatePortfolioHolding(input: StoredPortfolioHolding) {
  const response = await authFetch('/api/portfolio', {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Unable to update holding');
  return data.holding as StoredPortfolioHolding;
}

export async function deletePortfolioHolding(id: string) {
  const response = await authFetch('/api/portfolio?id=' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || 'Unable to delete holding');
  }
}
