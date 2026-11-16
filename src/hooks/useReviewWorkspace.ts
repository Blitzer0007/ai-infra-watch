import {useCallback,useEffect,useState} from 'react';
import {boundedReviewQuery,readLocalReviewQuery,type ReviewWorkspace,type ReviewReadingSession} from '../utils/reviewWorkspaceNavigation';

/** Query text is local browser-entry state; records and reading context stay in App-session memory. */
export function useReviewWorkspace<T>(kind:ReviewWorkspace,read:(p:URLSearchParams)=>T,params:(view:T)=>URLSearchParams,session:ReviewReadingSession){
  const [view,setViewState]=useState(()=>read(new URLSearchParams(window.location.search)));
  const [query,setQueryState]=useState(()=>readLocalReviewQuery(window.history.state,kind)??session.query);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set<string>(session.expanded));
  const persist=useCallback((next:T,text:string,push=false)=>{
    if(window.location.pathname!=='/'+kind)return;
    const previous=window.history.state;
    const state={...(previous&&typeof previous==='object'&&!Array.isArray(previous)?previous:{}),aiwReviewQuery:{version:1,workspace:kind,query:text}};
    const href='/'+kind+'?'+params(next).toString();
    window.history[push?'pushState':'replaceState'](state,'',href);
    session.href=href;session.query=text;
  },[kind,params,session]);
  useEffect(()=>{persist(view,query);},[view,query,persist]);
  useEffect(()=>{session.expanded=expanded;},[expanded,session]);
  useEffect(()=>{
    const restore=()=>{
      if(window.location.pathname!=='/'+kind)return;
      setViewState(read(new URLSearchParams(window.location.search)));
      setQueryState(readLocalReviewQuery(window.history.state,kind)??'');
    };
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[kind,read]);
  return {view,query,expanded,
    update:(patch:Partial<T>)=>{const next=read(params({...view,...patch}));persist(next,query,true);setViewState(next);},
    clear:(patch:Partial<T>)=>{const next=read(params({...view,...patch}));persist(next,'',true);setViewState(next);setQueryState('');},
    setQuery:(text:string)=>{const safe=boundedReviewQuery(text);persist(view,safe);setQueryState(safe);},
    setExpanded:(key:string,open:boolean)=>{setExpanded(previous=>{
      if(previous.has(key)===open)return previous;
      const next=new Set<string>(previous);if(open&&next.size<100)next.add(key);else if(!open)next.delete(key);return next;
    });},
    rememberOrigin:(key:string)=>{session.focusKey=key;session.scrollY=window.scrollY;session.restore=true;},
  };
}
