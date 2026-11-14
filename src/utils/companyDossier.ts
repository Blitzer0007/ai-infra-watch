/** Presentation boundary only: preserve the financial contract's gates. No I/O. */
import {buildCompanyFinancialObservations,type CompanyFinancialSnapshot,type FinancialObservationRequest,type CompanyFinancialObservation} from './companyFinancialObservations';
export const DOSSIER_SECTIONS=['Overview','Growth','Financial health','Valuation','Catalysts','Risks','Sources'] as const;
export type DossierSection=typeof DOSSIER_SECTIONS[number];
export const dossierStatusLabels:Record<CompanyFinancialSnapshot['status'],string>={partial:'Partial loaded declarations','not-configured':'Financial source not connected','rate-limited':'Loaded source reported a rate limit',timeout:'Loaded source reported a timeout','transport-error':'Loaded source reported a transport error','no-data':'Loaded source returned no supported data',unavailable:'Financial observations unavailable','invalid-payload':'Financial inputs need review'};
export function dossierFinancials(symbol:string,request:FinancialObservationRequest|null):{status:CompanyFinancialSnapshot['status'];snapshot:CompanyFinancialSnapshot|null} {
  if(typeof symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(symbol))return {status:'invalid-payload',snapshot:null};
  if(request===null)return {status:'not-configured',snapshot:null};
  if(!request||typeof request!=='object'||Array.isArray(request)||request.symbol!==symbol)return {status:'invalid-payload',snapshot:null};
  try{const snapshot=buildCompanyFinancialObservations(request);return {status:snapshot.status,snapshot};}
  catch{return {status:'invalid-payload',snapshot:null};}
}
export function dossierObservations(snapshot:CompanyFinancialSnapshot|null,section:DossierSection):CompanyFinancialObservation[]{
  const metrics=section==='Growth'?['revenue','revenue_growth_pct','operating_margin_pct']:section==='Financial health'?['operating_cash_flow','capital_expenditure','free_cash_flow_usd','liabilities','stockholders_equity','liabilities_equity']:[];
  return snapshot?.observations.filter(o=>metrics.includes(o.metric))??[];
}
export function formatDossierValue(value:number,unit:CompanyFinancialObservation['unit']):string {
  if(typeof value!=='number'||!Number.isFinite(value)||!['USD','percent','ratio'].includes(unit))return 'Unavailable';
  if(Object.is(value,-0))value=0;
  const amount=value!==0&&Math.abs(value)<0.0001?value.toExponential(4):value.toLocaleString('en-US',{maximumFractionDigits:8});
  return unit==='USD'?amount+' USD':unit==='percent'?amount+'%':amount+' ratio';
}
export const dossierIssueLabels:Record<string,string>={
  ISSUER_MISMATCH:'The requested issuer does not match the supplied receipt.',INVALID_SOURCE:'The source payload is unsupported.',SOURCE_LIMIT:'The source packet exceeded its limits.',INVALID_FACT:'Some supplied facts were invalid.',AMBIGUOUS_FACT:'Some supplied facts were ambiguous.',MISSING_INPUT:'Required financial inputs are missing.',PERIOD_ALIGNMENT:'Some inputs do not share a compatible period or filing vintage.',NONPOSITIVE_DENOMINATOR:'A required denominator was not positive.',INVALID_CAPEX:'The capital-spending input does not support this cash-flow definition.',NONFINITE_RESULT:'A calculation could not produce a finite result.',DATE_ONLY_PUBLICATION:'Filing dates have calendar-day precision only.',INVALID_SOURCE_RECEIPT:'The financial receipt did not pass its contract checks.',FUTURE_RETRIEVAL:'The declared retrieval follows assessment.',PUBLICATION_PRECISION_UNSUPPORTED:'Publication precision is outside the supported policy.',PUBLICATION_WINDOW_UNCLOSED:'The full filing-day uncertainty window had not closed by retrieval.',NO_SUPPORTED_OBSERVATIONS:'No supported observations survived these checks.',
};
