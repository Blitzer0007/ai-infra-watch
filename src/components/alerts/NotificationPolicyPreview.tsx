import { useState } from 'react';
import { previewNotificationPolicy, type PreviewDisposition } from '../../utils/notificationPolicyPreview';
import { createPolicyScenario, POLICY_SCENARIOS, type PolicyScenario } from '../../utils/notificationPolicyScenarios';
import { FilterSelect } from '../FilterControls';

const dispositionLabels: Record<PreviewDisposition,string> = {
  blocked:'Proposal withheld',suppressed:'Would suppress this episode',deferred:'Would defer this review',
  reconcile:'Reconciliation needed', 'propose-immediate':'Would propose an immediate review', 'propose-digest':'Would propose a digest item',
};

export default function NotificationPolicyPreview() {
  const [scenario,setScenario]=useState<PolicyScenario>('new-review');
  const [cooldownMinutes,setCooldownMinutes]=useState(0);
  const [batch,setBatch]=useState(false);
  const input=createPolicyScenario(scenario);
  input.proposal={cooldownMs:cooldownMinutes*60000,batchLowPriority:batch};
  const result=previewNotificationPolicy(input);
  const issues=result.checks.filter(check=>check.state!=='pass');

  return <section aria-label="Fictional notification policy preview" data-testid="notification-policy-preview" className="space-y-4 pt-4 text-sm">
    <h2 className="text-lg font-semibold">Notification policy preview</h2>
    <p className="text-amber-100">Fictional scenarios only. These assumptions are not your current settings, market data, or delivery history. Nothing here sends, schedules, retries, or saves a notification.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <FilterSelect label="Fictional scenario" value={scenario} onChange={event=>setScenario(event.target.value as PolicyScenario)}>{POLICY_SCENARIOS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</FilterSelect>
      <FilterSelect label="Proposed cooldown" value={cooldownMinutes} onChange={event=>setCooldownMinutes(Number(event.target.value))}><option value={0}>No additional cooldown</option><option value={60}>1 hour</option><option value={1440}>24 hours</option></FilterSelect>
    </div>
    <label className="flex items-start gap-3"><input type="checkbox" checked={batch} onChange={event=>setBatch(event.target.checked)} className="mt-1"/><span>Propose digest batching for info and medium priority only. No digest time or recipient is selected.</span></label>
    <div role="status" aria-live="polite" aria-atomic="true" className="space-y-3 rounded-xl border border-cyan-200/30 p-4">
      <h3 className="text-lg font-semibold" data-testid="policy-disposition">{dispositionLabels[result.disposition]}</h3>
      <p>{result.intendedChannel?'Proposed channel: Telegram. This is not permission to send.':'No delivery is proposed.'} No action was taken.</p>
      <p>Condition: {result.changedCondition}. {result.cooldownRemainingMs===null?'Cooldown not evaluated.':`Proposed cooldown remaining: ${Math.ceil(result.cooldownRemainingMs/60000)} minutes.`}</p>
      {result.reconciliationRequired&&<p className="text-amber-100">Resolve the existing evidence first. Do not automatically retry or replace this episode.</p>}
      {issues.length>0?<ul className="list-disc space-y-2 pl-5">{issues.map(check=><li key={check.code}>{check.explanation}</li>)}</ul>:<p>The supplied scenario passes the proposal checks. A real sender would still require its own authorization, fresh evidence and atomic durable claim.</p>}
    </div>
    <details><summary className="cursor-pointer font-semibold">Scenario assumptions and full decision trace</summary><div className="mt-3 space-y-3 text-white/80">
      <p>FICT is fictional. The clock is fixed at 9 November 2026, 15:00 UTC. Session and evidence gates are supplied assumptions; this tool does not verify a holiday calendar or fetch a quote.</p>
      <p>Review: {input.event.signal}; previous condition: {input.event.previousSignal}; ownership: {input.event.ownership}; priority: {input.event.severity}. Evidence: {input.event.eligibility}.</p>
      <p>Monitoring: {String(input.context.active)}; opt-in: {String(input.context.optedIn)}; release approved: {String(input.context.releaseApproved)}; scheduled authorization: {String(input.context.scheduledRun)}; regular session: {String(input.context.marketSessionOpen)}; current-session quote: {String(input.context.quoteInCurrentSession)}.</p>
      <p>Scoped coverage: {input.ledger.coverage}; claim: {input.ledger.claim?.status||'none'}; message reference present: {input.ledger.claim?.messageId?'yes':'no'}. Episode references are supplied and must remain stable across repeated polls.</p>
      <ol className="list-decimal space-y-2 pl-5">{result.checks.map(check=><li key={check.code}><span className="font-semibold">{check.state}: </span>{check.explanation}</li>)}</ol>
      <p className="break-words">Preview contract: {result.version}. Proposed freshness: five minutes. The optional cooldown and digest rule are draft proposals, not live settings. No exactly-once guarantee is implied.</p>
    </div></details>
  </section>;
}
