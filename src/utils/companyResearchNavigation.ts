/** View-only links. No positions, financial inputs, credentials or arbitrary return URLs. */
import {validHoldingSymbol} from './holdingDetailNavigation';
import type {ResearchStatus} from './opportunityResearch';

const statuses:readonly (ResearchStatus|'all')[]=['all','research-candidate','monitor','needs-data','excluded'];
export type OpportunityView={query:string;status:ResearchStatus|'all';limit:number};
const single=(params:URLSearchParams,key:string)=>params.getAll(key).length===1?params.get(key):null;

export function readOpportunityView(params:URLSearchParams):OpportunityView {
  const query=(single(params,'opportunity_q')||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80);
  const status=single(params,'opportunity_status'),raw=single(params,'opportunity_limit');
  const number=raw&&/^\d{2,3}$/.test(raw)?Number(raw):20;
  return {query,status:statuses.find(value=>value===status)||'all',limit:number>=20&&number<=200&&number%20===0?number:20};
}
export function opportunityViewParams(view:OpportunityView):URLSearchParams {
  const params=new URLSearchParams();
  // Normalize caller-supplied values through the same bounded reader.
  params.set('opportunity_q',view.query);params.set('opportunity_status',view.status);params.set('opportunity_limit',String(view.limit));
  const safe=readOpportunityView(params),out=new URLSearchParams();
  if(safe.query)out.set('opportunity_q',safe.query);
  if(safe.status!=='all')out.set('opportunity_status',safe.status);
  if(safe.limit!==20)out.set('opportunity_limit',String(safe.limit));
  return out;
}
export function companyResearchHref(symbol:string,view:OpportunityView):string|null {
  if(!validHoldingSymbol(symbol))return null;
  const params=opportunityViewParams(view);
  params.set('portfolio_tab','research');params.set('research_symbol',symbol);params.set('research_from','opportunities');
  return '/portfolio?'+params.toString();
}
export function opportunityReturnHref(params:URLSearchParams):string {
  const query=opportunityViewParams(readOpportunityView(params)).toString();
  return '/opportunities'+(query?'?'+query:'');
}
export function readResearchSelection(params:URLSearchParams):{symbol:string|null;invalid:boolean} {
  const key=params.has('research_symbol')?'research_symbol':'portfolio_symbol';
  if(!params.has(key))return {symbol:null,invalid:false};
  const value=single(params,key);
  return validHoldingSymbol(value)?{symbol:value,invalid:false}:{symbol:null,invalid:true};
}
