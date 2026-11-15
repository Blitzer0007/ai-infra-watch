import { QUANTITY_EPSILON } from '../../shared/accountingPrecision.js';
import {optionalFiniteNumber} from '../../shared/portfolioRuleMath.js';
import {financialNotificationAdmission} from '../../shared/financialNotificationAdmission.js';
const THRESHOLDS = [25, 30];
function holdingStateKey(symbol,threshold) { return 'holding-return:' + String(symbol || '').trim().toUpperCase() + ':' + threshold; }

// Retained pure compatibility calculations; these do not grant source or send authority.
export function getHoldingReturnThresholdTransitions(symbol, returnPct, states = new Map()) {
  if (returnPct == null || returnPct === '') return { trigger: [], reset: [] };
  const value = optionalFiniteNumber(returnPct);
  if (!Number.isFinite(value)) return { trigger: [], reset: [] };
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) return { trigger: [], reset: [] };
  const trigger = [];
  const reset = [];
  for (const threshold of THRESHOLDS) {
    const old = states.get(holdingStateKey(normalizedSymbol, threshold));
    if (value >= threshold && !old?.active) trigger.push(threshold);
    if (value < threshold && old?.active) reset.push(threshold);
  }
  return { trigger, reset };
}

export function deriveHoldingLedgerCostBasis(transactionRows = [], holdings = []) {
  const ordered = [...transactionRows].sort((a, b) =>
    String(a.trade_date || '').localeCompare(String(b.trade_date || '')) ||
    Number(a.source_row || 0) - Number(b.source_row || 0)
  );
  const inventory = new Map();
  for (const tx of ordered) {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    const quantity = Number(tx.quantity);
    const amount = Number(tx.amount);
    const brokerage = Number(tx.brokerage ?? 0);
    if (!symbol) continue;
    const position = inventory.get(symbol) || {
      quantity: 0,
      costBasis: 0,
      realizedPnl: 0,
      derivedCount: 0,
      currencies: new Set(),
      invalid: false,
    };
    if (!Number.isFinite(quantity) || !(quantity > 0) || !Number.isFinite(amount) || !(amount > 0) ||
      !Number.isFinite(brokerage) || brokerage < 0 || !['BUY', 'SELL'].includes(tx.transaction_type)) {
      position.invalid = true;
      inventory.set(symbol, position);
      continue;
    }
    position.currencies.add(String(tx.currency || 'USD').trim().toUpperCase());
    if (tx.quantity_derived || tx.price_derived) position.derivedCount++;

    if (tx.transaction_type === 'BUY') {
      position.quantity += quantity;
      position.costBasis += amount + brokerage;
    } else {
      const tolerance = QUANTITY_EPSILON;
      if (position.quantity <= 0 || position.quantity + tolerance < quantity) {
        position.invalid = true;
      } else {
        const averageCost = position.costBasis / position.quantity;
        const proceeds = amount - brokerage;
        position.realizedPnl += proceeds - averageCost * quantity;
        position.quantity -= quantity;
        position.costBasis -= averageCost * quantity;
        if (Math.abs(position.quantity) < QUANTITY_EPSILON) {
          position.quantity = 0;
          position.costBasis = 0;
        }
      }
    }
    inventory.set(symbol, position);
  }

  const holdingsBySymbol = new Map();
  for (const row of holdings) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    holdingsBySymbol.set(symbol, (holdingsBySymbol.get(symbol) || 0) + Number(row.quantity || 0));
  }

  const result = new Map();
  for (const [symbol, position] of inventory.entries()) {
    const expected = holdingsBySymbol.get(symbol) || 0;
    const tolerance = Math.max(0.00001, Math.abs(expected) * 0.0001);
    const quantityMismatch = Math.abs(position.quantity - expected) > tolerance;
    const currencyMismatch = position.currencies.size !== 1 || !position.currencies.has('USD');
    const valid = !position.invalid && !quantityMismatch && !currencyMismatch && position.quantity > 0 && position.costBasis > 0;
    result.set(symbol, {
      quantity: position.quantity,
      openCostBasis: position.costBasis,
      averageCost: position.quantity > 0 ? position.costBasis / position.quantity : null,
      realizedPnl: position.realizedPnl,
      derivedCount: position.derivedCount,
      valid,
      quantityMismatch,
      currencyMismatch,
      invalidSequence: position.invalid,
    });
  }
  return result;
}

