/** Invented issuer/filing declarations for offline tests only. Never actual holdings. */
import {readFileSync} from 'node:fs';
export function fictionalSecDossier(symbol='DEMO'){
  const operating=JSON.parse(readFileSync(new URL('./dossier-operating.fictional.json',import.meta.url),'utf8'));
  const statement=JSON.parse(readFileSync(new URL('../../src/data/companyStatements.fictional.json',import.meta.url),'utf8')).facts;
  const facts={cik:1,facts:{'us-gaap':{...statement.facts['us-gaap'],...operating.facts['us-gaap']},dei:statement.facts.dei??{}}};
  return {contractVersion:'sec-dossier-sources-v1',symbol,assessedAt:'2026-11-14T12:00:00Z',retrievedAt:'2026-11-14T12:00:00Z',directory:[{ticker:symbol,cik_str:1}],submissions:{cik:'0000000001',name:'Fictional Components Ltd',tickers:[symbol]},facts};
}
if(process.argv[1]===new URL(import.meta.url).pathname)process.stdout.write(JSON.stringify({ok:true,cacheStatus:'miss',packet:fictionalSecDossier(process.argv[2]??'DEMO')}));
