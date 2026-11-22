import {requireAccess} from '../../api/_access-auth.js';
import {createSecDossierLoader} from '../services/secDossierSources.js';
const load=createSecDossierLoader();
export default async function companyDossier(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(!requireAccess(req,res))return;
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
  const result=await load(req.query?.symbol,String(process.env.EDGAR_USER_AGENT??'').trim());
  const status=result.ok?200:result.code==='INVALID_SYMBOL'?400:result.code==='RATE_LIMITED'||result.code==='BUSY'?429:result.code==='CONTACT_NOT_CONFIGURED'?503:502;
  return res.status(status).json(result);
}
