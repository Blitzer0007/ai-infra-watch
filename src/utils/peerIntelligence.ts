import type { PricePoint } from './intelligence';
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
  const configured = holding.peers
    .map(symbol => STOCK_UNIVERSE.find(item => item.symbol === symbol))
    .filter((item): item is StockUniverseEntry => Boolean(item));

  if (!configured.length) return null;

  const scored = configured.map((candidate, index) => {
    const sameGroup = candidate.group === holding.group;
    const themeMatches = themeOverlap(candidate.theme, holding.theme);
    const freshQuote = prices[candidate.symbol]?.stale !== true && Number.isFinite(prices[candidate.symbol]?.price);
    const sameGeo = candidate.geo === holding.geo;
    const score =
      100 - index * 8 +
      (sameGroup ? 28 : 0) +
      themeMatches * 8 +
      (sameGeo ? 5 : 0) +
      (freshQuote ? 3 : 0);

    const reasons = [
      index === 0 ? 'Configured direct peer' : 'Configured peer',
      sameGroup ? 'Same group' : null,
      themeMatches ? 'Overlapping theme' : null,
      sameGeo ? 'Same geographic lens' : null,
      freshQuote ? 'Fresh peer quote available' : null,
    ].filter((value): value is string => Boolean(value));

    return {
      symbol: candidate.symbol,
      name: candidate.name,
      score,
      reasons,
      configuredRank: index + 1,
      sameGroup,
      sameTheme: themeMatches > 0,
      freshQuote,
    };
  });

  return scored.sort((a, b) => b.score - a.score || a.configuredRank - b.configuredRank)[0] ?? null;
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
}): PeerCounterfactual {
  const { holding, peer, peerHistory, peerCurrentPrice, actualCurrentPrice } = input;
  if (!peer) {
    return {
      peer: null, purchaseDate: holding.purchaseDate ?? null, peerEntryDate: null, peerEntryPrice: null,
      peerCurrentPrice, hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, status: 'peer-unavailable',
    };
  }

  const purchaseDate = holding.purchaseDate ?? null;
  if (!purchaseDate || !peerHistory.length) {
    return {
      peer, purchaseDate, peerEntryDate: null, peerEntryPrice: null, peerCurrentPrice,
      hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, status: purchaseDate ? 'history-unavailable' : 'entry-unavailable',
    };
  }

  const ordered = peerHistory
    .filter(row => row && typeof row.date === 'string' && Number.isFinite(row.price) && row.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const entry = ordered.find(row => row.date >= purchaseDate) ?? ordered.at(-1);
  if (!entry || peerCurrentPrice == null || !Number.isFinite(peerCurrentPrice) || peerCurrentPrice <= 0) {
    return {
      peer, purchaseDate, peerEntryDate: entry?.date ?? null, peerEntryPrice: entry?.price ?? null,
      peerCurrentPrice, hypotheticalShares: null, hypotheticalValue: null, hypotheticalProfit: null,
      hypotheticalReturnPct: null, actualProfit: null, actualReturnPct: null, difference: null,
      differencePctPoints: null, status: entry ? 'entry-unavailable' : 'history-unavailable',
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
    difference: null,
    differencePctPoints: null,
    status: 'available',
  };
}
