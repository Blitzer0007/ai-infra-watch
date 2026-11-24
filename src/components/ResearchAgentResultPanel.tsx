import {RESEARCH_REVIEW_CODES,type ResearchRoleName} from '../utils/researchRoleReview';
import type {ResearchAgentResponse} from '../utils/researchRoleAgent';
import type {CouncilEvidence} from '../utils/portfolioCouncil';

const roles:ResearchRoleName[]=['company','catalyst','daily'];
const titles={company:'Company',catalyst:'Catalyst',daily:'Daily review'};
const human=(text:string)=>text.replaceAll('-',' ');

/** Only strict validated codes/citations; no provider prose or action controls. */
export default function ResearchAgentResultPanel({response,evidence}:{response:ResearchAgentResponse;evidence:CouncilEvidence[]}) {
  const result=response.result;
  return <section data-testid="research-agent-result" aria-label="Research agent result" className="aiw-research-roles min-w-0 rounded-xl border p-4 text-sm" aria-live="polite">
    <h3 className="font-semibold">{result.symbol} · {result.mode==='fixture'?'Simulated role workflow':'Model-selected role workflow'}</h3>
    <p className="mt-2">{result.status==='complete'?'Workflow complete':'Review stopped'} · Inputs: {human(result.input_status)}</p>
    {result.mode==='fixture'&&<p className="mt-2 text-xs text-cyan-200">Fictional model simulation · zero provider requests. This does not establish live model availability.</p>}
    <p className="mt-2 text-xs text-slate-300">Selections are not exhaustive. Source authenticity and forecast validity remain unverified. No decision eligibility, allocation change or messaging authority was granted. This review covers one symbol and snapshot.</p>
    {result.status!=='complete'&&<p role="status" className="mt-3 text-amber-200">Some roles did not return a validated selection. No automatic retry occurred.</p>}
    <div className="mt-4 divide-y divide-white/10">{roles.map(role=>{
      const item=result.roles[role];
      return <article key={role} className="py-3">
        <h4 className="font-semibold">{titles[role]}</h4>
        {!item?<p className="mt-2 text-xs text-slate-400">No validated selection returned.</p>:<>
          <p className="mt-1 text-xs text-slate-400">Inputs: {human(item.input_status)}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{item.review_codes.map(code=><li key={code}>{RESEARCH_REVIEW_CODES[code]}</li>)}</ul>
          <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-xs">Cited inputs ({item.evidence_ids.length})</summary>
            {!item.evidence_ids.length&&<p className="mt-2 text-xs text-slate-400">No numeric fact citation was selected. Review questions do not establish a complete assessment.</p>}
            <ul className="mt-2 space-y-2 text-xs">{item.evidence_ids.map(id=>{
              const row=evidence.find(e=>e.evidence_id===id)!;
              return <li key={id} className="break-words">{row.metric.replaceAll('_',' ')}: {row.value.toLocaleString(undefined,{maximumFractionDigits:8})} {row.unit}<br/>{id} · {row.source_id}</li>;
            })}</ul>
          </details>
        </>}
      </article>;
    })}</div>
    <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-xs">Run limits and trace</summary>
      <div className="mt-2 space-y-2 text-xs text-slate-400">
        <p>Model calls: {result.usage.model_calls}/6 · Loaded tools: {result.usage.tool_calls}/3 · Provider requests: {result.usage.provider_requests??'unreported'}.</p>
        <p>Stop: {human(result.termination_reason)}. This view does not report token usage or cost. The development probe measures separate trials; missing cost remains unknown.</p>
        <p className="break-words">{result.trace.map(step=>`${step.role} ${step.action}`).join(' → ')||'No tool step completed.'}</p>
        <p className="break-all">Snapshot: {result.request_sha256}</p>
      </div>
    </details>
  </section>;
}
