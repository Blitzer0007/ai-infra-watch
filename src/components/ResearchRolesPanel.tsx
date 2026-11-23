import {useRef,useState} from 'react';
import {RESEARCH_REVIEW_CODES,type ResearchRoleName,type ResearchRoleReview} from '../utils/researchRoleReview';
import type {CouncilEvidence} from '../utils/portfolioCouncil';

const roles:ResearchRoleName[]=['company','catalyst','daily'];
const titles={company:'Company',catalyst:'Catalyst',daily:'Daily review'};
const descriptions={company:'Financial and risk observations that passed conditional input checks.',
  catalyst:'Event timing and confirmation for this symbol.',daily:'A checklist for this symbol and frozen snapshot; this is not a portfolio or whole-day assessment.'};
const human=(value:string)=>value.replaceAll('_',' ').replaceAll('-',' ');

/** Deterministic baseline views, not autonomous model output. No effects or I/O. */
export default function ResearchRolesPanel({review,evidence}:{review:ResearchRoleReview;evidence:CouncilEvidence[];key?:string}) {
  const [active,setActive]=useState<ResearchRoleName>('company');
  const tabs=useRef<Array<HTMLButtonElement|null>>([]);
  const item=review.roles[active];
  function navigate(event:{key:string;preventDefault:()=>void},index:number) {
    const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
    if(next!==null){event.preventDefault();setActive(roles[next]);tabs.current[next]?.focus();}
  }
  return <section data-testid="research-role-review" aria-label="Research role review" className="aiw-research-roles min-w-0 rounded-xl border p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{review.symbol} · Research role review</h3>
      <span className="text-xs text-cyan-200">Deterministic baseline · no model calls</span>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-300">Company, Catalyst and Daily Review share the validated frozen inputs. These are read-only review questions and cited observations. Source authenticity remains unverified; no decision eligibility was granted.</p>
    <div role="tablist" aria-label="Research roles" className="mt-4 flex flex-wrap gap-2">
      {roles.map((role,index)=><button key={role} ref={node=>{tabs.current[index]=node;}} role="tab" id={'research-role-tab-'+role}
        aria-selected={active===role} aria-controls="research-role-panel" tabIndex={active===role?0:-1}
        onClick={()=>setActive(role)} onKeyDown={event=>navigate(event,index)}
        className={'rounded-lg border px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 '+(active===role?'border-cyan-200 bg-cyan-300/10 text-cyan-100':'border-white/20 text-slate-300')}>
        {titles[role]}
      </button>)}
    </div>
    <div role="tabpanel" tabIndex={0} id="research-role-panel" aria-labelledby={'research-role-tab-'+active} className="mt-4 min-w-0 space-y-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
      <p className="font-medium">{titles[active]} · {item.status==='conditional'?'Conditional inputs':'Needs data'}</p>
      <p className="text-xs text-slate-300">{descriptions[active]}</p>
      <ul className="list-disc space-y-2 pl-5 text-sm">{item.review_codes.map(code=><li key={code}>{RESEARCH_REVIEW_CODES[code]}</li>)}</ul>
      <details key={active} className="rounded-lg border p-3">
        <summary className="cursor-pointer text-xs">Cited observations ({item.evidence_ids.length})</summary>
        {!item.evidence_ids.length&&<p className="mt-2 text-xs text-slate-400">No conditionally usable observations for this role. Missing coverage is not a clean review.</p>}
        <dl className="mt-2 space-y-3 text-xs">{item.evidence_ids.map(id=>{
          const row=evidence.find(value=>value.evidence_id===id)!;
          return <div key={id} className="break-words"><dt className="font-medium">{human(row.metric)}</dt>
            <dd>{row.value.toLocaleString(undefined,{maximumFractionDigits:8})} {row.unit} · {row.source_id}</dd>
            <dd className="text-slate-400">{id} · Period: {row.period_start||'not declared'} to {row.period_end||'not declared'}</dd>
          </div>;
        })}</dl>
      </details>
    </div>
    <p className="mt-4 break-words text-xs text-slate-400">Frozen at {review.assessed_at} · {review.horizon_months}-month context. Role views make no additional provider requests, save no notes and send no alerts.</p>
  </section>;
}
