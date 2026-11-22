/** Present admitted annual declarations only. Do not promote them into scan inputs. */
import {reviewDossierOperating} from './dossierOperating';
import type {SecDossierConnection} from './secDossierConnection';
export const OPPORTUNITY_FINANCIAL_GROUPS=[
  {key:'revenue',label:'Revenue',metrics:['revenue_contract_excluding_tax','revenues_declared','net_sales_declared']},
  {key:'operating-income',label:'Operating income (loss)',metrics:['operating_income_loss']},
  {key:'net-income',label:'Net income (loss)',metrics:['net_income_loss']},
  {key:'operating-cash-flow',label:'Operating cash flow',metrics:['operating_cash_flow']},
  {key:'ppe-payments',label:'Property, plant and equipment payments',metrics:['ppe_payments']},
] as const;
export function opportunityFinancialReview(symbol:string,connection:SecDossierConnection|null){
  const empty={status:'not-loaded' as 'not-loaded'|'invalid'|'needs-data'|'partial',scope:'',periods:[] as {key:string;start:string;end:string;rows:ReturnType<typeof reviewDossierOperating>['operating']['sourceRows'];missing:string[]}[],
    grantsDecisionEligibility:false as const,grantsResearchEligibility:false as const,aggregationEligibility:false as const};
  if(!connection)return empty;
  if(connection.symbol!==symbol||!connection.request||connection.request.symbol!==symbol||connection.request.cik!==connection.cik||connection.request.assessedAt!==connection.assessedAt||connection.assetClass!=='unknown'||connection.issuerMappingVerified!==false||connection.sourceAuthenticityVerified!==false||connection.grantsDecisionEligibility!==false||connection.grantsValuationEligibility!==false)return {...empty,status:'invalid' as const};
  try{
    const review=reviewDossierOperating(symbol,connection.request,connection.statements,connection.operations).operating;
    if(review.status==='invalid'||review.status==='conflicting')return {...empty,status:'invalid' as const};
    const supported=new Set<string>(OPPORTUNITY_FINANCIAL_GROUPS.flatMap(g=>[...g.metrics]));
    const periods=review.periods.map(p=>{
      const rows=review.sourceRows.filter(row=>row.period.start===p.start&&row.period.end===p.end&&supported.has(row.metric));
      return {key:p.key,start:p.start!,end:p.end,rows,missing:OPPORTUNITY_FINANCIAL_GROUPS.filter(g=>!rows.some(row=>(g.metrics as readonly string[]).includes(row.metric))).map(g=>g.label)};
    });
    return {...empty,status:periods.some(p=>p.rows.length)?'partial' as const:'needs-data' as const,scope:review.scope,periods};
  }catch{return {...empty,status:'invalid' as const};}
}
