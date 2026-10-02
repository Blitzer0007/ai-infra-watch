const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qjgnryjtrdwrbmlgdquk.supabase.co';
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const holdingId = String(req.query?.holdingId || '').trim();
      if (holdingId) {
        const rows = await supabase(
          'portfolio_purchase_lots?holding_id=eq.' + encodeURIComponent(holdingId) +
          '&select=*&order=purchase_date.asc,created_at.asc',
          { method: 'GET' }
        );
        return res.status(200).json({ lots: rows.map(normalizeLot), persistent: true, source: 'supabase' });
      }
      const rows = await supabase('portfolio_holdings?select=*&order=symbol.asc', { method: 'GET' });
      return res.status(200).json({ holdings: rows.map(normalize), persistent: true, source: 'supabase' });
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
      const rows = await supabase('portfolio_holdings', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          quantity,
          average_cost: averageCost,
          purchase_date: body.purchaseDate || null,
          notes: body.notes || null,
        }),
      });
      return res.status(201).json({ holding: normalize(rows[0]) });
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
      if (payload.quantity != null && (!Number.isFinite(payload.quantity) || payload.quantity <= 0)) return res.status(400).json({ error: 'quantity must be positive' });
      if (payload.average_cost != null && (!Number.isFinite(payload.average_cost) || payload.average_cost < 0)) return res.status(400).json({ error: 'averageCost must be non-negative' });
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
