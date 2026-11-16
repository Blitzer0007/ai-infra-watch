import type { DecisionReason, EvidenceReference } from './decisionCardAdapter';
import type { ResearchSnapshot } from './researchSnapshot';
import { evaluateResearchEligibility } from './researchEligibility';

export type ResearchStatus = 'research-candidate' | 'monitor' | 'needs-data' | 'excluded';
export type ResearchCandidate = {
  symbol:string; companyName:string; status:ResearchStatus; horizonMonths:{min:2;max:12}; snapshotId:string; asOf:string|null;
  ruleVersion:string; supportingReasons:DecisionReason[]; conflictingReasons:DecisionReason[]; evidence:EvidenceReference[]; missingInputs:string[];
  dataEligibility:'eligible'|'insufficient'|'conflicting'; signalEligibility:'experimental';
  portfolioContext:'holding'|'watchlist-only'; accounting:'unverified'|'not-applicable'; nextReviewCondition:string;
};
export const RESEARCH_RULE_VERSION = 'reported-growth-cash-flow-v1-experimental';

/** Descriptive research only. No I/O, state updates, scoring model or trade eligibility. */
export function scanResearchSnapshot(snapshot:ResearchSnapshot, nowMs:number):ResearchCandidate[] {
  if (snapshot.schemaVersion !== 1 || !Number.isFinite(nowMs) || !Number.isFinite(Date.parse(snapshot.capturedAt)) || Date.parse(snapshot.capturedAt) > nowMs) throw new Error('Invalid snapshot clock or schema.');
  return snapshot.entries.map(entry => {
    const quality = evaluateResearchEligibility(entry,nowMs);
    const excluded = quality.classificationVerified && (entry.assetClass === 'fund' || entry.assetClass === 'leveraged-etf' || entry.listingCountry !== 'US');
    const usable = quality.eligible && !snapshot.simulated;
    const positive = usable && quality.financials.every(row => row.value! > 0);
    const evidence:EvidenceReference[] = [];
    if (entry.quote.provider && entry.quote.marketTime) evidence.push({id:'quote:'+entry.symbol,label:'Market observation',source:entry.quote.provider,observedAt:entry.quote.marketTime});
    if (quality.eligible && entry.companyEvidence) evidence.push(entry.companyEvidence);
    quality.financials.forEach(row => evidence.push({id:row.id,label:row.metric+' = '+row.value+' '+row.unit+' · '+row.periodStart+' to '+row.periodEnd,source:row.provider,url:row.sourceUrl,publishedAt:row.publishedAt,observedAt:row.periodEnd}));
    const supportingReasons:DecisionReason[] = [], conflictingReasons:DecisionReason[] = [];
    if (usable) quality.financials.forEach(row => {
      const reason:DecisionReason = {code:RESEARCH_RULE_VERSION+':'+row.metric,title:row.value! > 0 ? 'Positive reported '+row.metric : 'Reported '+row.metric+' is not positive',
        explanation:'Reported value '+row.value+' '+row.unit+' for '+row.periodStart+' to '+row.periodEnd+'. This is descriptive research, not a forecast.',
        direction:row.value! > 0 ? 'supporting' : 'risk',evidenceIds:[row.id]};
      (row.value! > 0 ? supportingReasons : conflictingReasons).push(reason);
    });
    return {symbol:entry.symbol,companyName:entry.companyName,status:excluded ? 'excluded' : !usable ? 'needs-data' : positive ? 'research-candidate' : 'monitor',
      horizonMonths:{min:2,max:12},snapshotId:snapshot.id,asOf:quality.quoteQuality.eligible ? entry.quote.marketTime : null,
      ruleVersion:RESEARCH_RULE_VERSION,supportingReasons,conflictingReasons,evidence,
      missingInputs:[...quality.missingInputs,...(snapshot.simulated ? ['Simulated snapshots cannot enable research classifications.'] : []),...(excluded ? ['US operating-company research rules do not apply to this verified asset type or listing.'] : [])],
      dataEligibility:quality.conflicting ? 'conflicting' : usable && !excluded ? 'eligible' : 'insufficient',signalEligibility:'experimental',portfolioContext:entry.portfolioContext,accounting:entry.accounting,
      nextReviewCondition:!usable ? 'Obtain compatible, dated and validated observations before reviewing this research case.' : 'Review the next reported results and conflicting evidence; this family has no validated return advantage.'};
  });
}
