/** Diagnostics over loaded records only. Reuses the existing weighted-average engine. */
import { reviewLoadedLedger as reviewShared, ledgerIssueLabels, ledgerDetailLabels } from '../../shared/loadedLedgerReview.js';
export { ledgerIssueLabels, ledgerDetailLabels } from '../../shared/loadedLedgerReview.js';
export type StoredLedgerInputs={contractVersion:'stored-ledger-inputs-v1';symbol:string|null;transactionType:'BUY'|'SELL'|null;quantity:number|null;amount:number|null;brokerage:number|null;currency:string|null;tradeDate:string|null;executedAt:string|null;quantityDerived:boolean|null;priceDerived:boolean|null};
export type LedgerAvailability='loading'|'ready'|'unavailable';
export type LoadedLedgerInput={holdings:readonly unknown[];transactions:readonly unknown[];holdingsAvailability:LedgerAvailability;transactionsAvailability:LedgerAvailability;assessedAt:string};
export type LedgerIssueCode=keyof typeof ledgerIssueLabels;
type Issue={code:LedgerIssueCode;detailCode?:keyof typeof ledgerDetailLabels;symbol:string|null;recordId:string|null};
type Position={symbol:string;holdingQuantity:number;ledgerQuantity:number;currency:'USD';openCostBasis:number;recordedTradeResult:number};
export type LoadedLedgerReview={contractVersion:'loaded-ledger-review-v1';status:'matched-loaded-records'|'needs-data'|'unavailable'|'empty';assessedAt:string;
  holdingCount:number;transactionCount:number;reviewedTransactionCount:number;issues:Issue[];positions:Position[];
  totals:{openCostBasis:number;recordedTradeResult:number;grossPurchaseCost:number;netSaleProceeds:number}|null;
  historyCoverage:'unverified';corporateActionCoverage:'unverified';accountingReconciled:false;grantsDecisionEligibility:false;verifiesSourceRecords:false};
/** Typed browser adapter around the same review used by the server. */
export function reviewLoadedLedger(input:LoadedLedgerInput):LoadedLedgerReview {
  return reviewShared(input) as LoadedLedgerReview;
}
