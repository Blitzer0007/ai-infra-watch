import {connectSecDossierSources,SEC_DOSSIER_LIMITS} from '../../shared/secDossierConnection.js';
import type {FinancialObservationRequest} from './companyFinancialObservations';
import type {DossierStatementPacket} from './dossierStatements';
import type {DossierOperatingPacket} from './dossierOperating';
export type SecDossierConnection={symbol:string;cik:string;name:string|null;retrievedAt:string;assessedAt:string;mappingBasis:string;assetClass:'unknown';
  sourceAuthenticityVerified:false;issuerMappingVerified:false;grantsDecisionEligibility:false;grantsValuationEligibility:false;
  request:FinancialObservationRequest;statements:DossierStatementPacket|null;operations:DossierOperatingPacket|null;
  urls:{directory:string;submissions:string;companyfacts:string}};
export function admitSecDossierPayload(symbol:string,value:unknown):SecDossierConnection|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const result=value as Record<string,unknown>;
  if(result.ok!==true||!['hit','miss'].includes(String(result.cacheStatus))||Object.keys(result).sort().join(',')!=='cacheStatus,ok,packet')return null;
  try{return connectSecDossierSources(symbol,result.packet).connection as SecDossierConnection|null;}catch{return null;}
}
export const SEC_DOSSIER_RESPONSE_LIMIT=SEC_DOSSIER_LIMITS.bytes;
export class SecDossierLoadError extends Error {}
export const secDossierFailureLabels:Record<string,string>={
  CONTACT_NOT_CONFIGURED:'SEC contact configuration is missing or invalid. A server operator must configure a valid EDGAR contact before acquisition.',
  RATE_LIMITED:'The SEC source or process-local request budget is rate limited. No automatic retry will run.',BUSY:'Another SEC acquisition is running in this server process. No automatic retry will run.',
  ISSUER_UNRESOLVED:'The SEC directory did not provide one exact ticker-to-CIK declaration. Funds and foreign issuers may need another filing adapter.',
  ISSUER_MISMATCH:'The supplied SEC documents disagree about the requested issuer. Financial inputs were withheld.',
  SOURCE_LIMIT:'The SEC source exceeded the supported size or row limits. Financial inputs were withheld.',SOURCE_LIMIT_OR_INVALID:'The SEC source exceeded supported limits or had an unsupported structure.',
  INVALID_SOURCE:'The SEC response had an unsupported format.',TIMEOUT:'The SEC request timed out. No automatic retry will run.',NO_DATA:'The requested SEC document was not available.',
};
export function secDossierFailureMessage(code:unknown):string{
  return typeof code==='string'&&Object.hasOwn(secDossierFailureLabels,code)?secDossierFailureLabels[code]:'SEC financial acquisition is unavailable. No automatic retry will run.';
}
