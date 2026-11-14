import type { ResearchCandidate } from './opportunityResearch';
import { RESEARCH_RULE_VERSION } from './opportunityResearch';
import { validCalendarInstant } from './catalystCalendar';

export function opportunityJevState(candidate: ResearchCandidate) {
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(candidate.symbol) || candidate.status==='excluded' || !['eligible','insufficient','conflicting'].includes(candidate.dataEligibility)) throw new Error('Unsupported review input');
  // Coverage summary only: no holdings, costs, quantities, thesis, notes, URLs, raw text or credentials.
  return {schemaVersion:1,symbol:candidate.symbol,ruleVersion:RESEARCH_RULE_VERSION,
    dataEligibility:candidate.dataEligibility,status:candidate.status,
    asOf:validCalendarInstant(candidate.asOf)?candidate.asOf:null,
    missingInputCount:Math.min(100,candidate.missingInputs.length),
    evidenceReferenceCount:Math.min(100,candidate.evidence.length),
    supportingReasonCount:Math.min(100,candidate.supportingReasons.length),
    adverseReasonCount:Math.min(100,candidate.conflictingReasons.length)};
}
export type OpportunityJevState = ReturnType<typeof opportunityJevState>;
export type OpportunityJevReview = {nextCheck:'gather_evidence'|'resolve_conflicts'|'inspect_sources'|'monitor';context:'insufficient'|'conflicting'|'bounded_review';inputTokens:number|null;latencyMs:number|null;model:string|null};
export function normalizeOpportunityJevReview(value:unknown,state:OpportunityJevState):OpportunityJevReview {
  const body=value as any;
  if (!body||body.ok!==true||body.enabled!==true||body.fallback!==false||body.kind!=='opportunities') throw new Error('JEV unavailable');
  const next=body.answers?.next_check, context=body.answers?.context;
  if (next?.type!=='choice'||!['gather_evidence','resolve_conflicts','inspect_sources','monitor'].includes(next.choice)||context?.type!=='choice'||!['insufficient','conflicting','bounded_review'].includes(context.choice)) throw new Error('Invalid JEV answers');
  return {nextCheck:state.dataEligibility==='conflicting'?'resolve_conflicts':state.dataEligibility!=='eligible'&&next.choice==='monitor'?'gather_evidence':next.choice,context:state.dataEligibility==='conflicting'?'conflicting':state.dataEligibility!=='eligible'||state.evidenceReferenceCount===0?'insufficient':context.choice,
    inputTokens:Number.isSafeInteger(body.input_tokens)&&body.input_tokens>=0?body.input_tokens:null,
    latencyMs:typeof body.latency_ms==='number'&&Number.isFinite(body.latency_ms)&&body.latency_ms>=0?body.latency_ms:null,
    model:typeof body.model==='string'&&/^[a-zA-Z0-9._-]{1,64}$/.test(body.model)?body.model:null};
}
