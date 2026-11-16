import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export default function HoldingDetailDialog({symbol,name,onClose,onRestoreFocus,children}:{symbol:string;name?:string;onClose:()=>void;onRestoreFocus:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);const close=useRef<HTMLButtonElement>(null);const heading=useId();
  const restore=useRef(onRestoreFocus);restore.current=onRestoreFocus;
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    const overflow=document.body.style.overflow;
    node.showModal();document.body.style.overflow='hidden';close.current?.focus({preventScroll:true});
    return()=>{node.close();document.body.style.overflow=overflow;restore.current();};
  },[]);
  return createPortal(<dialog ref={dialog} aria-labelledby={heading} data-testid="holding-detail-dialog" className="aiw-holding-dialog" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={(event:KeyboardEvent<HTMLDialogElement>)=>{
    if(event.key!=='Tab')return;
    const root:HTMLDialogElement|null=dialog.current;if(!root)return;
    const controls=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]')).filter(node=>{
      if(node.tabIndex<0||!node.getClientRects().length||getComputedStyle(node).visibility==='hidden')return false;
      for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement){
        if(parent.tagName==='DETAILS'&&!(parent as HTMLDetailsElement).open&&!parent.querySelector(':scope > summary')?.contains(node))return false;
      }
      return true;
    });
    if(!controls.length)return;
    const index=controls.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();
  }}>
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/20 bg-[#15181e] p-4">
      <div className="min-w-0"><h2 id={heading} className="text-xl font-semibold">{symbol} holding details</h2>{name&&<p className="mt-1 break-words text-sm text-white/75">{name}</p>}<p className="mt-1 text-sm text-white/65">Read-only review · your holdings list stays in place.</p></div>
      <button ref={close} type="button" onClick={onClose} className="shrink-0 rounded-lg border border-white/30 px-3 py-2 text-sm">Back to holdings</button>
    </header>
    <div className="space-y-4 p-4">{children}</div>
  </dialog>,document.body);
}
