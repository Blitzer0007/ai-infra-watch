import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export default function HoldingDetailDialog({symbol,name,onClose,onRestoreFocus,onOpened,onScrollReady,children}:{symbol:string;name?:string;onClose:()=>void;onRestoreFocus:()=>void;onOpened?:()=>void;onScrollReady?:(scrollY:number)=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);const close=useRef<HTMLButtonElement>(null);const heading=useId();const description=useId();
  const restore=useRef(onRestoreFocus);restore.current=onRestoreFocus;
  const opened=useRef(onOpened);opened.current=onOpened;
  const ready=useRef(onScrollReady);ready.current=onScrollReady;
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    const overflow=document.body.style.overflow;
    node.showModal();document.body.style.overflow='hidden';close.current?.focus({preventScroll:true});
    // Native showModal, scrollbar lock and minHeight changes settle on
    // different frames at narrow widths. The callback may change document
    // height: capture the *final* scroll position after that next paint.
    delete node.dataset.scrollReady;
    let secondFrame=0,thirdFrame=0;
    let lockY:number|null=null;
    const keepListStill=()=>{
      if(lockY!==null && node.open && window.scrollY!==lockY){
        window.scrollTo({top:lockY,behavior:'instant'});
      }
    };
    const firstFrame=requestAnimationFrame(()=>{
      secondFrame=requestAnimationFrame(()=>{
        if(!node.open)return;
        opened.current?.();
        thirdFrame=requestAnimationFrame(()=>{
          if(!node.open)return;
          lockY=window.scrollY;
          window.addEventListener('scroll',keepListStill,{passive:true});
          ready.current?.(lockY);
          node.dataset.scrollReady='true';
        });
      });
    });
    return()=>{
      cancelAnimationFrame(firstFrame);
      if(secondFrame)cancelAnimationFrame(secondFrame);
      if(thirdFrame)cancelAnimationFrame(thirdFrame);
      window.removeEventListener('scroll',keepListStill);
      lockY=null;
      delete node.dataset.scrollReady;
      node.close();
      document.body.style.overflow=overflow;
      // React StrictMode replays effect cleanup/setup during initial mount.
      // Restore the underlying list only after a real dialog close, not the
      // transient replay (which immediately re-opens this same dialog node).
      requestAnimationFrame(()=>{
        if(!node.open)restore.current();
      });
    };
  },[]);
  return createPortal(<dialog ref={dialog} aria-labelledby={heading} aria-describedby={description} data-testid="holding-detail-dialog" className="aiw-holding-dialog aiw-light-workspace" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={(event:KeyboardEvent<HTMLDialogElement>)=>{
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
      <div className="min-w-0"><h2 id={heading} className="text-xl font-semibold">{symbol} holding details</h2>{name&&<p className="mt-1 break-words text-sm text-white/75">{name}</p>}<p id={description} className="mt-1 text-sm text-white/65">Read-only review · your holdings list stays in place.</p></div>
      <button ref={close} type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-lg border border-white/30 px-3 py-2 text-sm">Back to holdings</button>
    </header>
    <div className="space-y-4 p-4">{children}</div>
  </dialog>,document.body);
}
