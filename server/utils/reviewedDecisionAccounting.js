// Pure bridge from original stored rows into the shared conditional ledger/quote checks.
import { reviewLoadedLedger, ledgerIssueLabels } from '../../shared/loadedLedgerReview.js';
import { evaluateDeclaredQuote } from '../../shared/quoteAdmission.js';
import { storedHoldingInputs, storedLedgerInputs, transactionQuality } from '../services/ledgerInputs.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12;

export function calculateReviewedServerPortfolio(holdings, transactions, quotes, nowMs,
  availability = { holdings: 'ready', transactions: 'ready' }) {
  const base = { contractVersion: 'decision-accounting-v1', accountingStatus: 'ledger-inputs-unverified',
    currentValue: null, buyCash: null, saleCash: null, grossPurchaseCost: null, netSaleProceeds: null,
    netContributed: null, openCostBasis: null, realizedPnl: null, unrealizedPnl: null, totalTradingPnl: null,
    pnl: null, returnVsGrossPurchaseCostPct: null, quantityMismatchSymbols: [], derivedTransactionCount: 0,
    accountingIssues: [], admittedQuotes: {}, positionMarks: [], positionUnrealizedPnl: {}, positionOpenCostBasis: {},
    quoteCoverage: { totalHoldings: 0, liveQuotes: 0, lastCloseQuotes: 0, staleFallbacks: 0,
      missingQuotes: 0, coveragePct: null, status: 'unavailable' },
    historyCoverage: 'unverified', corporateActionCoverage: 'unverified', accountingReconciled: false,
    verifiesSourceRecords: false, grantsDecisionEligibility: false };
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 253402300799999 ||
      !object(availability) || !Array.isArray(holdings) || !Array.isArray(transactions) || holdings.length > 150 || transactions.length > 1000) {
    base.accountingIssues.push({ code: 'INVALID_PACKET', symbol: null, message: 'Supported records and assessment time are required.' });
    return base;
  }
  const projectedHoldings = holdings.map(row => {
    if (!object(row)) return null;
    const accountingInputs = storedHoldingInputs(row);
    return { symbol: accountingInputs.symbol, quantity: accountingInputs.quantity, accountingInputs };
  });
  const projectedTrades = transactions.map(row => {
    if (!object(row)) return null;
    const accountingInputs = storedLedgerInputs(row);
    const malformedExecution = row.order_executed_at != null && accountingInputs.executedAt === null;
    return { id: row.id, symbol: accountingInputs.symbol, accountingInputs,
      dataQuality: malformedExecution ? 'review' : transactionQuality(row).status };
  });
  const review = reviewLoadedLedger({ holdings: projectedHoldings, transactions: projectedTrades,
    assessedAt: new Date(nowMs).toISOString(), holdingsAvailability: availability.holdings,
    transactionsAvailability: availability.transactions });
  base.accountingIssues = review.issues.map(issue => ({ code: issue.code, symbol: issue.symbol,
    message: ledgerIssueLabels[issue.code] }));
  base.quantityMismatchSymbols = review.issues.filter(issue => issue.code === 'QUANTITY_MISMATCH' && issue.symbol).map(issue => issue.symbol);
  base.derivedTransactionCount = projectedTrades.filter(row => row?.accountingInputs.quantityDerived === true || row?.accountingInputs.priceDerived === true).length;

  const seen = new Set();
  let holdingInputsValid = availability.holdings === 'ready';
  let value = 0, lastCloseQuotes = 0, missingQuotes = 0;
  for (const row of projectedHoldings) {
    const quantity = row?.quantity, symbol = row?.symbol;
    if (typeof symbol !== 'string' || seen.has(symbol) || !finite(quantity) || quantity < 0 ||
        !Number.isSafeInteger(Math.round(quantity * 1e8)) || Number(quantity.toFixed(8)) !== quantity) {
      holdingInputsValid = false; missingQuotes++; continue;
    }
    seen.add(symbol);
    if (quantity === 0) { base.positionMarks.push({ symbol, quantity, value: 0 }); continue; }
    const admission = evaluateDeclaredQuote(symbol, object(quotes) ? quotes[symbol] : null, nowMs);
    if (!admission.eligible) {
      missingQuotes++;
      base.accountingIssues.push({ code: 'QUOTE_WITHHELD', symbol, message: admission.reasons.join(' ') });
      continue;
    }
    const mark = quantity * admission.quote.price;
    if (!finite(mark) || mark <= 0) { holdingInputsValid = false; missingQuotes++; continue; }
    value += mark;
    base.admittedQuotes[symbol] = admission.quote;
    base.positionMarks.push({ symbol, quantity, value: mark });
    if (admission.status === 'last_close') lastCloseQuotes++;
  }
  const covered = base.positionMarks.length;
  base.quoteCoverage = { totalHoldings: holdings.length, liveQuotes: Object.keys(base.admittedQuotes).length - lastCloseQuotes,
    lastCloseQuotes, staleFallbacks: 0, missingQuotes, coveragePct: holdings.length ? covered / holdings.length * 100 : null,
    status: availability.holdings !== 'ready' ? 'unavailable' : !holdingInputsValid || !finite(value) ? 'invalid'
      : missingQuotes ? 'partial' : holdings.length === 0 ? 'empty' : lastCloseQuotes ? 'last-close' : 'complete' };
  base.currentValue = holdingInputsValid && !missingQuotes && finite(value) ? value : null;
  if (review.status !== 'matched-loaded-records' || !review.totals) return base;
  const totals = review.totals;
  const unrealizedPnl = base.currentValue === null ? null : base.currentValue - totals.openCostBasis;
  const totalTradingPnl = unrealizedPnl === null ? null : unrealizedPnl + totals.recordedTradeResult;
  const netContributed = totals.grossPurchaseCost - totals.netSaleProceeds;
  const returnPct = totalTradingPnl !== null && totals.grossPurchaseCost > 0 ? totalTradingPnl / totals.grossPurchaseCost * 100 : null;
  if ([unrealizedPnl, totalTradingPnl, netContributed].some(value => value !== null && !finite(value)) ||
      (returnPct !== null && !Number.isFinite(returnPct))) {
    base.accountingIssues.push({ code: 'NUMERIC_LIMIT', symbol: null, message: ledgerIssueLabels.NUMERIC_LIMIT });
    return base;
  }
  for (const position of review.positions) {
    base.positionOpenCostBasis[position.symbol] = position.openCostBasis;
    const mark = base.positionMarks.find(row => row.symbol === position.symbol);
    if (mark && finite(mark.value - position.openCostBasis)) base.positionUnrealizedPnl[position.symbol] = mark.value - position.openCostBasis;
  }
  return { ...base, accountingStatus: base.currentValue === null ? 'quotes-incomplete' : 'conditional-loaded-records',
    buyCash: totals.grossPurchaseCost, grossPurchaseCost: totals.grossPurchaseCost, saleCash: totals.netSaleProceeds,
    netSaleProceeds: totals.netSaleProceeds, netContributed, openCostBasis: totals.openCostBasis,
    realizedPnl: totals.recordedTradeResult, unrealizedPnl, totalTradingPnl, pnl: totalTradingPnl,
    returnVsGrossPurchaseCostPct: returnPct };
}
