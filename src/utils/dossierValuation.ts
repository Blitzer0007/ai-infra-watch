/** Read-only explanations over independently admitted statements; never a valuation grant. */
import {admitDossierStatements,formatStatementValue,type AdmittedStatement} from './dossierStatements';
import type {FinancialObservationRequest} from './companyFinancialObservations';

export type ValuationInputStatus='missing'|'not-connected'|'declaration-only'|'nonpositive'|'selection-needed'|'partial'|'unverified'|'unsupported';
export type ValuationInputCheck={id:string;label:string;status:ValuationInputStatus;detail:string};
export type ValuationInputGroup={value:null;status:'withheld'|'not-meaningful';checks:ValuationInputCheck[]};
const item=(id:string,label:string,status:ValuationInputStatus,detail:string):ValuationInputCheck=>({id,label,status,detail});
const declaration=(row:AdmittedStatement)=>formatStatementValue(row.value,row.unit)+' · '+(row.period.start?row.period.start+' to '+row.period.end:'as of '+row.period.end);

export function reviewDossierValuation(symbol:string,reference:FinancialObservationRequest|null,packet:unknown){
  // Reuse the original-row boundary once. Never accept a caller-supplied readiness flag,
  // price, multiple or pre-normalized observation instead of the supplied originals.
  const statementAdmission=admitDossierStatements(symbol,reference,packet);
  return fromAdmission(statementAdmission);
}
/** Monotonic withdrawal only: cross-source conflicts cannot add inputs. */
export function withholdDossierValuationStatements(review:ReturnType<typeof reviewDossierValuation>){
  return fromAdmission({...review.statementAdmission,status:'invalid',snapshots:[],reason:'Loaded dossier sources disagree. All additional core statement figures are withheld.'});
}
function fromAdmission(statementAdmission:ReturnType<typeof admitDossierStatements>){
  const rows=statementAdmission.snapshots.flatMap(s=>s.observations);
  const metric=(id:string)=>rows.filter(row=>row.metric===id);
  const eps=metric('diluted_eps'),shares=metric('common_shares_outstanding'),cash=metric('cash_equivalents');
  const debt=rows.filter(row=>['long_term_debt_current','long_term_debt_noncurrent','short_term_borrowings'].includes(row.metric));
  const epsCheck:ValuationInputCheck=eps.length>1
    ?item('eps','Annual diluted EPS','selection-needed','Several annual diluted EPS periods are supplied. No latest period is chosen automatically.')
    :eps.length===1
      ?item('eps','Annual diluted EPS',eps[0].value<=0?'nonpositive':'declaration-only',declaration(eps[0])+(eps[0].value<=0?'. Observed zero or loss EPS does not support a meaningful positive P/E.':'. A positive declaration alone does not establish compatible earnings.'))
      :item('eps','Annual diluted EPS','missing','No supported annual diluted EPS declaration is loaded. Basic EPS is not substituted and missing EPS is not zero.');
  const single=(id:string,label:string,values:AdmittedStatement[],missing:string,loaded:string)=>values.length>1
    ?item(id,label,'selection-needed','Several dated declarations are supplied. A compatible valuation date must be selected explicitly.')
    :values.length===1?item(id,label,'declaration-only',declaration(values[0])+'. '+loaded):item(id,label,'missing',missing);
  const price=()=>item('price','Compatible share price','not-connected','No price is connected to this dossier review. Holding cost, analyst targets and chart prices are not substituted.');
  const source=()=>item('source','Issuer and original source','unverified','Publisher authenticity, ticker-to-issuer mapping and security-class identity are not verified. Loaded declarations do not establish those facts.');
  const pe:ValuationInputGroup={value:null,status:epsCheck.status==='nonpositive'?'not-meaningful':'withheld',checks:[
    price(),epsCheck,
    item('basis','Period and adjustment compatibility','unverified','A reported annual fiscal period is not automatically trailing twelve months. Price currency, share class and split/adjustment basis must match the EPS definition; reported and adjusted earnings are not interchangeable.'),
    source(),
  ]};
  const evEbitda:ValuationInputGroup={value:null,status:'withheld',checks:[
    price(),
    single('shares','Point-in-time common shares',shares,'No supported point-in-time common shares are loaded. Cover-page and weighted-average shares are not substituted.','Cover-page and weighted-average shares retain their separate bases; price/date compatibility is unverified.'),
    single('cash','Cash and cash equivalents',cash,'No supported cash declaration is loaded. Missing cash is not zero.','Eligible cash scope and the valuation date remain unverified.'),
    item('debt','Interest-bearing debt scope',debt.length?'partial':'missing',debt.length?'Individual borrowing components are loaded, but overlap, leases and full interest-bearing debt scope are unverified. Components are not summed.':'No supported borrowing components are loaded. Missing debt does not mean debt-free.'),
    item('ebitda','Supported annual EBITDA','unsupported','No supported EBITDA definition or annual period is connected. Operating income and operating cash flow are not substitutes; reported and adjusted EBITDA may differ.'),
    item('claims','Other capital claims','unverified','Preferred equity, noncontrolling interests and other applicable enterprise-value claims are not established. Their absence from this view does not mean zero.'),
    item('basis','Date, currency and adjustment compatibility','unverified','Price, point shares, cash, debt, other claims and EBITDA need compatible dates, currency, security scope and adjustment definitions.'),
    source(),
  ]};
  return {statementAdmission,status:'withheld' as const,pe,evEbitda,sourceAuthenticityVerified:false as const,issuerMappingVerified:false as const,grantsValuationEligibility:false as const,grantsDecisionEligibility:false as const};
}
