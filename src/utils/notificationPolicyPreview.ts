/** Pure proposal evaluator. Never a delivery authorization or replacement for a durable claim. */
import { deliveryEvidence } from '../../shared/alertDeliveryEvidence.js';

export const NOTIFICATION_PREVIEW_VERSION = 'reentry-policy-preview-v1';
export type ReviewSignal = 'EXIT_REVIEW' | 'WATCH_ENTRY' | 'REENTRY_CANDIDATE' | 'EVIDENCE_REVIEW_REQUIRED';
type Signal = ReviewSignal | 'HOLDING' | 'NOT_READY' | 'INSUFFICIENT_DATA';
type EvidenceFlag = boolean | null;
export type PolicyPreviewInput = {
  nowMs: number;
  event: {
    symbol: string;
    episodeRef: string | null;
    scopeRef: string | null;
    signal: ReviewSignal;
    previousSignal: Signal | null;
    ownership: 'holding' | 'sold' | null;
    severity: 'info' | 'medium' | 'high' | 'critical';
    observedAtMs: number;
    eligibility: 'eligible' | 'insufficient' | 'simulated' | 'conflicting';
    thesisValid: EvidenceFlag;
  };
  context: {
    active: EvidenceFlag;
    optedIn: EvidenceFlag;
    releaseApproved: EvidenceFlag;
    scheduledRun: EvidenceFlag;
    marketSessionOpen: EvidenceFlag;
    quoteInCurrentSession: EvidenceFlag;
  };
  ledger: {
    coverage: 'complete' | 'unavailable';
    asOfMs: number;
    coverageFromMs: number;
    scopeRef: string | null;
    symbol: string | null;
    episodeRef: string | null;
    claim: {status: 'accepted' | 'rejected' | 'sending' | 'uncertain' | 'unknown'; messageId: number | null} | null;
    lastAcceptedAtMs: number | null;
  };
  proposal: {cooldownMs: number; batchLowPriority: boolean};
};
export type PreviewDisposition = 'blocked' | 'suppressed' | 'deferred' | 'reconcile' | 'propose-immediate' | 'propose-digest';
export type PreviewCheck = {code: string; state: 'pass' | 'block' | 'suppress' | 'defer' | 'review'; explanation: string};
export type PolicyPreview = {
  version: string;
  previewOnly: true;
  action: 'none';
  disposition: PreviewDisposition;
  changedCondition: 'changed' | 'unchanged' | 'unknown';
  episodeRef: string | null;
  intendedChannel: 'telegram' | null;
  cooldownRemainingMs: number | null;
  reconciliationRequired: boolean;
  checks: PreviewCheck[];
};
const reviewSignals: readonly string[] = ['EXIT_REVIEW','WATCH_ENTRY','REENTRY_CANDIDATE','EVIDENCE_REVIEW_REQUIRED'];
const allSignals = [...reviewSignals,'HOLDING','NOT_READY','INSUFFICIENT_DATA'];
const flag = (value: unknown) => value === true || value === false || value === null;
const instant = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
const reference = (value: unknown, prefix: string) => typeof value === 'string' && new RegExp('^'+prefix+':[A-Za-z0-9_-]{20,100}$').test(value);

