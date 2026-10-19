export type ReentryQuote = {
  price: number;
  sma20: number | null;
  sma50: number | null;
  drawdownFrom52WeekHighPct: number | null;
  retrievedAt?: string;
};

export type OwnershipStatus = 'holding' | 'sold';
export type ReentryStatus =
  | 'HOLDING'
  | 'EXIT_REVIEW'
  | 'NOT_READY'
  | 'WATCH_ENTRY'
  | 'REENTRY_CANDIDATE'
  | 'EVIDENCE_REVIEW_REQUIRED'
  | 'INSUFFICIENT_DATA';

export type ReentryInput = {
  targetPrice: number;
  thesis: string;
  quote: ReentryQuote | null;
  ownershipStatus?: OwnershipStatus;
  plannedExitPrice?: number | null;
  upperReviewPrice?: number | null;
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
    return {
      status: 'INSUFFICIENT_DATA',
      reasons: ['A fresh quote and a valid lower re-entry target are required.'],
      targetReached: false,
      trendConfirmed: false,
    };
  }

  const targetReached = quote.price <= targetPrice;
  const trendConfirmed = Number.isFinite(quote.sma20)
    && Number.isFinite(quote.sma50)
    && Number(quote.sma20) > 0
    && Number(quote.sma50) > 0
    && quote.price >= Number(quote.sma20)
    && Number(quote.sma20) >= Number(quote.sma50);

  if ((input.ownershipStatus || 'sold') === 'holding') {
    const exitPrice = Number(input.plannedExitPrice || 0);
    if (exitPrice > 0 && quote.price >= exitPrice) {
      return {
        status: 'EXIT_REVIEW',
        reasons: [
          `Price reached your planned exit-review level of $${exitPrice.toFixed(2)}.`,
          'This is a review alert, not an automatic sell. Check valuation, position size, taxes, earnings timing, and the updated thesis.',
        ],
        targetReached,
        trendConfirmed,
      };
    }
    return {
      status: 'HOLDING',
      reasons: [
        exitPrice > 0
          ? `Still holding. Planned exit review starts at $${exitPrice.toFixed(2)}.`
          : 'Still holding. Set a planned exit-review price to receive a threshold reminder.',
      ],
      targetReached,
      trendConfirmed,
    };
  }

  if (input.thesisInvalidated) {
    return {
      status: 'NOT_READY',
      reasons: ['The saved investment thesis is marked invalidated; a lower price is not a buy signal.'],
      targetReached,
      trendConfirmed,
    };
  }

  const upperReview = Number(input.upperReviewPrice || 0);
  if (upperReview > 0 && quote.price >= upperReview && thesis.trim()) {
    return {
      status: 'EVIDENCE_REVIEW_REQUIRED',
      reasons: [
        `Price is at or above your upper evidence-review level of $${upperReview.toFixed(2)}.`,
        'Consolidate fresh company evidence, valuation, analyst target dispersion, and dated institutional filings before considering re-entry.',
        'An upward move is not itself a buy signal; any action remains manual.',
      ],
      targetReached,
      trendConfirmed,
    };
  }

  if (targetReached && trendConfirmed && thesis.trim()) {
    return {
      status: 'REENTRY_CANDIDATE',
      reasons: [
        'Price is at or below your saved lower re-entry target.',
        'Price is above the 20-day average and the 20-day average is above the 50-day average.',
        'Review fresh valuation, earnings, analyst consensus, dated institutional disclosures, and portfolio risk before acting.',
      ],
      targetReached,
      trendConfirmed,
    };
  }

  if (targetReached) {
    const reasons = ['Lower re-entry price reached, but this alone is not enough to consider a purchase.'];
    if (!trendConfirmed) reasons.push('Trend confirmation is missing; wait for stabilization or reassess your rules.');
    if (!thesis.trim()) reasons.push('No investment thesis is saved.');
    return { status: 'WATCH_ENTRY', reasons, targetReached, trendConfirmed };
  }

  return {
    status: 'NOT_READY',
    reasons: ['Price remains above the lower re-entry target and below the upper evidence-review threshold.'],
    targetReached,
    trendConfirmed,
  };
}
