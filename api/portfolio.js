import { history as routedHistory } from './_market-data.js';
import { requireAccess } from './_access-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(prefer = 'return=representation') {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = text; }
  if (!response.ok) {
    throw new Error('Supabase portfolio request failed: HTTP ' + response.status + ' ' + text.slice(0, 300));
  }
  return data;
}

function normalizeBrokerAlerts(row) {
  if (Array.isArray(row?.broker_alerts)) {
    return row.broker_alerts
      .map(item => ({
        price: Number(item?.price),
        direction: item?.direction === 'below' ? 'below' : item?.direction === 'above' ? 'above' : null,
        label: String(item?.label || '').trim() || null,
      }))
      .filter(item => Number.isFinite(item.price) && item.price > 0 && item.direction);
  }
  const averageCost = Number(row?.average_cost);
  if (!Array.isArray(row?.broker_alert_prices)) return [];
  return row.broker_alert_prices.map(value => Number(value)).filter(v => v > 0).map(price => ({
    price,
    direction: Number.isFinite(averageCost) && price < averageCost ? 'below' : 'above',
    label: Number.isFinite(averageCost) && price < averageCost ? 'stop (inferred)' : 'target (inferred)',
  }));
}

function normalizeLot(row) {
  return {
    id: row.id,
    holdingId: row.holding_id,
    symbol: String(row.symbol).toUpperCase(),
    purchaseDate: row.purchase_date || null,
    investedAmount: Number(row.invested_amount),
    executionPrice: Number(row.execution_price),
    quantity: Number(row.quantity),
    notes: row.notes || '',
    decisionThesis: row.decision_thesis || '',
    lossLimitPct: row.loss_limit_pct == null ? null : Number(row.loss_limit_pct),
    exitRuleType: row.exit_rule_type || null,
    exitRuleValue: row.exit_rule_value == null ? null : Number(row.exit_rule_value),
    exitRuleText: row.exit_rule_text || '',
    practicalNotes: row.practical_notes || '',
    currency: String(row.currency || 'USD').toUpperCase(),
    brokerAlertPrices: Array.isArray(row.broker_alert_prices) ? row.broker_alert_prices.map(Number).filter(Number.isFinite) : [],
    brokerAlerts: normalizeBrokerAlerts(row),
    brokerAlertsReviewRequired: Boolean(row.broker_alerts_review_required),
    ruleStages: Array.isArray(row.rule_stages) ? row.rule_stages : [],
    ruleStageState: row.rule_stage_state && typeof row.rule_stage_state === 'object' ? row.rule_stage_state : {},
    riskGroup: row.risk_group || null,
    riskBeta: row.risk_beta == null ? null : Number(row.risk_beta),
    riskLeverage: row.risk_leverage == null ? 1 : Number(row.risk_leverage),
    scenarioShockPct: row.scenario_shock_pct == null ? 15 : Number(row.scenario_shock_pct),
    dataQuality: row.__qualityWarnings?.length ? 'review' : 'ok',
    dataQualityWarnings: row.__qualityWarnings || [],
    marketClose: row.__marketClose || null,
    targetAllocationPct: row.target_allocation_pct == null ? null : Number(row.target_allocation_pct),
    maxAllocationPct: row.max_allocation_pct == null ? null : Number(row.max_allocation_pct),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transactionQuality(row) {
  const warnings = [];
  if (!row.trade_date || Number.isNaN(Date.parse(String(row.trade_date)))) warnings.push('invalid trade date');
  const quantity = Number(row.quantity);
  const amount = Number(row.amount);
  const price = row.price == null ? null : Number(row.price);
  if (!(quantity > 0)) warnings.push('non-positive quantity');
  if (!(amount > 0)) warnings.push('non-positive amount');
  if (price != null && Number.isFinite(price) && price > 0 && quantity > 0 && amount > 0) {
    const implied = quantity * price;
    const tolerance = Math.max(0.05, Math.abs(amount) * 0.01);
    if (Math.abs(implied - amount) > tolerance) warnings.push('price × quantity differs from amount');
  }
  if (row.quantity_derived) warnings.push('quantity derived');
  if (row.price_derived) warnings.push('price derived');
  const currency = String(row.currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) warnings.push('invalid currency');
  return {
    status: warnings.length ? 'review' : 'ok',
    warnings,
    currency,
  };
}

function isWeekend(date) {
  const value = new Date(String(date || '') + 'T00:00:00Z');
  const day = value.getUTCDay();
  return Number.isNaN(value.getTime()) ? false : day === 0 || day === 6;
}

function previousOrSamePoint(points, date) {
  const ordered = [...(points || [])].filter(point => point?.date && Number(point?.price) > 0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let match = null;
  for (const point of ordered) {
    if (String(point.date) <= String(date)) match = point;
    else break;
  }
  return match;
}

async function applyMarketQuality(rows, symbolField, dateField, priceField) {
  const symbols = [...new Set(rows.map(row => String(row?.[symbolField] || '').toUpperCase()).filter(Boolean))];
  const histories = {};
  await Promise.all(symbols.map(async symbol => {
    try { histories[symbol] = await routedHistory(symbol, '1y'); } catch {}
  }));
  return rows.map(row => {
    const warnings = [...(row.__qualityWarnings || [])];
    const date = String(row?.[dateField] || '');
    const symbol = String(row?.[symbolField] || '').toUpperCase();
    if (date && isWeekend(date)) warnings.push('trade date falls on weekend; review against prior market close');
    const enteredPrice = Number(row?.[priceField]);
    const market = previousOrSamePoint(histories[symbol]?.points || [], date);
    const marketPrice = Number(market?.price);
    if (enteredPrice > 0 && marketPrice > 0 && Math.abs(enteredPrice - marketPrice) > Math.max(0.05, Math.abs(marketPrice) * 0.05)) {
      warnings.push('entered price differs >5% from market close (' + market.date + ')');
    }
    return { ...row, __marketClose: market ? { date: market.date, price: marketPrice } : null, __qualityWarnings: [...new Set(warnings)] };
  });
}

function normalizeTransaction(row) {
  const quality = transactionQuality(row);
  return {
    id: row.id,
    symbol: String(row.symbol).toUpperCase(),
    transactionType: row.transaction_type === 'SELL' ? 'SELL' : 'BUY',
    orderType: row.order_type || null,
    tradeDate: row.trade_date,
    orderPlacedAt: row.order_placed_at || null,
    orderExecutedAt: row.order_executed_at || null,
    quantity: Number(row.quantity),
    price: row.price == null ? null : Number(row.price),
    amount: Number(row.amount),
    brokerage: row.brokerage == null ? null : Number(row.brokerage),
    source: row.source || 'broker_order_report',
    sourceRow: Number(row.source_row),
    quantityDerived: Boolean(row.quantity_derived),
    priceDerived: Boolean(row.price_derived),
    currency: quality.currency,
    dataQuality: quality.status,
    dataQualityWarnings: quality.warnings,
    marketClose: row.__marketClose || null,
    createdAt: row.created_at,
  };
}

function normalize(row) {
  return {
    id: row.id,
    symbol: String(row.symbol).toUpperCase(),
    quantity: Number(row.quantity),
    averageCost: Number(row.average_cost),
    purchaseDate: row.purchase_date || null,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decisionThesis: row.decision_thesis || '',
    lossLimitPct: row.loss_limit_pct == null ? null : Number(row.loss_limit_pct),
    exitRuleType: row.exit_rule_type || null,
    exitRuleValue: row.exit_rule_value == null ? null : Number(row.exit_rule_value),
    exitRuleText: row.exit_rule_text || '',
    practicalNotes: row.practical_notes || '',
    currency: String(row.currency || 'USD').toUpperCase(),
    brokerAlertPrices: Array.isArray(row.broker_alert_prices) ? row.broker_alert_prices.map(Number).filter(Number.isFinite) : [],
    brokerAlerts: normalizeBrokerAlerts(row),
    brokerAlertsReviewRequired: Boolean(row.broker_alerts_review_required),
    ruleStages: Array.isArray(row.rule_stages) ? row.rule_stages : [],
    ruleStageState: row.rule_stage_state && typeof row.rule_stage_state === 'object' ? row.rule_stage_state : {},
    riskGroup: row.risk_group || null,
    riskBeta: row.risk_beta == null ? null : Number(row.risk_beta),
    riskLeverage: row.risk_leverage == null ? 1 : Number(row.risk_leverage),
    scenarioShockPct: row.scenario_shock_pct == null ? 15 : Number(row.scenario_shock_pct),
    targetAllocationPct: row.target_allocation_pct == null ? null : Number(row.target_allocation_pct),
    maxAllocationPct: row.max_allocation_pct == null ? null : Number(row.max_allocation_pct),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;
  try {
    if (req.method === 'GET') {
      const holdingId = String(req.query?.holdingId || '').trim();
      if (holdingId) {
        const rows = await supabase(
          'portfolio_purchase_lots?holding_id=eq.' + encodeURIComponent(holdingId) +
          '&select=*&order=purchase_date.asc,created_at.asc',
          { method: 'GET' }
        );
        const checkedLots = await applyMarketQuality(rows.map(row => ({ ...row, __qualityWarnings: transactionQuality({ trade_date: row.purchase_date, quantity: row.quantity, amount: row.invested_amount, price: row.execution_price, currency: row.currency }).warnings })), 'symbol', 'purchase_date', 'execution_price');
        return res.status(200).json({ lots: checkedLots.map(normalizeLot), persistent: true, source: 'supabase' });
      }
      const rows = await supabase('portfolio_holdings?select=*&order=symbol.asc', { method: 'GET' });
      const holdings = rows.map(normalize).filter(holding => holding.quantity > 0);
      if (String(req.query?.includeTransactions || '') === 'true') {
        const transactionRows = await supabase('portfolio_transactions?select=*&order=trade_date.asc,source_row.asc', { method: 'GET' });
        const checkedTransactions = await applyMarketQuality(
          transactionRows.map(row => ({ ...row, __qualityWarnings: transactionQuality(row).warnings })),
          'symbol',
          'trade_date',
          'price',
        );
        const normalizedTransactions = checkedTransactions.map(normalizeTransaction);
        const transactionQualitySummary = {
          total: normalizedTransactions.length,
          review: normalizedTransactions.filter(row => row.dataQuality === 'review').length,
          derived: normalizedTransactions.filter(row => row.quantityDerived || row.priceDerived).length,
          weekendDates: normalizedTransactions.filter(row => (row.dataQualityWarnings || []).some(w => w.startsWith('trade date falls on weekend'))).length,
          priceVsMarketClose: normalizedTransactions.filter(row => (row.dataQualityWarnings || []).some(w => w.startsWith('entered price differs'))).length,
          currencies: [...new Set(normalizedTransactions.map(row => row.currency))],
        };
        return res.status(200).json({
          holdings,
          transactions: normalizedTransactions,
          transactionQuality: transactionQualitySummary,
          persistent: true,
          source: 'supabase',
        });
        if (String(req.query?.includeLots || '') === 'true') {
        const lots = await supabase('portfolio_purchase_lots?select=*&order=purchase_date.asc,created_at.asc', { method: 'GET' });
        const checkedLots = await applyMarketQuality(
          lots.map(row => ({ ...row, __qualityWarnings: transactionQuality({
            trade_date: row.purchase_date,
            quantity: row.quantity,
            amount: row.invested_amount,
            price: row.execution_price,
            currency: row.currency,
          }).warnings })),
          'symbol',
          'purchase_date',
          'execution_price',
        );
        const normalizedLots = checkedLots.map(normalizeLot);
        const byHolding = new Map();
        for (const lot of normalizedLots) {
          const list = byHolding.get(lot.holdingId) || [];
          list.push(lot);
          byHolding.set(lot.holdingId, list);
        }
        const lotQuality = {
          total: normalizedLots.length,
          review: normalizedLots.filter(lot => (lot.dataQualityWarnings || []).length).length,
          weekendDates: normalizedLots.filter(lot => (lot.dataQualityWarnings || []).some(w => w.startsWith('trade date falls on weekend'))).length,
          priceVsMarketClose: normalizedLots.filter(lot => (lot.dataQualityWarnings || []).some(w => w.startsWith('entered price differs'))).length,
        };
        return res.status(200).json({ holdings, persistent: true, source: 'supabase' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (body.action === 'purchase') {
        const holdingId = String(body.holdingId || '').trim();
        const investedAmount = Number(body.investedAmount);
        const executionPrice = Number(body.executionPrice);
        if (!holdingId || !Number.isFinite(investedAmount) || investedAmount <= 0 ||
            !Number.isFinite(executionPrice) || executionPrice <= 0) {
          return res.status(400).json({
            error: 'holdingId, positive investedAmount and positive executionPrice are required',
          });
        }

        const rpc = await supabase('rpc/add_portfolio_purchase', {
          method: 'POST',
          body: JSON.stringify({
            p_holding_id: holdingId,
            p_invested_amount: investedAmount,
            p_execution_price: executionPrice,
            p_purchase_date: body.purchaseDate || null,
            p_notes: body.notes || null,
          }),
        });
        return res.status(201).json({
          lot: normalizeLot(rpc?.lot),
          holding: normalize(rpc?.holding),
        });
      }
      const symbol = String(body.symbol || '').trim().toUpperCase();
      const quantity = Number(body.quantity);
      const averageCost = Number(body.averageCost);
      if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCost) || averageCost < 0) {
        return res.status(400).json({ error: 'symbol, positive quantity and non-negative averageCost are required' });
      }
      const rpc = await supabase('rpc/create_portfolio_holding', {
        method: 'POST',
        body: JSON.stringify({
          p_symbol: symbol,
          p_quantity: quantity,
          p_average_cost: averageCost,
          p_purchase_date: body.purchaseDate || null,
          p_notes: body.notes || null,
        }),
      });
      let createdHolding = rpc?.holding;
      const allocationPayload = {};
      const qualityPayload = {};
      if (body.decisionThesis !== undefined) qualityPayload.decision_thesis = body.decisionThesis || null;
      if (body.lossLimitPct !== undefined) qualityPayload.loss_limit_pct = body.lossLimitPct == null || body.lossLimitPct === '' ? null : Number(body.lossLimitPct);
      if (body.exitRuleType !== undefined) qualityPayload.exit_rule_type = body.exitRuleType || null;
      if (body.exitRuleValue !== undefined) qualityPayload.exit_rule_value = body.exitRuleValue == null || body.exitRuleValue === '' ? null : Number(body.exitRuleValue);
      if (body.exitRuleText !== undefined) qualityPayload.exit_rule_text = body.exitRuleText || null;
      if (body.practicalNotes !== undefined) qualityPayload.practical_notes = body.practicalNotes || null;
      if (body.brokerAlertPrices !== undefined) qualityPayload.broker_alert_prices = Array.isArray(body.brokerAlertPrices) ? body.brokerAlertPrices.map(Number).filter(Number.isFinite) : [];
      if (body.brokerAlerts !== undefined) qualityPayload.broker_alerts = Array.isArray(body.brokerAlerts) ? body.brokerAlerts : [];
      if (body.brokerAlertsReviewRequired !== undefined) qualityPayload.broker_alerts_review_required = Boolean(body.brokerAlertsReviewRequired);
      if (body.ruleStages !== undefined) qualityPayload.rule_stages = Array.isArray(body.ruleStages) ? body.ruleStages : [];
      if (body.ruleStageState !== undefined) qualityPayload.rule_stage_state = body.ruleStageState && typeof body.ruleStageState === 'object' ? body.ruleStageState : {};
      if (body.riskGroup !== undefined) qualityPayload.risk_group = String(body.riskGroup || '').trim() || null;
      if (body.riskBeta !== undefined) qualityPayload.risk_beta = body.riskBeta == null || body.riskBeta === '' ? null : Number(body.riskBeta);
      if (body.riskLeverage !== undefined) qualityPayload.risk_leverage = body.riskLeverage == null || body.riskLeverage === '' ? 1 : Number(body.riskLeverage);
      if (body.scenarioShockPct !== undefined) qualityPayload.scenario_shock_pct = body.scenarioShockPct == null || body.scenarioShockPct === '' ? 15 : Number(body.scenarioShockPct);

      if (body.targetAllocationPct != null && body.targetAllocationPct !== '') allocationPayload.target_allocation_pct = Number(body.targetAllocationPct);
      if (body.maxAllocationPct != null && body.maxAllocationPct !== '') allocationPayload.max_allocation_pct = Number(body.maxAllocationPct);
      Object.assign(allocationPayload, qualityPayload);
      if (Object.keys(allocationPayload).length) {
        if (allocationPayload.target_allocation_pct != null && (!Number.isFinite(allocationPayload.target_allocation_pct) || allocationPayload.target_allocation_pct < 0 || allocationPayload.target_allocation_pct > 100)) return res.status(400).json({ error: 'targetAllocationPct must be between 0 and 100' });
        if (allocationPayload.max_allocation_pct != null && (!Number.isFinite(allocationPayload.max_allocation_pct) || allocationPayload.max_allocation_pct < 0 || allocationPayload.max_allocation_pct > 100)) return res.status(400).json({ error: 'maxAllocationPct must be between 0 and 100' });
        if (allocationPayload.target_allocation_pct != null && allocationPayload.max_allocation_pct != null && allocationPayload.target_allocation_pct > allocationPayload.max_allocation_pct) return res.status(400).json({ error: 'targetAllocationPct cannot exceed maxAllocationPct' });
        const updated = await supabase('portfolio_holdings?id=eq.' + encodeURIComponent(createdHolding.id), {
          method: 'PATCH',
          body: JSON.stringify(allocationPayload),
        });
        if (updated.length) createdHolding = updated[0];
      }
      return res.status(201).json({
        lot: normalizeLot(rpc?.lot),
        holding: normalize(createdHolding),
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ error: 'id is required' });
      const payload = {};
      if (body.symbol != null) payload.symbol = String(body.symbol).trim().toUpperCase();
      if (body.quantity != null) payload.quantity = Number(body.quantity);
      if (body.averageCost != null) payload.average_cost = Number(body.averageCost);
      if (body.purchaseDate !== undefined) payload.purchase_date = body.purchaseDate || null;
      if (body.notes !== undefined) payload.notes = body.notes || null;
      if (body.decisionThesis !== undefined) payload.decision_thesis = body.decisionThesis || null;
      if (body.lossLimitPct !== undefined) payload.loss_limit_pct = body.lossLimitPct == null || body.lossLimitPct === '' ? null : Number(body.lossLimitPct);
      if (body.exitRuleType !== undefined) payload.exit_rule_type = body.exitRuleType || null;
      if (body.exitRuleValue !== undefined) payload.exit_rule_value = body.exitRuleValue == null || body.exitRuleValue === '' ? null : Number(body.exitRuleValue);
      if (body.exitRuleText !== undefined) payload.exit_rule_text = body.exitRuleText || null;
      if (body.practicalNotes !== undefined) payload.practical_notes = body.practicalNotes || null;
      if (body.brokerAlertPrices !== undefined) payload.broker_alert_prices = Array.isArray(body.brokerAlertPrices) ? body.brokerAlertPrices.map(Number).filter(Number.isFinite) : [];
      if (body.brokerAlerts !== undefined) payload.broker_alerts = Array.isArray(body.brokerAlerts) ? body.brokerAlerts : [];
      if (body.brokerAlertsReviewRequired !== undefined) payload.broker_alerts_review_required = Boolean(body.brokerAlertsReviewRequired);
      if (body.ruleStages !== undefined) payload.rule_stages = Array.isArray(body.ruleStages) ? body.ruleStages : [];
      if (body.ruleStageState !== undefined) payload.rule_stage_state = body.ruleStageState && typeof body.ruleStageState === 'object' ? body.ruleStageState : {};
      if (body.riskGroup !== undefined) payload.risk_group = String(body.riskGroup || '').trim() || null;
      if (body.riskBeta !== undefined) payload.risk_beta = body.riskBeta == null || body.riskBeta === '' ? null : Number(body.riskBeta);
      if (body.riskLeverage !== undefined) payload.risk_leverage = body.riskLeverage == null || body.riskLeverage === '' ? 1 : Number(body.riskLeverage);
      if (body.scenarioShockPct !== undefined) payload.scenario_shock_pct = body.scenarioShockPct == null || body.scenarioShockPct === '' ? 15 : Number(body.scenarioShockPct);
      if (body.targetAllocationPct !== undefined) payload.target_allocation_pct = body.targetAllocationPct == null || body.targetAllocationPct === '' ? null : Number(body.targetAllocationPct);
      if (body.maxAllocationPct !== undefined) payload.max_allocation_pct = body.maxAllocationPct == null || body.maxAllocationPct === '' ? null : Number(body.maxAllocationPct);
      if (payload.quantity != null && (!Number.isFinite(payload.quantity) || payload.quantity <= 0)) return res.status(400).json({ error: 'quantity must be positive' });
      if (payload.average_cost != null && (!Number.isFinite(payload.average_cost) || payload.average_cost < 0)) return res.status(400).json({ error: 'averageCost must be non-negative' });
      if (payload.target_allocation_pct != null && (!Number.isFinite(payload.target_allocation_pct) || payload.target_allocation_pct < 0 || payload.target_allocation_pct > 100)) return res.status(400).json({ error: 'targetAllocationPct must be between 0 and 100' });
      if (payload.max_allocation_pct != null && (!Number.isFinite(payload.max_allocation_pct) || payload.max_allocation_pct < 0 || payload.max_allocation_pct > 100)) return res.status(400).json({ error: 'maxAllocationPct must be between 0 and 100' });
      if (payload.target_allocation_pct != null && payload.max_allocation_pct != null && payload.target_allocation_pct > payload.max_allocation_pct) return res.status(400).json({ error: 'targetAllocationPct cannot exceed maxAllocationPct' });
      const rows = await supabase('portfolio_holdings?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!rows.length) return res.status(404).json({ error: 'holding not found' });
      return res.status(200).json({ holding: normalize(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '');
      if (!id) return res.status(400).json({ error: 'id is required' });
      await supabase('portfolio_holdings?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('portfolio API error:', error);
    return res.status(500).json({ error: error?.message || 'Portfolio service unavailable' });
  }
}
