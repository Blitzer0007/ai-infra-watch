import {useRef,useState} from 'react';
/** Load view code only on opening; no financial/provider request is made. */
export default function HoldingCompanyDossier({symbol,configuredName}:{symbol:string;configuredName?:string;key?:string}){
  const [open,setOpen]=useState(false);
  const [View,setView]=useState<typeof import('./CompanyDossier').default|null>(null);
  const [failed,setFailed]=useState(false);
  const node=useRef<HTMLDetailsElement>(null),pending=useRef(false);
  async function loadView(){
    if(pending.current||View)return;
    pending.current=true;
    try{const loaded=await import('./CompanyDossier');if(node.current)setView(()=>loaded.default);}
    catch{if(node.current)setFailed(true);}
    finally{pending.current=false;}
  }
  return <details ref={node} className="rounded-xl border border-white/20 p-4" data-testid="holding-company-dossier" onToggle={event=>{setOpen(event.currentTarget.open);if(event.currentTarget.open&&!failed)void loadView();}}>
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Company dossier</summary>
    {open&&<div className="mt-3">{View?<View key={symbol} symbol={symbol} configuredName={configuredName} request={null}/>:failed?<p role="alert">The dossier view could not load. Your holding review remains available. Close this panel and reload the page to try again.</p>:<p role="status">Loading dossier view…</p>}</div>}
  </details>;
}
