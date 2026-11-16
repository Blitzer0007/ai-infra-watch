import {councilDevelopmentEnabled,councilPayload,councilEnvelope,councilJevEnvelope,COUNCIL_MAX_BYTES} from '../../shared/portfolioCouncilContract.js';
import {councilAdmissionPayload,councilAdmissionEnvelope,councilV2Envelope,councilRequestDigest} from '../../shared/councilAdmission.js';
export async function councilDevelopmentProxy(req,res,token) {
  res.setHeader('Cache-Control','no-store');
  if(!councilDevelopmentEnabled())return res.status(404).json({error:'Council development unavailable'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST required'});}
  const v2=['admission-v2','loaded-v2'].includes(req.body?.mode);
  const payload=v2?councilAdmissionPayload(req.body):councilPayload(req.body);
  if(!payload||Buffer.byteLength(JSON.stringify(payload))>COUNCIL_MAX_BYTES)return res.status(400).json({error:'Invalid council request'});
  let target;
  try{target=new URL(String(process.env.AI_INFRA_AGENT_URL||''));if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!token)throw Error();}
  catch{return res.status(503).json({error:'Council development unavailable'});}
  try{
    const response=await fetch(new URL('/api/agent-python?task=council',target),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000),redirect:'error'});
    if(!response.ok)return res.status(response.status===429?429:503).json({error:'Council review unavailable'});
    const reader=response.body?.getReader();if(!reader)throw Error();let raw='';let size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel();throw Error();}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
    const result=JSON.parse(raw);
    const valid=v2?(payload.mode==='admission-v2'?councilAdmissionEnvelope(result,payload,await councilRequestDigest(payload)):councilV2Envelope(result,payload,await councilRequestDigest(payload))):payload.mode==='jev'?councilJevEnvelope(result,payload):councilEnvelope(result,payload);
    if(!valid)throw Error();return res.status(200).json(result);
  }catch{return res.status(503).json({error:'Council review unavailable'});}
}
