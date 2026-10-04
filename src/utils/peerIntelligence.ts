import type { PricePoint } from './intelligence';
import type { PortfolioTransaction } from './portfolioApi';
import { STOCK_UNIVERSE, type StockUniverseEntry } from './stockUniverse';

export type PeerCandidate = {
  symbol: string;
  name: string;
  score: number;
  reasons: string[];
  configuredRank: number;
  sameGroup: boolean;
  sameTheme: boolean;
  freshQuote: boolean;
};

export type PeerTier = 'primary' | 'core' | 'extended';

export type DynamicPeerCandidate = PeerCandidate & {
  tier: PeerTier;
  dimensions: {
    configuredRelationship: boolean;
    industryGroup: boolean;
    endMarketTheme: boolean;
    geography: boolean;
    freshQuote: boolean;
    size: 'available' | 'unavailable';
    growth: 'available' | 'unavailable';
    margins: 'available' | 'unavailable';
    capitalIntensity: 'available' | 'unavailable';
    analystCoverage: 'available' | 'unavailable';
  };
};

export function selectDynamicPeers(
  holding: StockUniverseEntry,
  prices: Record<string, PricePoint> = {},
): { primary: DynamicPeerCandidate | null; core: DynamicPeerCandidate[]; extended: DynamicPeerCandidate[] } {
  const candidates = STOCK_UNIVERSE
    .filter(candidate => candidate.symbol !== holding.symbol)
    .map(candidate => {
      const sameGroup = candidate.group === holding.group;
      const themeMatches = themeOverlap(candidate.theme, holding.theme);
      const sameGeo = candidate.geo === holding.geo;
      const configuredRelationship = holding.peers.includes(candidate.symbol) || candidate.peers.includes(holding.symbol);
      const freshQuote = prices[candidate.symbol]?.stale !== true && Number.isFinite(prices[candidate.symbol]?.price);
      const score =
        (configuredRelationship ? 30 : 0) +
        (sameGroup ? 28 : 0) +
        Math.min(themeMatches, 3) * 8 +
        (sameGeo ? 8 : 0) +
        (freshQuote ? 4 : 0);
      const reasons = [
        configuredRelationship ? 'Configured direct peer' : null,
        sameGroup ? 'Same group' : null,
        themeMatches ? 'Overlapping end-market/theme' : null,
        sameGeo ? 'Same geographic lens' : null,
        freshQuote ? 'Fresh peer quote available' : null,
      ].filter((value): value is string => Boolean(value));
      return {
        symbol: candidate.symbol,
        name: candidate.name,
        score,
        reasons: reasons.length ? reasons : ['Universe comparability baseline'],
        configuredRank: holding.peers.indexOf(candidate.symbol) >= 0 ? holding.peers.indexOf(candidate.symbol) + 1 : Number.MAX_SAFE_INTEGER,
        sameGroup,
        sameTheme: themeMatches > 0,
        freshQuote,
        tier: 'extended' as PeerTier,
        dimensions: {
          configuredRelationship,
          industryGroup: sameGroup,
          endMarketTheme: themeMatches > 0,
          geography: sameGeo,
          freshQuote,
          size: 'unavailable',
          growth: 'unavailable',
          margins: 'unavailable',
          capitalIntensity: 'unavailable',
          analystCoverage: 'unavailable',
        } satisfies DynamicPeerCandidate['dimensions'],
      };
    })
    .sort((a, b) => b.score - a.score || a.configuredRank - b.configuredRank || a.symbol.localeCompare(b.symbol));

  return {
    primary: candidates[0] ? { ...candidates[0], tier: 'primary' } : null,
    core: candidates.slice(1, 6).map(candidate => ({ ...candidate, tier: 'core' })),
    extended: candidates.slice(6, 16).map(candidate => ({ ...candidate, tier: 'extended' })),
  };
}

export type PeerCounterfactual = {
  peer: PeerCandidate | null;
  purchaseDate: string | null;
  peerEntryDate: string | null;
  peerEntryPrice: number | null;
  peerCurrentPrice: number | null;
  hypotheticalShares: number | null;
  hypotheticalValue: number | null;
  hypotheticalProfit: number | null;
  hypotheticalReturnPct: number | null;
  actualProfit: number | null;
  actualReturnPct: number | null;
  difference: number | null;
  differencePctPoints: number | null;
  basis: 'broker-transactions' | 'single-entry';
  status: 'available' | 'history-unavailable' | 'entry-unavailable' | 'peer-unavailable';
};

function normalizeTheme(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3);
}

function themeOverlap(a: string, b: string) {
  const left = new Set(normalizeTheme(a));
  return normalizeTheme(b).filter(token => left.has(token)).length;
}

/**
 * Selects a comparable peer from the configured universe.
 * This is a transparent comparability heuristic, not an investment ranking.
 */
export function selectMostRelevantPeer(
  holding: StockUniverseEntry,
  prices: Record<string, PricePoint> = {},
): PeerCandidate | null {
  return selectDynamicPeers(holding, prices).primary;
}

