export type ReentryQuote = {
  price: number;
  sma20: number | null;
  sma50: number | null;
  drawdownFrom52WeekHighPct: number | null;
  retrievedAt?: string;
};
export type ReentryStatus = 'NOT_READY' | 'WATCH_ENTRY' | 'REENTRY_CANDIDATE' | 'INSUFFICIENT_DATA';
export type ReentryInput = {
  targetPrice: number;
  thesis: string;
  quote: ReentryQuote | null;
  thesisInvalidated?: boolean;
};
export type ReentryAssessment = {
  status: ReentryStatus;
  reasons: string[];
  targetReached: boolean;
  trendConfirmed: boolean;
};
export function assessReentry(input: ReentryInput): ReentryAssessment {
  const { targetPrice, thesis, quote } = input;
  if (!quote || !Number.isFinite(quote.price) || !(targetPrice > 0)) {
    return { status: 'INSUFFICIENT_DATA', reasons: ['A fresh quote and a valid target entry price are required.'], targetReached: false, trendConfirmed: false };
  }
  const targetReached = quote.price <= targetPrice;
  const trendConfirmed = Number.isFinite(quote.sma20) && Number.isFinite(quote.sma50) && Number(quote.sma20) > 0 && Number(quote.sma50) > 0 && Number(quote.price) >= Number(quote.sma20) && Number(quote.sma20) >= Number(quote.sma50);
  if (input.thesisInvalidated) {
    return { status: 'NOT_READY', reasons: ['The saved investment thesis is marked invalidated; do not treat a lower price as a buy signal.'], targetReached, trendConfirmed };
  }
  if (targetReached && trendConfirmed && thesis.trim()) {
    return { status: 'REENTRY_CANDIDATE', reasons: ['Price is at or below your saved entry target.', 'Price is above the 20-day average and the 20-day average is above the 50-day average.', 'A saved thesis exists; review fresh fundamental evidence and portfolio sizing before acting.'], targetReached, trendConfirmed };
  }
  if (targetReached) {
    const reasons = ['Price has reached your target zone.'];
    if (!trendConfirmed) reasons.push('Trend confirmation is missing; wait for stabilization or reassess your rules.');
    if (!thesis.trim()) reasons.push('No investment thesis is saved. A price target alone is not enough.');
    return { status: 'WATCH_ENTRY', reasons, targetReached, trendConfirmed };
  }
  return { status: 'NOT_READY', reasons: ['Price is above your saved entry target.'], targetReached, trendConfirmed };
}
