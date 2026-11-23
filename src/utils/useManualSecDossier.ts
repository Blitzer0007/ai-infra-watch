import {useEffect,useRef,useState} from 'react';
import {authFetch} from './apiAuth';
import {admitSecDossierPayload,secDossierFailureMessage,SEC_DOSSIER_RESPONSE_LIMIT,SecDossierLoadError,type SecDossierConnection} from './secDossierConnection';

/** No mount-time I/O. Scope changes abort and discard the previous issuer's state. */
export function useManualSecDossier(symbol:string){
  const [loaded,setLoaded]=useState<SecDossierConnection|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[attempts,setAttempts]=useState(0);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{setLoaded(null);setError('');setAttempts(0);setLoading(false);return()=>{active.current?.abort();active.current=null;};},[symbol]);
  async function loadFinancials(){
    if(active.current||attempts>=3||loaded?.symbol===symbol)return;
    const controller=new AbortController();active.current=controller;setLoading(true);setError('');setAttempts(value=>value+1);
    try{
      const response=await authFetch('/api/company-scale?action=dossier&symbol='+encodeURIComponent(symbol),{signal:controller.signal,cache:'no-store'});
      if(response.status===401||response.status===403)throw new SecDossierLoadError('Private access expired or is unavailable. Sign in again before loading SEC inputs.');
      const text=await response.text();if(text.length>SEC_DOSSIER_RESPONSE_LIMIT)throw new SecDossierLoadError('The response exceeded supported limits. Financial inputs were withheld.');
      let value;try{value=JSON.parse(text);}catch{throw new SecDossierLoadError('The financial response had an unsupported format.');}
      if(!response.ok)throw new SecDossierLoadError(secDossierFailureMessage(value?.code));
      const admitted=admitSecDossierPayload(symbol,value);if(!admitted)throw new SecDossierLoadError('The SEC source packet failed issuer or input checks. Financial inputs were withheld.');
      if(active.current===controller)setLoaded(admitted);
    }catch(failure){if(!controller.signal.aborted&&active.current===controller)setError(failure instanceof SecDossierLoadError?failure.message:'Financial acquisition was interrupted or unavailable. No automatic retry will run.');}
    finally{if(active.current===controller){active.current=null;setLoading(false);}}
  }
  return {loaded:loaded?.symbol===symbol?loaded:null,loading,error,attempts,loadFinancials};
}
