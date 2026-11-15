/** Optional Cloud development transport. No general-agent or production proxy. */
import handler from '../api/agent-ask.js';
import {requireAccess} from '../api/_access-auth.js';
import {SOURCE_QUALITY_MAX_BYTES,sourceQualityDevelopmentEnabled} from './services/sourceQualityInput.js';
import {councilDevelopmentEnabled,COUNCIL_MAX_BYTES} from '../shared/portfolioCouncilContract.js';

export function developmentSourceQualityMiddleware() {
  return async(req,res,next)=>{
    const url=new URL(req.url||'/','http://127.0.0.1');
    if(url.pathname!=='/api/agent-ask'||!url.searchParams.has('task'))return next();
    const reply={setHeader:(key,value)=>res.setHeader(key,value),status(code){res.statusCode=code;return reply;},json(body){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return reply;}};
    reply.setHeader('Cache-Control','no-store');
    const input={method:req.method,headers:req.headers,query:Object.fromEntries(url.searchParams),body:undefined};
    if(!requireAccess(input,reply))return;
    const council=input.query.task==='council';
    if(!(council?councilDevelopmentEnabled():sourceQualityDevelopmentEnabled()))return reply.status(404).json({error:'Development review unavailable'});
    if(!['source-quality','council'].includes(input.query.task)||req.method!=='POST')return handler(input,reply);
    if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply.status(415).json({error:'JSON required'});
    try{
      if(req.body!==undefined)input.body=req.body;
      else{
        const chunks=[];let size=0;
        for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>(council?COUNCIL_MAX_BYTES:SOURCE_QUALITY_MAX_BYTES)){req.resume?.();return reply.status(413).json({error:'Request too large'});}chunks.push(bytes);}
        const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));input.body=JSON.parse(raw);
        if(council&&JSON.stringify(input.body)!==raw)throw Error();
      }
    }catch{return reply.status(400).json({error:'Invalid development review request'});}
    try{return await handler(input,reply);}catch{return reply.status(503).json({error:'Development review unavailable'});}
  };
}
