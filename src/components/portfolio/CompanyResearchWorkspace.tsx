import {reviewReturnHref} from '../../utils/reviewWorkspaceNavigation';
import {useEffect,useId,useState} from 'react';
import {STOCK_UNIVERSE} from '../../utils/stockUniverse';
import {validHoldingSymbol} from '../../utils/holdingDetailNavigation';
import {opportunityReturnHref,readResearchSelection} from '../../utils/companyResearchNavigation';
import type {LedgerAvailability} from '../../utils/loadedLedgerReview';
import HoldingCompanyDossier from './HoldingCompanyDossier';

type Props={onOpenReviewHref?:(href:string)=>void;holdings:readonly string[];watchlist:readonly string[];holdingsStatus:LedgerAvailability};
/** Company selection is independent of the selected position. This view has no data transport. */
export default function CompanyResearchWorkspace({holdings,watchlist,holdingsStatus,onOpenReviewHref}:Props){
  const [selection,setSelection]=useState(()=>readResearchSelection(new URLSearchParams(window.location.search)));
  const readReturn=()=>{const p=new URLSearchParams(window.location.search);return reviewReturnHref(p)??{href:opportunityReturnHref(p),label:'Return to Opportunities'};};
  const [returnLink,setReturnLink]=useState(readReturn);
  const controlId=useId();
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    // Canonicalize old company links before holding restoration can rewrite its own symbol.
    if(window.location.pathname==='/portfolio'&&params.get('portfolio_tab')==='research'&&selection.symbol&&!params.has('research_symbol')){
      params.set('research_symbol',selection.symbol);
      window.history.replaceState(window.history.state,'',window.location.pathname+'?'+params.toString()+window.location.hash);
    }
  },[selection.symbol]);
  useEffect(()=>{
    const restore=()=>{const params=new URLSearchParams(window.location.search);setSelection(readResearchSelection(params));setReturnLink(reviewReturnHref(params)??{href:opportunityReturnHref(params),label:'Return to Opportunities'});};
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[]);
  const symbols=[...new Set([...holdings.filter(validHoldingSymbol).slice(0,150),...watchlist.filter(validHoldingSymbol).slice(0,50)])].sort();
  const names=new Map(STOCK_UNIVERSE.map(company=>[company.symbol,company.name]));
  const active=selection.symbol&&symbols.includes(selection.symbol)?selection.symbol:null;
  const name=active?names.get(active):undefined;
  function choose(symbol:string){
    if(!symbols.includes(symbol))return;
    const params=new URLSearchParams(window.location.search);params.set('research_symbol',symbol);
    window.history.pushState(window.history.state,'',window.location.pathname+'?'+params.toString()+window.location.hash);
    setSelection({symbol,invalid:false});
  }
  return <section className="min-w-0 space-y-4 rounded-xl border border-white/20 p-4" data-testid="company-research-workspace" aria-label="Company research context">
    <h2 className="text-xl font-bold">{active?'Company research: '+active:'Choose a company to research'}</h2>
    <p className="text-sm text-white/75">Research selection is separate from your selected holding. Configured symbols and names do not verify an issuer, listing or financial fact.</p>
    <label className="block text-sm" htmlFor={controlId}>Research company</label>
    <select id={controlId} className="min-h-11 w-full min-w-0 rounded-lg border border-white/25 bg-[#15181e] px-3 py-2 text-sm" value={active||''} onChange={event=>choose(event.target.value)}>
      <option value="">Choose a configured company</option>
      {symbols.map(symbol=><option key={symbol} value={symbol}>{symbol}{names.get(symbol)?' · '+names.get(symbol):''}</option>)}
    </select>
    {selection.invalid?<p role="alert">The research symbol is malformed or ambiguous. No substitute company is shown.</p>:selection.symbol&&!active?<p role="alert">This research symbol is not in the available configured company context. No substitute company is shown.</p>:null}
    {active&&<>
      <p data-testid="research-position-context" className="text-sm text-amber-200">{holdingsStatus!=='ready'?'Holding membership is unavailable. This research view does not establish a position.':holdings.includes(active)?'In loaded holdings · accounting and financial evidence remain subject to their own review.':'Watchlist company · no loaded position. Returns, sizing and position actions are not inferred.'}</p>
      <HoldingCompanyDossier key={active} symbol={active} configuredName={name}/>
    </>}
    <a className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-3 py-2 text-sm text-cyan-100" href={returnLink.href} onClick={event=>{if(returnLink.label==='Return to Opportunities'||!onOpenReviewHref||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpenReviewHref(returnLink.href);}}>{returnLink.label}</a>
    <p className="text-xs text-white/60">{returnLink.label==='Return to Opportunities'?'Return links retain search, status and display limits. A lost frozen snapshot is not restored; run the loaded-data scan explicitly when needed.':'Return links retain view options. Searches, expanded explanations and loaded records stay in this app session; a reload loses loaded source records and does not fetch replacements.'}</p>
  </section>;
}
