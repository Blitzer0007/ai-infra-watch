import type { PositionAnalysis } from './portfolioPositions';
import { evaluateDecisionEligibility, type ValidatedQuote, type DataQualityResult } from './decisionEligibility';
export type DecisionState = PositionAnalysis['state'];
export const decisionLabels: Record<DecisionState, string> = {
  'ADD REVIEW': 'Potential opportunity — review', 'HOLD / WATCH': 'Continue monitoring',
  'RISK REVIEW': 'Risk review needed', 'INSUFFICIENT DATA': 'Not enough reliable data',
};
export type EvidenceReference = { id: string; label: string; source: string; url?: string; publishedAt?: string | null; observedAt?: string | null };
export type DecisionReason = { code: string; title: string; explanation: string; direction: 'supporting' | 'risk' | 'neutral'; evidenceIds: string[] };
export type DecisionCardModel = {
  symbol: string; companyName: string; state: DecisionState; horizonMonths: { min: 2; max: 12 };
  priceUsd: number | null; positionReturnPct: number | null; reasons: DecisionReason[]; evidence: EvidenceReference[];
  missingInputs: string[]; dataQuality: DataQualityResult; nextReviewAt: string | null; reviewTrigger: string | null; generatedAt: string;
  historicalAssessment: { state: DecisionState; asOf: string | null };
  quantity: number; riskLeverage: number;
};
export type PortfolioSummary = {
  holdingsCount: number; portfolioValueUsd: number | null; valueCoverage: 'complete' | 'partial' | 'unavailable'; asOf: string | null;
  reviewCounts: { addReview: number; holdWatch: number; riskReview: number; insufficientData: number }; topConcentrationPct: number | null;
};
export function adaptDecisionCard(position: PositionAnalysis, quote: ValidatedQuote, accountingValid: boolean, nowMs: number, supportingEvidenceValidated = false, supportingQuotes: ValidatedQuote[] = []): DecisionCardModel {
  const evidenceComplete = supportingEvidenceValidated && [position.groupScore, position.groupBreadth, position.relativeToUniverse, position.vsPeers].every(x => typeof x === 'number' && Number.isFinite(x));
  const reconciled = accountingValid && Number.isFinite(position.quantity) && position.quantity > 0 && Number.isFinite(position.averageCost) && position.averageCost > 0;
  const quality = evaluateDecisionEligibility(quote, evidenceComplete, reconciled, nowMs);
  const sameObservation = position.symbol === quote.symbol && position.livePrice === quote.price;
  if (!sameObservation) {
    quality.eligibleForDecision = false;
    quality.status = 'conflicting';
    quality.reasons.push('The decision engine and quote do not refer to the same symbol and price observation.');
  }
  const state = quality.eligibleForDecision ? position.state : 'INSUFFICIENT DATA';
  const evidence: EvidenceReference[] = quote.provider && quote.marketTime ? [{ id: 'quote', label: 'Market observation', source: quote.provider, observedAt: quote.marketTime }] : [];
  if (evidenceComplete) for (const item of supportingQuotes) {
    if (evaluateDecisionEligibility(item, true, true, nowMs).eligibleForDecision) evidence.push({ id: 'support:' + item.symbol + ':' + item.provider, label: item.symbol + ' supporting observation', source: item.provider, observedAt: item.marketTime });
  }
  if (evidenceComplete) evidence.push({ id: 'metrics', label: 'Group score ' + position.groupScore + ', breadth ' + position.groupBreadth + ', relative strength ' + position.relativeToUniverse + ', peer gap ' + position.vsPeers, source: 'buildIntelligence / portfolioPositions (source quote quality checked)', observedAt: null });
  const priceQuality = evaluateDecisionEligibility(quote, true, true, nowMs);
  return { symbol: position.symbol, companyName: position.name, state, horizonMonths: { min: 2, max: 12 },
    priceUsd: priceQuality.eligibleForDecision ? quote.price : null,
    positionReturnPct: quality.eligibleForDecision && Number.isFinite(position.pnlPct) ? position.pnlPct : null,
    reasons: [{ code: 'portfolioPositions.' + position.state, title: quality.eligibleForDecision ? position.rationale : 'Assessment withheld',
      explanation: quality.eligibleForDecision ? position.strategyContext : quality.reasons.join(' '), direction: state === 'RISK REVIEW' ? 'risk' : state === 'ADD REVIEW' ? 'supporting' : 'neutral', evidenceIds: evidence.map(e => e.id) },
      { code: 'portfolioPositions.riskTrigger', title: 'Existing risk condition', explanation: position.riskTrigger, direction: 'risk', evidenceIds: [] },
      { code: 'portfolioPositions.addTrigger', title: 'Existing opportunity condition', explanation: position.addTrigger, direction: 'supporting', evidenceIds: [] }],
    evidence, missingInputs: [...quality.reasons, ...(!evidenceComplete ? ['Group score, breadth, relative strength and peer comparison are required.'] : [])], dataQuality: quality,
    nextReviewAt: null, reviewTrigger: quality.eligibleForDecision ? position.riskTrigger : 'Refresh and reconcile missing inputs before reassessment.', generatedAt: new Date(nowMs).toISOString(),
    historicalAssessment: { state: position.state, asOf: sameObservation ? quote.marketTime : null }, quantity: position.quantity, riskLeverage: position.riskLeverage ?? (position.symbol === 'SOXL' ? 3 : 1) };
}
export function summarizeDecisionCards(cards: DecisionCardModel[]): PortfolioSummary {
  const valued = cards.filter(p => p.priceUsd != null && Number.isFinite(p.priceUsd) && p.priceUsd > 0 && Number.isFinite(p.quantity) && p.quantity > 0 && Number.isFinite(p.priceUsd * p.quantity));
  const complete = cards.length > 0 && valued.length === cards.length;
  const values = valued.map(p => p.priceUsd! * p.quantity);
  const total = values.reduce((a, b) => a + b, 0);
  const times = valued.map(p => p.dataQuality.marketTime).filter((x): x is string => !!x && Number.isFinite(Date.parse(x))).sort((a,b) => Date.parse(a) - Date.parse(b));
  return { holdingsCount: cards.length, portfolioValueUsd: complete && Number.isFinite(total) ? total : null,
    valueCoverage: complete ? 'complete' : valued.length ? 'partial' : 'unavailable',
    // Oldest observation is the conservative common snapshot boundary.
    asOf: complete && times.length === cards.length ? new Date(times[0]).toISOString() : null,
    reviewCounts: { addReview: cards.filter(p => p.state === 'ADD REVIEW').length, holdWatch: cards.filter(p => p.state === 'HOLD / WATCH').length,
      riskReview: cards.filter(p => p.state === 'RISK REVIEW').length, insufficientData: cards.filter(p => p.state === 'INSUFFICIENT DATA').length },
    topConcentrationPct: complete && Number.isFinite(total) && total > 0 ? values.sort((a,b) => b-a).slice(0,3).reduce((a,b) => a+b,0) / total * 100 : null };
}
