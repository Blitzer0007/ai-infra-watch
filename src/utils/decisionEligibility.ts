import * as shared from '../../shared/decisionEligibility.js';
export type DataQualityStatus = 'valid' | 'delayed' | 'last_close' | 'stale' | 'missing' | 'conflicting' | 'simulated' | 'invalid';
export type ValidatedQuote = {
  symbol: string; price: number | null; currency: string | null; provider: string;
  marketTime: string | null; retrievedAt: string | null; isMarketSessionOpen: boolean | null;
  status: DataQualityStatus; fallbackUsed: boolean;
  adjustedBasis?: 'raw' | 'split_adjusted' | 'total_return';
};
export type DataQualityResult = {
  eligibleForDecision: boolean; status: DataQualityStatus; checkedAt: string; reasons: string[];
  sourceCount: number; marketTime: string | null; retrievedAt: string | null; source?: string | null;
};
export function evaluateQuoteQuality(quote:ValidatedQuote,nowMs:number) {
  return shared.evaluateQuoteQuality(quote,nowMs) as {eligible:boolean;status:DataQualityStatus;checkedAt:string;reasons:string[];sourceCount:number;marketTime:string|null;retrievedAt:string|null;source:string|null};
}
export function evaluateDecisionEligibility(quote:ValidatedQuote,requiredEvidenceComplete:boolean,accountingValid:boolean,nowMs=Date.now()):DataQualityResult {
  return shared.evaluateDecisionEligibility(quote,requiredEvidenceComplete,accountingValid,nowMs) as DataQualityResult;
}
export function normalizeDecisionQuote(symbol:string,input:Record<string,any>|undefined):ValidatedQuote {
  return shared.normalizeDecisionQuote(symbol,input) as ValidatedQuote;
}