export function calculatePeerCounterfactual(input: {
  holding: {
    symbol: string;
    quantity: number;
    investedValue: number;
    averageCost: number;
    purchaseDate?: string | null;
  };
  peer: PeerCandidate | null;
  peerHistory: Array<{ date: string; price: number }>;
  peerCurrentPrice: number | null;
  actualCurrentPrice: number | null;
  transactions?: PortfolioTransaction[];
}): PeerCounterfactual {
  const { holding, peer, peerHistory, peerCurrentPrice, actualCurrentPrice, transactions = [] } = input;
  if (!peer) {
    return {
      peer: null, purchaseDate: holding.purchaseDate ?? null, peerEntryDate: null, peerEntryPrice: null,
      peerCurrentPrice, hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, basis: transactions.length ? 'broker-transactions' : 'single-entry', status: 'peer-unavailable',
    };
  }

  const purchaseDate = holding.purchaseDate ?? null;
  if (!purchaseDate || !peerHistory.length) {
    return {
      peer, purchaseDate, peerEntryDate: null, peerEntryPrice: null, peerCurrentPrice,
      hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, basis: transactions.length ? 'broker-transactions' : 'single-entry',
      status: purchaseDate ? 'history-unavailable' : 'entry-unavailable',
    };
  }

  const ordered = peerHistory
    .filter(row => row && typeof row.date === 'string' && Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const relevantTransactions = transactions
    .filter(row => row.symbol.toUpperCase() === holding.symbol.toUpperCase() && row.tradeDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.sourceRow - b.sourceRow);

  const peerPriceAt = (date: string) => ordered.find(row => row.date >= date) ?? ordered.at(-1) ?? null;
  const firstTransaction = relevantTransactions[0];
  const entryDate = firstTransaction?.tradeDate || purchaseDate;
  const entry = peerPriceAt(entryDate);

  if (!entry || peerCurrentPrice == null || !Number.isFinite(peerCurrentPrice) || peerCurrentPrice <= 0) {
    return {
      peer, purchaseDate, peerEntryDate: entry?.date ?? null, peerEntryPrice: entry?.price ?? null, peerCurrentPrice,
      hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, basis: relevantTransactions.length ? 'broker-transactions' : 'single-entry',
      status: entry ? 'entry-unavailable' : 'history-unavailable',
    };
  }

  if (relevantTransactions.length) {
    let peerShares = 0;
    let grossBuys = 0;
    let grossSales = 0;

    for (const transaction of relevantTransactions) {
      const amount = Number(transaction.amount);
      if (!(amount > 0)) continue;
      const peerPoint = peerPriceAt(transaction.tradeDate);
      if (!peerPoint || !(peerPoint.price > 0)) continue;

      if (transaction.transactionType === 'BUY') {
        peerShares += amount / peerPoint.price;
        grossBuys += amount;
      } else {
        const desiredSaleShares = amount / peerPoint.price;
        const saleShares = Math.min(peerShares, desiredSaleShares);
        peerShares -= saleShares;
        grossSales += saleShares * peerPoint.price;
      }
    }

    const netInvested = grossBuys - grossSales;
    const hypotheticalValue = peerShares * peerCurrentPrice;
    const hypotheticalProfit = hypotheticalValue - netInvested;
    const hypotheticalReturnPct = netInvested ? (hypotheticalProfit / netInvested) * 100 : null;

    const actualValue = actualCurrentPrice != null && Number.isFinite(actualCurrentPrice)
      ? actualCurrentPrice * holding.quantity
      : null;
    const actualProfit = actualValue != null ? actualValue - netInvested : null;
    const actualReturnPct = actualProfit != null && netInvested ? (actualProfit / netInvested) * 100 : null;
    const difference = actualProfit != null ? hypotheticalProfit - actualProfit : null;
    const differencePctPoints = actualReturnPct != null && hypotheticalReturnPct != null
      ? hypotheticalReturnPct - actualReturnPct
      : null;

    return {
      peer,
      purchaseDate,
      peerEntryDate: entry.date,
      peerEntryPrice: entry.price,
      peerCurrentPrice,
      hypotheticalShares: peerShares,
      hypotheticalValue,
      hypotheticalProfit,
      hypotheticalReturnPct,
      actualProfit,
      actualReturnPct,
      difference,
      differencePctPoints,
      basis: 'broker-transactions',
      status: 'available',
    };
  }

  const hypotheticalShares = holding.investedValue / entry.price;
  const hypotheticalValue = hypotheticalShares * peerCurrentPrice;
  const hypotheticalProfit = hypotheticalValue - holding.investedValue;
  const hypotheticalReturnPct = holding.investedValue ? (hypotheticalProfit / holding.investedValue) * 100 : null;
  const actualProfit = actualCurrentPrice != null && Number.isFinite(actualCurrentPrice)
    ? actualCurrentPrice * holding.quantity - holding.investedValue
    : null;
  const actualReturnPct = actualProfit != null && holding.investedValue
    ? (actualProfit / holding.investedValue) * 100
    : null;
  const difference = actualProfit != null ? hypotheticalProfit - actualProfit : null;
  const differencePctPoints = actualReturnPct != null && hypotheticalReturnPct != null
    ? hypotheticalReturnPct - actualReturnPct
    : null;

  return {
    peer,
    purchaseDate,
    peerEntryDate: entry.date,
    peerEntryPrice: entry.price,
    peerCurrentPrice,
    hypotheticalShares,
    hypotheticalValue,
    hypotheticalProfit,
    hypotheticalReturnPct,
    actualProfit,
    actualReturnPct,
    difference,
    differencePctPoints,
    basis: 'single-entry',
    status: 'available',
  };
}