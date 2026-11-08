/** Fictional assumptions only. Never populated from portfolio, settings, inbox or a provider. */
import type { PolicyPreviewInput } from './notificationPolicyPreview';
export const PREVIEW_CLOCK_MS = Date.parse('2026-11-09T15:00:00Z');
export const POLICY_SCENARIOS = [
  ['new-review','New qualifying review'], ['unchanged','Same condition on another poll'],
  ['accepted','Provider already accepted'], ['accepted-unreconciled','Accepted; reconciliation incomplete'],
  ['pending','Delivery claim still pending'], ['uncertain','Delivery outcome uncertain'],
  ['rejected','Existing rejected claim'], ['conflicting','Conflicting delivery evidence'],
  ['opted-out','Notifications opted out'], ['ownership','Review conflicts with ownership'],
  ['closed-session','Outside the regular session'], ['manual-run','Manual run only'],
  ['missing-ledger','Delivery history unavailable'], ['wrong-scope','Recipient scope does not match'],
  ['stale','Stale evidence'], ['simulated','Simulated market evidence'],
  ['low-priority','Lower-priority review'], ['cooldown','Recent acceptance of another episode'],
] as const;
export type PolicyScenario = typeof POLICY_SCENARIOS[number][0];

export function createPolicyScenario(scenario: PolicyScenario): PolicyPreviewInput {
  const input: PolicyPreviewInput = {
    nowMs:PREVIEW_CLOCK_MS,
    event:{symbol:'FICT',episodeRef:'episode:fictional_review_episode_0001',scopeRef:'scope:fictional_recipient_scope_01',signal:'REENTRY_CANDIDATE',previousSignal:'NOT_READY',ownership:'sold',severity:'high',observedAtMs:PREVIEW_CLOCK_MS-60000,eligibility:'eligible',thesisValid:true},
    context:{active:true,optedIn:true,releaseApproved:true,scheduledRun:true,marketSessionOpen:true,quoteInCurrentSession:true},
    ledger:{coverage:'complete',asOfMs:PREVIEW_CLOCK_MS,coverageFromMs:PREVIEW_CLOCK_MS-7*86400000,scopeRef:'scope:fictional_recipient_scope_01',symbol:'FICT',episodeRef:'episode:fictional_review_episode_0001',claim:null,lastAcceptedAtMs:null},
    proposal:{cooldownMs:0,batchLowPriority:false},
  };
  switch (scenario) {
    case 'unchanged': input.event.previousSignal=input.event.signal; break;
    case 'accepted': input.ledger.claim={status:'accepted',messageId:42}; break;
    case 'accepted-unreconciled': input.ledger.claim={status:'uncertain',messageId:42}; break;
    case 'pending': input.ledger.claim={status:'sending',messageId:null}; break;
    case 'uncertain': input.ledger.claim={status:'uncertain',messageId:null}; break;
    case 'rejected': input.ledger.claim={status:'rejected',messageId:null}; break;
    case 'conflicting': input.ledger.claim={status:'rejected',messageId:42}; break;
    case 'opted-out': input.context.optedIn=false; break;
    case 'ownership': input.event.ownership='holding'; break;
    case 'closed-session': input.context.marketSessionOpen=false; break;
    case 'manual-run': input.context.scheduledRun=false; break;
    case 'missing-ledger': input.ledger.coverage='unavailable'; break;
    case 'wrong-scope': input.ledger.scopeRef='scope:fictional_different_scope_02'; break;
    case 'stale': input.event.observedAtMs-=6*60000; break;
    case 'simulated': input.event.eligibility='simulated'; break;
    case 'low-priority': input.event.severity='medium'; break;
    case 'cooldown': input.ledger.lastAcceptedAtMs=PREVIEW_CLOCK_MS-10*60000; break;
  }
  return input;
}
