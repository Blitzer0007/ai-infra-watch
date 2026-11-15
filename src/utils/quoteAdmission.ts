/** Typed adapter to the canonical declared quote checks, also used by the server. */
import {evaluateDeclaredQuote as shared} from '../../shared/quoteAdmission.js';
import type {DataQualityStatus,ValidatedQuote} from './decisionEligibility';
export function evaluateDeclaredQuote(symbol:string,value:unknown,nowMs:number,policy:{requireOpenSession?:boolean;maxAgeMs?:number}={}) {
  return shared(symbol,value,nowMs,policy) as {eligible:boolean;status:DataQualityStatus;reasons:string[];quote:ValidatedQuote|null};
}