export function getHoldingReturnGivebackTransition(returnPct, peakPct, active = false) {
  if (returnPct == null || peakPct == null || returnPct === '' || peakPct === '') return { peakPct: null, trigger: false, reset: false, givebackPct: null };
  const current = optionalFiniteNumber(returnPct), peak = optionalFiniteNumber(peakPct);
  if (!Number.isFinite(current) || !Number.isFinite(peak)) return { peakPct: null, trigger: false, reset: false, givebackPct: null };
  const nextPeak = Math.max(current, peak), givebackPct = nextPeak - current;
  return { peakPct: nextPeak, trigger: !active && nextPeak >= 30 && givebackPct >= 10, reset: Boolean(active) && givebackPct <= 5, givebackPct };
}

export function getHoldingReviewTransition(symbol, returnPct, actionItems = [], earnings = [], oldState = null) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase(), value = optionalFiniteNumber(returnPct);
  if (!normalizedSymbol || !Number.isFinite(value)) return { trigger: false, reset: false, signature: null, items: [], earnings: [] };
  if (value < 15) return { trigger: false, reset: Boolean(oldState?.active), signature: null, items: [], earnings: [] };
  const items = (Array.isArray(actionItems) ? actionItems : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol && ['ACT', 'WATCH'].includes(String(item?.severity || '').toUpperCase()))
    .slice(0, 3).map(item => ({ severity: String(item.severity).toUpperCase(), title: String(item.title || 'Saved rule'), detail: String(item.detail || 'Review the recorded holding thesis and rules.') }));
  const upcoming = (Array.isArray(earnings) ? earnings : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol && Number(item?.daysUntil) >= 0 && Number(item?.daysUntil) <= 7)
    .map(item => ({ date: String(item.date || ''), daysUntil: Number(item.daysUntil) }));
  if (!items.length && !upcoming.length) return { trigger: false, reset: Boolean(oldState?.active), signature: null, items, earnings: upcoming };
  const signature = [...items.map(item => item.severity + ':' + item.title), ...upcoming.map(item => 'EARNINGS:' + item.date)].sort().join('|');
  return { trigger: !oldState?.active || String(oldState?.metadata?.signature || '') !== signature, reset: false, signature, items, earnings: upcoming };
}

export function buildHoldingThesisContext(symbol, holding = null, actionItems = []) {
  const thesis = String(holding?.decision_thesis || '').trim();
  const notes = String(holding?.notes || '').trim();
  const practicalNotes = String(holding?.practical_notes || '').trim();
  const ownActions = (Array.isArray(actionItems) ? actionItems : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === String(symbol || '').trim().toUpperCase()
      && ['ACT', 'WATCH'].includes(String(item?.severity || '').toUpperCase()))
    .slice(0, 2);
  const lines = [
    'ADD OPPORTUNITY: INSUFFICIENT EVIDENCE — no independent, evidence-backed add signal is available in this alert.',
    'Why: a profit milestone alone does not establish attractive valuation, a valid thesis, or suitable position sizing.',
    'Saved thesis: ' + (thesis || notes || 'not recorded for this holding.'),
  ];
  if (ownActions.length) {
    lines.push('Thesis/risk evidence from Decision Center:');
    ownActions.forEach(item => lines.push('• [' + String(item.severity).toUpperCase() + '] ' + String(item.title || 'Review signal') + ': ' + String(item.detail || 'Details unavailable.')));
  } else {
    lines.push('Decision evidence: no symbol-specific ACT/WATCH item was returned in this scan; this is not proof that the thesis is intact.');
  }
  if (practicalNotes) lines.push('Saved context: ' + practicalNotes);
  if (holding?.loss_limit_pct != null) lines.push('Saved loss limit: ' + Number(holding.loss_limit_pct) + '%');
  if (holding?.exit_rule_text) lines.push('Saved exit rule: ' + String(holding.exit_rule_text));
  else if (holding?.exit_rule_type) lines.push('Saved exit rule: ' + String(holding.exit_rule_type) + (holding.exit_rule_value != null ? ' (' + String(holding.exit_rule_value) + ')' : ''));
  if (holding?.target_allocation_pct != null) lines.push('Target portfolio weight: ' + Number(holding.target_allocation_pct) + '%');
  if (holding?.max_allocation_pct != null) lines.push('Maximum portfolio weight: ' + Number(holding.max_allocation_pct) + '%');
  lines.push('Next check: verify current valuation, fresh company evidence, downside risk and concentration before considering an add.');
  return lines;
}

export async function evaluatePortfolioHoldingReturnAlerts(digest) {
  const admission = financialNotificationAdmission(digest);
  return { evaluated: false, status: admission.status, reason: admission.reason, evaluatedHoldings: 0, triggered: [], sent: 0, errors: [] };
}