export function previewNotificationPolicy(input: PolicyPreviewInput): PolicyPreview {
  const result: PolicyPreview = {version:NOTIFICATION_PREVIEW_VERSION,previewOnly:true,action:'none',disposition:'blocked',changedCondition:'unknown',episodeRef:null,intendedChannel:null,cooldownRemainingMs:null,reconciliationRequired:false,checks:[]};
  const check = (code: string, state: PreviewCheck['state'], explanation: string) => result.checks.push({code,state,explanation});
  const e=input?.event, c=input?.context, l=input?.ledger, p=input?.proposal;
  // Runtime validation also protects callers which have not passed through TypeScript.
  if (!input || !instant(input.nowMs) || !e || !c || !l || !p ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test(e.symbol) || !reviewSignals.includes(e.signal) ||
      !(e.previousSignal===null || allSignals.includes(e.previousSignal)) ||
      !['holding','sold',null].includes(e.ownership) || !['info','medium','high','critical'].includes(e.severity) ||
      !instant(e.observedAtMs) || !['eligible','insufficient','simulated','conflicting'].includes(e.eligibility) || !flag(e.thesisValid) ||
      ![c.active,c.optedIn,c.releaseApproved,c.scheduledRun,c.marketSessionOpen,c.quoteInCurrentSession].every(flag) ||
      !['complete','unavailable'].includes(l.coverage) ||
      !instant(l.asOfMs) || !instant(l.coverageFromMs) ||
      !(l.lastAcceptedAtMs===null || instant(l.lastAcceptedAtMs)) ||
      !(l.claim===null || (l.claim && ['accepted','rejected','sending','uncertain','unknown'].includes(l.claim.status) &&
        (l.claim.messageId===null || (Number.isSafeInteger(l.claim.messageId)&&l.claim.messageId>0)))) ||
      !Number.isSafeInteger(p.cooldownMs) || p.cooldownMs<0 || p.cooldownMs>7*86400000 || typeof p.batchLowPriority!=='boolean') {
    check('invalid-input','block','Required preview inputs are missing or malformed. No delivery proposal is available.');
    return result;
  }
  result.changedCondition=e.previousSignal===null?'unknown':e.previousSignal===e.signal?'unchanged':'changed';
  const scoped=reference(e.scopeRef,'scope') && reference(e.episodeRef,'episode') && l.scopeRef===e.scopeRef && l.episodeRef===e.episodeRef && l.symbol===e.symbol;
  if (!scoped) {
    check('scope-or-episode-unverified','block','A matching recipient scope, symbol and stable episode reference are required. They cannot be guessed from a symbol or date.');
    return result;
  }
  result.episodeRef=e.episodeRef;
  if (l.claim) {
    const evidence=deliveryEvidence({status:l.claim.status,telegram_message_id:l.claim.messageId});
    result.reconciliationRequired=evidence.reconciliationRequired;
    if (evidence.deliveryState==='accepted') {
      check('already-accepted','suppress',evidence.explanation);
      result.disposition='suppressed'; return result;
    }
    if (evidence.deliveryState==='rejected') {
      check('existing-rejected-claim','suppress','This episode already has a rejected durable claim. No automatic retry or new episode is proposed.');
      result.disposition='suppressed'; return result;
    }
    check('existing-claim-needs-review','review',evidence.explanation);
    result.reconciliationRequired=true; result.disposition='reconcile'; return result;
  }
  if (l.coverage!=='complete' || l.asOfMs>input.nowMs || input.nowMs-l.asOfMs>60000 || l.coverageFromMs>l.asOfMs || l.coverageFromMs>input.nowMs-p.cooldownMs) {
    check('ledger-unavailable','review','Current scoped episode and full proposed cooldown coverage is unavailable. Missing records are not proof of no prior delivery.');
    result.reconciliationRequired=true; result.disposition='reconcile'; return result;
  }
  check('no-existing-claim','pass','The supplied scoped snapshot contains no claim for this episode. A real sender would still need an atomic durable claim.');
  if (e.observedAtMs>input.nowMs || input.nowMs-e.observedAtMs>5*60000 || e.eligibility!=='eligible') {
    check('evidence-ineligible','block','Current, non-simulated, non-conflicting eligible evidence is required; the proposed preview freshness limit is five minutes.');
  } else check('evidence-eligible','pass','The scenario supplies eligible evidence within the proposed five-minute freshness window.');
  const ownsSignal=e.ownership==='holding'?e.signal==='EXIT_REVIEW':e.ownership==='sold'&&e.signal!=='EXIT_REVIEW';
  check('ownership',ownsSignal?'pass':'block',ownsSignal?'The review type matches the supplied ownership state.':'Ownership is missing or incompatible with this review type.');
  if (e.ownership==='sold' && e.thesisValid!==true) check('thesis-not-valid',e.thesisValid===false?'suppress':'block','A sold-position review needs an explicitly valid thesis.');
  for (const [code,value,label] of [['monitoring',c.active,'Monitoring'],['opt-in',c.optedIn,'Notification opt-in'],['release-approval',c.releaseApproved,'Release approval']] as const) {
    check(code,value===true?'pass':value===false?'suppress':'block',label+(value===true?' is present in this scenario.':value===false?' is disabled in this scenario.':' is unknown.'));
  }
  check('condition-transition',result.changedCondition==='changed'?'pass':result.changedCondition==='unchanged'?'suppress':'block',result.changedCondition==='changed'?'A changed qualifying condition is supplied. Repeated polling must reuse this episode reference.':result.changedCondition==='unchanged'?'The qualifying condition is unchanged; no repeated alert is proposed.':'The previous condition is unknown; no transition is inferred.');
  for (const [code,value,label] of [['scheduled-run',c.scheduledRun,'Scheduled-run authorization'],['market-session',c.marketSessionOpen,'Regular market-session bounds'],['quote-session',c.quoteInCurrentSession,'Current-session quote evidence']] as const) {
    check(code,value===true?'pass':value===false?'defer':'block',label+(value===true?' is present in this scenario.':value===false?' is absent; retain the pending condition and episode.':' is unknown.'));
  }
  if (l.lastAcceptedAtMs!==null && l.lastAcceptedAtMs>input.nowMs) check('invalid-cooldown-time','block','The supplied previous acceptance is in the future.');
  else {
    result.cooldownRemainingMs=l.lastAcceptedAtMs===null?0:Math.max(0,p.cooldownMs-(input.nowMs-l.lastAcceptedAtMs));
    check('cooldown',result.cooldownRemainingMs>0?'defer':'pass',result.cooldownRemainingMs>0?'The proposed cooldown has not elapsed. It does not clear claims or rotate episodes.':'No proposed cooldown remains. This does not clear an existing episode claim.');
  }
  const states=result.checks.map(item=>item.state);
  result.disposition=states.includes('block')?'blocked':states.includes('suppress')?'suppressed':states.includes('defer')?'deferred':p.batchLowPriority&&['info','medium'].includes(e.severity)?'propose-digest':'propose-immediate';
  if (result.disposition.startsWith('propose-')) result.intendedChannel='telegram';
  return result;
}
