import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewNotificationPolicy, type PolicyPreviewInput, type PreviewDisposition } from './notificationPolicyPreview';
import { createPolicyScenario, POLICY_SCENARIOS, PREVIEW_CLOCK_MS } from './notificationPolicyScenarios';

const outcomes: PreviewDisposition[] = ['propose-immediate','suppressed','suppressed','suppressed','reconcile','reconcile','suppressed','reconcile','suppressed','blocked','deferred','deferred','reconcile','blocked','blocked','blocked','propose-immediate','propose-immediate'];
for (const [[scenario],index] of POLICY_SCENARIOS.map((row,index)=>[row,index] as const)) {
  test(`policy scenario: ${scenario}`,()=>{
    const result=previewNotificationPolicy(createPolicyScenario(scenario));
    assert.equal(result.disposition,outcomes[index]);
    assert.equal(result.action,'none');assert.equal(result.previewOnly,true);
    assert.equal(result.intendedChannel,result.disposition.startsWith('propose-')?'telegram':null);
  });
}

test('policy is deterministic, never mutates frozen inputs, and ignores private extra fields',()=>{
  const freeze=(value:any)=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const input=freeze({...createPolicyScenario('new-review'),token:'fixture-private',chat_id:'fixture-destination',rawBody:'fixture-private'});
  const result=previewNotificationPolicy(input);
  assert.deepEqual(result,previewNotificationPolicy(input));assert.doesNotMatch(JSON.stringify(result),/fixture-private|fixture-destination|chat_id|token|rawBody/);
});
test('accepted message evidence survives unavailable aggregate coverage and prevents any new proposal',()=>{
  const input=createPolicyScenario('accepted-unreconciled');input.ledger.coverage='unavailable';input.context.optedIn=false;
  const result=previewNotificationPolicy(input);assert.equal(result.disposition,'suppressed');assert.equal(result.reconciliationRequired,true);
  assert.match(result.checks[0].explanation,/Do not resend/);
});
test('accepted without a valid message reference needs reconciliation; conflicts never become acceptance',()=>{
  for(const [status,messageId] of [['accepted',null],['sending',42],['rejected',42],['unknown',42]] as const){
    const input=createPolicyScenario('new-review');input.ledger.claim={status,messageId};
    const result=previewNotificationPolicy(input);assert.equal(result.disposition,'reconcile');assert.equal(result.reconciliationRequired,true);
  }
});
test('every existing durable claim blocks new attempts even when cooldown has elapsed or transition changes',()=>{
  for(const status of ['accepted','rejected','sending','uncertain','unknown'] as const){
    const input=createPolicyScenario('cooldown');input.nowMs+=86400000;input.ledger.claim={status,messageId:status==='accepted'?42:null};
    const result=previewNotificationPolicy(input);assert.ok(!result.disposition.startsWith('propose-'));assert.equal(result.intendedChannel,null);
  }
});
test('scope, symbol and stable episode must match; no matching by timestamp or ticker alone',()=>{
  for(const field of ['scopeRef','symbol','episodeRef'] as const){
    const input=createPolicyScenario('new-review');input.ledger[field]=null;
    assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  }
  const input=createPolicyScenario('accepted');input.event.episodeRef='episode:fictional_new_episode_0002';
  assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  input.ledger.episodeRef=input.event.episodeRef;input.ledger.claim=null;
  assert.equal(previewNotificationPolicy(input).disposition,'propose-immediate');
});
test('unknown permissions, ownership and session evidence fail closed',()=>{
  for(const key of Object.keys(createPolicyScenario('new-review').context) as (keyof PolicyPreviewInput['context'])[]){
    const input=createPolicyScenario('new-review');input.context[key]=null;assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  }
  for(const key of ['ownership','previousSignal','thesisValid'] as const){const input=createPolicyScenario('new-review');Object.assign(input.event,{[key]:null});assert.equal(previewNotificationPolicy(input).disposition,'blocked');}
});
test('ownership restricts exit versus sold-position reviews and invalidated thesis suppresses re-entry',()=>{
  const input=createPolicyScenario('new-review');input.event.signal='EXIT_REVIEW';
  assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  input.event.ownership='holding';input.event.thesisValid=false;
  assert.equal(previewNotificationPolicy(input).disposition,'propose-immediate');
  input.event.ownership='sold';input.event.signal='WATCH_ENTRY';
  assert.equal(previewNotificationPolicy(input).disposition,'suppressed');
  input.event.thesisValid=true;input.event.signal='EVIDENCE_REVIEW_REQUIRED';
  assert.equal(previewNotificationPolicy(input).disposition,'propose-immediate');
});
test('cooldown is scoped to prior acceptance, bounded, and never rotates the episode',()=>{
  const input=createPolicyScenario('cooldown');const episode=input.event.episodeRef;input.proposal.cooldownMs=3600000;
  let result=previewNotificationPolicy(input);assert.equal(result.disposition,'deferred');assert.equal(result.cooldownRemainingMs,50*60000);assert.equal(result.episodeRef,episode);
  input.nowMs=PREVIEW_CLOCK_MS+50*60000;input.event.observedAtMs=input.nowMs;input.ledger.asOfMs=input.nowMs;
  result=previewNotificationPolicy(input);assert.equal(result.cooldownRemainingMs,0);assert.equal(result.disposition,'propose-immediate');assert.equal(result.episodeRef,episode);
  input.ledger.lastAcceptedAtMs=input.nowMs+1;assert.equal(previewNotificationPolicy(input).disposition,'blocked');
});
test('optional digest batching never promotes high priority or overrides gates',()=>{
  for(const severity of ['info','medium','high','critical'] as const){
    const input=createPolicyScenario('low-priority');input.event.severity=severity;input.proposal.batchLowPriority=true;
    assert.equal(previewNotificationPolicy(input).disposition,['info','medium'].includes(severity)?'propose-digest':'propose-immediate');
    input.context.optedIn=false;assert.equal(previewNotificationPolicy(input).disposition,'suppressed');
  }
});
test('stale or incomplete cooldown-window coverage cannot be treated as an empty ledger',()=>{
  const input=createPolicyScenario('new-review');input.proposal.cooldownMs=3600000;input.ledger.coverageFromMs=input.nowMs-60000;
  assert.equal(previewNotificationPolicy(input).disposition,'reconcile');
  input.ledger.coverageFromMs=input.nowMs-3600000;input.ledger.asOfMs=input.nowMs-60001;
  assert.equal(previewNotificationPolicy(input).disposition,'reconcile');
  input.ledger.asOfMs=input.nowMs+1;assert.equal(previewNotificationPolicy(input).disposition,'reconcile');
  input.ledger.asOfMs=input.nowMs;assert.equal(previewNotificationPolicy(input).disposition,'propose-immediate');
});
test('future, stale, simulated, conflicting and insufficient evidence cannot produce proposals',()=>{
  const input=createPolicyScenario('new-review');input.event.observedAtMs=input.nowMs+1;
  assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  input.event.observedAtMs=input.nowMs-300000;assert.equal(previewNotificationPolicy(input).disposition,'propose-immediate');
  input.event.observedAtMs--;assert.equal(previewNotificationPolicy(input).disposition,'blocked');
  input.event.observedAtMs=input.nowMs;
  for(const eligibility of ['simulated','conflicting','insufficient'] as const){input.event.eligibility=eligibility;assert.equal(previewNotificationPolicy(input).disposition,'blocked');}
});
test('malformed runtime inputs return fixed blocked output without exposing their contents',()=>{
  const base=createPolicyScenario('new-review');
  const cases=[null,{}, {...base,nowMs:NaN}, {...base,event:{...base.event,severity:'unsupported'}}, {...base,context:{...base.context,optedIn:'true'}},
    {...base,proposal:{cooldownMs:-1,batchLowPriority:false}}, {...base,proposal:{cooldownMs:8*86400000,batchLowPriority:false}},
    {...base,ledger:{...base.ledger,claim:{status:'accepted',messageId:Number.MAX_SAFE_INTEGER+1}}},
    {...base,event:{...base.event,scopeRef:'fixture-private-recipient',episodeRef:'fixture-private'}}];
  for(const input of cases){const result=previewNotificationPolicy(input as PolicyPreviewInput);assert.equal(result.disposition,'blocked');assert.equal(result.intendedChannel,null);assert.doesNotMatch(JSON.stringify(result),/fixture-private/);}
});
test('preview modules do not import a transport, sender, auth, storage, clock or server handler',()=>{
  for(const path of ['./notificationPolicyPreview.ts','./notificationPolicyScenarios.ts','../components/alerts/NotificationPolicyPreview.tsx']){
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(fetch|authFetch|setInterval|setTimeout|localStorage|sessionStorage)\s*[.(]|Date\.now\(|process\.env|server\/api|alertEngine|apiAuth/);
  }
});
