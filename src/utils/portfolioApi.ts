export type StoredPortfolioHolding = {
  id: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  purchaseDate: string | null;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchPortfolioHoldings(): Promise<StoredPortfolioHolding[]> {
  const response = await fetch('/api/portfolio', { cache: 'no-store' });
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
  const response = await fetch('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Unable to save holding');
  return data.holding as StoredPortfolioHolding;
}

export async function updatePortfolioHolding(input: StoredPortfolioHolding) {
  const response = await fetch('/api/portfolio', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Unable to update holding');
  return data.holding as StoredPortfolioHolding;
}

export async function deletePortfolioHolding(id: string) {
  const response = await fetch('/api/portfolio?id=' + encodeURIComponent(id), {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || 'Unable to delete holding');
  }
}
