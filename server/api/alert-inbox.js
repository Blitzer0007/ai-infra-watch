import { requireAccess } from '../../api/_access-auth.js';
import { readAlertInboxPage } from '../services/alertInbox.js';

export function createAlertInboxHandler({authorize=requireAccess,readPage=readAlertInboxPage,configuration=()=>({url:String(process.env.SUPABASE_URL||'').trim(),key:String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim(),recipient:String(process.env.TELEGRAM_CHAT_ID||'').trim()})}={}) {
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'This inbox supports read-only GET requests.'});}
    if(!authorize(req,res))return;
    try { return res.status(200).json(await readPage({config:configuration(),query:req.query||{}})); }
    catch(error){return res.status(error?.status===400?400:503).json({ok:false,error:error?.status===400?'Invalid inbox window or continuation cursor.':'Delivery ledger unavailable. Browser history can still be reviewed.'});}
  };
}
export default createAlertInboxHandler();
