import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { requireAccess } from '../../api/_access-auth.js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ISSUER = 'https://token.actions.githubusercontent.com';
const REPOSITORY = 'Blitzer0007/ai-infra-watch';
const ALLOWED_WORKFLOW = '.github/workflows/reentry-alerts.yml';
let jwks = { expiresAt: 0, keys: [] };
function decode(segment) { try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { return null; } }
async function oidcVerified(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const parts = authorization.slice(7).trim().split('.');
  if (parts.length !== 3) return false;
  const header = decode(parts[0]), claims = decode(parts[1]);
  const now = Math.floor(Date.now()/1000);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid || claims.iss !== ISSUER ||
      ![claims.aud].flat().includes('ai-infra-watch') || claims.repository !== REPOSITORY ||
      claims.ref !== 'refs/heads/main' || !String(claims.job_workflow_ref || '').startsWith(REPOSITORY + '/' + ALLOWED_WORKFLOW + '@') ||
      Number(claims.exp) <= now) return false;
  try {
    if (jwks.expiresAt <= Date.now()) {
      const r = await fetch(ISSUER + '/.well-known/jwks', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return false;
      const body = await r.json(); if (!Array.isArray(body.keys)) return false;
      jwks = { expiresAt: Date.now()+300000, keys: body.keys };
    }
    const key = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA'); if (!key) return false;
    const verifier = createVerify('RSA-SHA256'); verifier.update(parts[0]+'.'+parts[1]); verifier.end();
    return verifier.verify(createPublicKey({key,format:'jwk'}), Buffer.from(parts[2],'base64url'));
  } catch { return false; }
}
async function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && req.headers?.authorization === 'Bearer '+secret) return true;
  return oidcVerified(req);
}
async function db(path, options={}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase service configuration is missing');
  const response = await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Re-entry storage failed: HTTP '+response.status);
  const text=await response.text(); return text ? JSON.parse(text) : null;
}
async function quoteHistory(symbol) {
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1y&interval=1d';
  const response=await fetch(url,{headers:{'User-Agent':'ai-infra-watch/1.0'},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('Market quote unavailable for '+symbol);
  const body=await response.json(), result=body?.chart?.result?.[0];
  const meta=result?.meta, closes=result?.indicators?.quote?.[0]?.close;
  if(!meta || !Array.isArray(closes)) throw new Error('History unavailable for '+symbol);
  const valid=closes.filter(v=>Number.isFinite(v));
  const price=Number(meta.regularMarketPrice || valid.at(-1));
  if(!(price>0) || valid.length<50) throw new Error('Insufficient history for '+symbol);
  const avg=n=>valid.slice(-n).reduce((a,b)=>a+b,0)/n;
  const high=Math.max(...valid);
  return {price,sma20:avg(20),sma50:avg(50),drawdownFrom52WeekHighPct:high>0?(high-price)/high*100:null,retrievedAt:new Date().toISOString()};
}

const RESEARCH_CACHE = new Map();
const META_CUSIP = '30303M102';
const TRACKED_MANAGERS = [
  { name: 'Berkshire Hathaway', cik: '0001067983', context: 'Institutional filing commonly associated with Warren Buffett; not his personal portfolio' },
  { name: 'Pershing Square Capital Management', cik: '0001336528', context: 'Bill Ackman-associated fund manager filing' },
  { name: 'Bridgewater Associates', cik: '0001350694', context: 'Institutional manager filing; not a live individual portfolio' },
  { name: 'Citadel Advisors', cik: '0001423053', context: 'Ken Griffin-associated institutional manager filing' },
  { name: 'Appaloosa LP', cik: '0001656456', context: 'David Tepper-associated institutional manager filing' },
  { name: 'Tiger Global Management', cik: '0001167483', context: 'Chase Coleman-associated institutional manager filing' },
  { name: 'Renaissance Technologies', cik: '0001037389', context: 'Institutional manager 13F filing' },
  { name: 'Scion Asset Management', cik: '0001649339', context: 'Michael Burry-associated manager filing; subject to filing availability' },
];
const AUTOPILOT_HOLDINGS_REFERENCE = 'https://start.joinautopilot.com/blog/hedge-fund-and-wall-street-portfolios';

async function researchFetchJson(url, headers = {}, timeoutMs = 7000) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('Source returned HTTP ' + response.status);
  return response.json();
}

async function fetchAnalystResearch(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) return { status: 'unavailable', source: 'Finnhub', message: 'FINNHUB_API_KEY is not configured for server-side research.', retrievedAt: new Date().toISOString() };
  const base = 'https://finnhub.io/api/v1/stock/';
  const query = 'symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(apiKey);
  const [ratingsResult, targetsResult] = await Promise.allSettled([
    researchFetchJson(base + 'recommendation?' + query),
    researchFetchJson(base + 'price-target?' + query),
  ]);
  const ratingsRows = ratingsResult.status === 'fulfilled' && Array.isArray(ratingsResult.value) ? ratingsResult.value : [];
  const currentRatings = ratingsRows.filter(row => row && typeof row.period === 'string').sort((a, b) => String(b.period).localeCompare(String(a.period)))[0] || null;
  const targets = targetsResult.status === 'fulfilled' ? targetsResult.value : null;
  const targetMeanAvailable = targets?.targetMean != null && Number.isFinite(Number(targets.targetMean)) && Number(targets.targetMean) > 0;
  const targetMedianAvailable = targets?.targetMedian != null && Number.isFinite(Number(targets.targetMedian)) && Number(targets.targetMedian) > 0;
  const targetUpdatedAt = Date.parse(String(targets?.lastUpdated || ''));
  const targetDateValid = Number.isFinite(targetUpdatedAt) && targetUpdatedAt <= Date.now() + 86400000;
  const targetFresh = targetDateValid && Date.now() - targetUpdatedAt <= 180 * 86400000;
  const targetsUsable = Boolean(targets && targetFresh && (targetMeanAvailable || targetMedianAvailable));
  const available = Boolean(currentRatings) || targetsUsable;
  const staleTargetsOnly = Boolean(targets && (targetMeanAvailable || targetMedianAvailable) && !targetFresh && !currentRatings);
  return {
    status: available ? 'available' : staleTargetsOnly ? 'stale' : 'unavailable',
    source: 'Finnhub',
    retrievedAt: new Date().toISOString(),
    recommendationPeriod: currentRatings?.period || null,
    ratings: currentRatings ? { strongBuy: Number(currentRatings.strongBuy) || 0, buy: Number(currentRatings.buy) || 0, hold: Number(currentRatings.hold) || 0, sell: Number(currentRatings.sell) || 0, strongSell: Number(currentRatings.strongSell) || 0 } : null,
    targets: targets ? {
      low: targets.targetLow != null && Number(targets.targetLow) > 0 ? Number(targets.targetLow) : null,
      mean: targetMeanAvailable ? Number(targets.targetMean) : null,
      median: targetMedianAvailable ? Number(targets.targetMedian) : null,
      high: targets.targetHigh != null && Number(targets.targetHigh) > 0 ? Number(targets.targetHigh) : null,
      analystCount: targets.numberOfAnalysts != null && Number(targets.numberOfAnalysts) > 0 ? Number(targets.numberOfAnalysts) : null,
      lastUpdated: targets.lastUpdated || null,
      freshness: targetFresh ? 'fresh' : targetDateValid ? 'stale' : 'date_unavailable',
    } : null,
    errors: [...(ratingsResult.status === 'rejected' ? ['Rating consensus unavailable.'] : []), ...(targetsResult.status === 'rejected' ? ['Price targets unavailable.'] : [])],
    message: available ? null : staleTargetsOnly ? 'Finnhub price targets are more than 180 days old; stale targets are excluded from price-context calculations.' : 'Finnhub returned no usable ratings or fresh price targets.',
  };
}

function textTag(block, tag) {
  const match = String(block || '').match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

export function parseMeta13fPosition(xml) {
  const rows = String(xml || '').match(/<infoTable(?:\s[^>]*)?>[\s\S]*?<\/infoTable>/gi) || [];
  const matches = rows.filter(row => textTag(row, 'cusip').replace(/\s/g, '').toUpperCase() === META_CUSIP);
  if (!matches.length) return { reported: false, shares: null, marketValueUsd: null };
  let shares = 0, marketValueUsd = 0;
  for (const row of matches) {
    const amount = Number(textTag(row, 'sshPrnamt').replace(/,/g, ''));
    const valueThousands = Number(textTag(row, 'value').replace(/,/g, ''));
    if (Number.isFinite(amount)) shares += amount;
    if (Number.isFinite(valueThousands)) marketValueUsd += valueThousands * 1000;
  }
  return { reported: true, shares: Number.isFinite(shares) ? shares : null, marketValueUsd: Number.isFinite(marketValueUsd) ? marketValueUsd : null };
}

export function find13fInformationTableXmlHref(indexHtml, baseUrl) {
  const rows = String(indexHtml || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const candidates = [];
  for (const row of rows) {
    if (!/INFORMATION\s+TABLE/i.test(row)) continue;
    for (const match of row.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = match[1];
      if (/\.xml(?:[?#].*)?$/i.test(href)) candidates.push(new URL(href, baseUrl).toString());
    }
  }
  return candidates[0] || null;
}

async function fetchManagerMetaPosition(manager) {
  const ua = String(process.env.EDGAR_USER_AGENT || 'AI Infra Watch/1.0 (research; contact: configured-admin@example.com)');
  try {
    const submissions = await researchFetchJson('https://data.sec.gov/submissions/CIK' + manager.cik + '.json', { 'User-Agent': ua, Accept: 'application/json' }, 2500);
    const recent = submissions?.filings?.recent;
    if (!recent) throw new Error('No recent SEC submissions');
    const filings = [];
    for (let i = 0; i < (recent.form || []).length; i++) {
      if (recent.form[i] !== '13F-HR' || !recent.accessionNumber?.[i] || !recent.filingDate?.[i]) continue;
      filings.push({ accession: recent.accessionNumber[i], filingDate: recent.filingDate[i], reportDate: recent.reportDate?.[i] || null });
    }
    filings.sort((a, b) => String(b.filingDate).localeCompare(String(a.filingDate)));
    const filing = filings[0];
    if (!filing) throw new Error('No original 13F-HR filing found');
    const accessionPath = filing.accession.replaceAll('-', '');
    const baseUrl = 'https://www.sec.gov/Archives/edgar/data/' + Number(manager.cik) + '/' + accessionPath + '/';
    const indexResponse = await fetch(baseUrl + filing.accession + '-index.html', { headers: { 'User-Agent': ua, Accept: 'text/html' }, signal: AbortSignal.timeout(2500) });
    if (!indexResponse.ok) throw new Error('SEC filing index returned HTTP ' + indexResponse.status);
    const indexHtml = await indexResponse.text();
    const infoHref = find13fInformationTableXmlHref(indexHtml, baseUrl);
    if (!infoHref) throw new Error('SEC XML information table link not found');
    const tableResponse = await fetch(infoHref, { headers: { 'User-Agent': ua, Accept: 'application/xml, text/html' }, signal: AbortSignal.timeout(3500) });
    if (!tableResponse.ok) throw new Error('SEC information table returned HTTP ' + tableResponse.status);
    const position = parseMeta13fPosition(await tableResponse.text());
    return {
      ...manager, ...position, reportDate: filing.reportDate, filingDate: filing.filingDate,
      filingUrl: baseUrl + filing.accession + '-index.html', source: 'SEC EDGAR Form 13F-HR',
      status: position.reported ? 'reported_in_filing' : 'not_listed_in_latest_filing',
    };
  } catch (error) {
    return { ...manager, status: 'unavailable', reported: null, shares: null, marketValueUsd: null, reportDate: null, filingDate: null, filingUrl: null, source: 'SEC EDGAR', message: String(error?.message || error) };
  }
}

async function fetchResearchPrice(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?range=5d&interval=1d';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ai-infra-watch/1.0' },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error('Yahoo Finance returned HTTP ' + response.status);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close;
  const valid = Array.isArray(closes) ? closes.filter(Number.isFinite) : [];
  const price = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : valid.at(-1);
  if (!(price > 0)) throw new Error('No current reference price available');
  return {
    price,
    retrievedAt: new Date().toISOString(),
    marketTime: Number.isFinite(Number(meta?.regularMarketTime))
      ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
      : null,
    source: 'Yahoo Finance chart endpoint',
  };
}

async function fetchReentryResearch(symbol) {
  const cacheKey = String(symbol).toUpperCase();
  const cached = RESEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 15 * 60 * 1000) return { ...cached.data, cached: true };
  const [analyst, managers, quote] = await Promise.all([
    fetchAnalystResearch(cacheKey).catch(error => ({ status: 'unavailable', source: 'Finnhub', message: String(error?.message || error), retrievedAt: new Date().toISOString() })),
    cacheKey === 'META' ? Promise.all(TRACKED_MANAGERS.map(fetchManagerMetaPosition)) : Promise.resolve([]),
    fetchResearchPrice(cacheKey).catch(error => ({ price: null, retrievedAt: new Date().toISOString(), source: null, error: String(error?.message || error) })),
  ]);
  const targetMean = analyst?.targets?.mean;
  const targetMedian = analyst?.targets?.median;
  const currentPrice = Number.isFinite(Number(quote?.price)) && Number(quote.price) > 0 ? Number(quote.price) : null;
  const priceContext = {
    currentPrice,
    quoteSource: currentPrice ? 'Yahoo Finance chart endpoint' : null,
    quoteRetrievedAt: quote?.retrievedAt || null,
    meanTargetUpsidePct: currentPrice && Number.isFinite(targetMean) && targetMean > 0 ? Number(((targetMean / currentPrice - 1) * 100).toFixed(2)) : null,
    medianTargetUpsidePct: currentPrice && Number.isFinite(targetMedian) && targetMedian > 0 ? Number(((targetMedian / currentPrice - 1) * 100).toFixed(2)) : null,
  };
  const data = {
    ok: true, symbol: cacheKey, requestedAt: new Date().toISOString(), analyst, priceContext,
    institutionalHoldings: {
      status: cacheKey === 'META' ? 'available' : 'unsupported_symbol',
      message: cacheKey === 'META' ? null : 'Institutional 13F matching is currently configured only for META; no other ticker is inferred from META filings.',
      source: 'SEC EDGAR Form 13F-HR',
      asOfMeaning: 'Positions are as of the reported quarter-end, not live holdings. Filings may arrive up to 45 days after quarter-end.',
      autopilotReference: AUTOPILOT_HOLDINGS_REFERENCE, cusip: cacheKey === 'META' ? META_CUSIP : null, managers,
    },
    executionPolicy: 'Research context only. No automated trade or re-entry approval.',
  };
  RESEARCH_CACHE.set(cacheKey, { cachedAt: Date.now(), data });
  return data;
}


function assess(row,q) {
  const targetReached=q.price<=Number(row.target_price);
  const ownershipStatus = row.ownership_status || 'sold';
  const plannedExitPrice = Number(row.planned_exit_price || row.sale_price || 0);
  const upperReviewPrice = Number(row.upper_review_price || 0);
  const trendConfirmed=q.price>=q.sma20 && q.sma20>=q.sma50;
  if (ownershipStatus === 'holding') {
    if (plannedExitPrice > 0 && q.price >= plannedExitPrice) {
      return {status:'EXIT_REVIEW',reasons:['Price reached your planned exit-review level of $'+plannedExitPrice.toFixed(2)+'. This is a review alert, not an automatic sell.','Check position size, valuation, taxes, earnings timing and the updated business thesis before deciding.']};
    }
    return {status:'HOLDING',reasons:[plannedExitPrice > 0 ? 'Still holding. Planned exit review starts at $'+plannedExitPrice.toFixed(2)+'.' : 'Still holding. Set a planned exit-review price if you want a price-triggered reminder.']};
  }
  if(row.thesis_invalidated) return {status:'NOT_READY',reasons:['Saved thesis is marked invalidated; a lower price is not a buy signal.']};
  if (upperReviewPrice > 0 && q.price >= upperReviewPrice && String(row.thesis||'').trim()) {
    return {status:'EVIDENCE_REVIEW_REQUIRED',reasons:['Price is at or above your upper review level of $'+upperReviewPrice.toFixed(2)+'.','Consolidate fresh company evidence, valuation, analyst target dispersion and dated institutional filings before considering re-entry.','An upward move is not itself a buy signal; any action remains manual.']};
  }
  if(targetReached && trendConfirmed && String(row.thesis||'').trim()) return {status:'REENTRY_CANDIDATE',reasons:['Price is at or below your saved lower re-entry target.','Price is above the 20-day average and the 20-day average is above the 50-day average.','Review fresh valuation, earnings, analyst consensus, dated institutional disclosures and portfolio risk before acting.']};
  if(targetReached) return {status:'WATCH_ENTRY',reasons:['Lower re-entry price reached, but trend confirmation or saved thesis is missing.','Review fresh company and market evidence before considering any action.']};
  return {status:'NOT_READY',reasons:['Price remains above your lower re-entry target and below the upper evidence-review threshold.']};
}
export function telegramAccepted(httpOk, payload) {
  return httpOk === true && payload?.ok === true && Number.isInteger(payload?.result?.message_id) && payload.result.message_id > 0;
}

/** Notify only on entry into the candidate state; a failed send leaves persisted state unchanged for retry. */
export function shouldNotifyCandidate(lastAlertSignature, candidate) {
  return candidate === true && lastAlertSignature !== 'REENTRY_CANDIDATE';
}

const NOTIFIABLE_STATES = new Set(['EXIT_REVIEW', 'WATCH_ENTRY', 'REENTRY_CANDIDATE', 'EVIDENCE_REVIEW_REQUIRED']);
export function shouldNotifySignal(lastAlertSignature, nextStatus) {
  return NOTIFIABLE_STATES.has(nextStatus) && lastAlertSignature !== nextStatus;
}

export function buildDeliveryKey(row) {
  // updated_at is the persisted episode seed: retries before a state transition
  // reuse the same key, while a later candidate episode after a non-candidate
  // scan gets a new key because that scan persists a new updated_at.
  const keyMaterial=[
    String(row?.symbol||'').toUpperCase(),
    String(row?.target_price??''),
    String(row?.sale_date||''),
    String(row?.thesis||''),
    String(row?.ownership_status||'sold'),
    String(row?.planned_exit_price??''),
    String(row?.upper_review_price??''),
    String(row?.updated_at||''),
  ].join('|');
  return createHash('sha256').update(keyMaterial).digest('hex');
}

/**
 * One automatic attempt protected by a durable unique claim.
 * Failure after send retains the returned message ID in evidence. A claimed key
 * is never auto-reclaimed; ambiguous cases require reconciliation to avoid duplicates.
 */
export async function sendOnceWithDurableClaim({ claim, send, recordAccepted, recordFailure }) {
  const claimed = await claim();
  if (claimed !== true) {
    return { status: 'existing_claim_suppressed', messageId: null, attempted: false, deliveryRecordPersisted: null };
  }

  let messageId = null;
  try {
    messageId = await send();
  } catch (error) {
    const status = error?.deliveryStatus === 'rejected' ? 'rejected' : 'uncertain';
    let deliveryRecordPersisted = false;
    try {
      const recorded = await recordFailure(status, null, String(error?.message || error));
      if (recorded !== true) throw new Error('Delivery failure state update was not confirmed');
      deliveryRecordPersisted = true;
    } catch {
      // The original durable claim remains in "sending", suppressing automatic retries.
    }
    return {
      status,
      messageId: null,
      attempted: true,
      deliveryRecordPersisted,
      error: String(error?.message || error),
      reconciliationRequired: status === 'uncertain' || !deliveryRecordPersisted,
    };
  }

  try {
    const recorded = await recordAccepted(messageId);
    if (recorded !== true) throw new Error('Telegram acceptance state update was not confirmed');
    return { status: 'accepted', messageId, attempted: true, deliveryRecordPersisted: true };
  } catch (error) {
    const message = String(error?.message || error);
    let deliveryRecordPersisted = false;
    try {
      // We know Telegram returned this ID. Preserve it even while marking the DB outcome uncertain.
      const recorded = await recordFailure('uncertain', messageId, message);
      if (recorded !== true) throw new Error('Uncertain delivery state update was not confirmed');
      deliveryRecordPersisted = true;
    } catch {
      // The claim remains durable if the database update cannot be confirmed.
    }
    return {
      status: 'accepted_state_persistence_failed',
      messageId,
      attempted: true,
      deliveryRecordPersisted,
      error: message,
      reconciliationRequired: true,
    };
  }
}

export function classifyScan({ activeRows, evaluatedRows, qualifyingCandidates, notifyEligibleCandidates, telegramSent, errors }) {
  if (activeRows === 0) return 'empty_watchlist';
  if (errors > 0) return 'completed_with_errors';
  if (notifyEligibleCandidates > 0 && telegramSent > 0) return 'telegram_delivery_confirmed';
  if (notifyEligibleCandidates > 0) return 'candidate_not_delivered';
  if (evaluatedRows === activeRows && qualifyingCandidates === 0) return 'evaluated_no_qualifying_candidate';
  if (evaluatedRows === activeRows) return 'evaluated_existing_candidate_no_new_alert';
  return 'incomplete_scan';
}

async function sendTelegram(row,q,signal=assess(row,q)) {
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim(), chat=String(process.env.TELEGRAM_CHAT_ID||'').trim();
  if(!token||!chat) throw new Error('Telegram credentials are not configured');
  const message=['🔔 AI Infra Watch · Re-entry / Exit Review','',row.symbol+' · '+signal.status,'Latest price: $'+q.price.toFixed(2),'Lower re-entry target: $'+Number(row.target_price).toFixed(2),'Planned exit review: '+(Number(row.planned_exit_price)>0?'$'+Number(row.planned_exit_price).toFixed(2):'not set'),'Upper evidence review: '+(Number(row.upper_review_price)>0?'$'+Number(row.upper_review_price).toFixed(2):'not set'),'20-day average: $'+q.sma20.toFixed(2),'50-day average: $'+q.sma50.toFixed(2),'52-week high drawdown: '+(q.drawdownFrom52WeekHighPct==null?'unavailable':q.drawdownFrom52WeekHighPct.toFixed(1)+'%'),'Saved thesis: '+String(row.thesis||'not recorded'),'','Why this alert: '+signal.reasons.join(' ')+ '','Before acting, re-check current valuation, earnings, analyst consensus, latest disclosed institutional holdings, and portfolio concentration.','Review alert only — no automatic buy/sell instruction.'].join('\n');
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:message}),signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) {
    const error = new Error('Telegram delivery rejected: HTTP '+response.status);
    error.deliveryStatus = 'rejected';
    throw error;
  }
  if(!telegramAccepted(response.ok,payload)) {
    const error = new Error('Telegram API did not confirm message acceptance');
    error.deliveryStatus = 'rejected';
    throw error;
  }
  return payload.result.message_id;
}
async function runScan() {
  const rows=await db('reentry_watchlist?active=eq.true&select=*');
  const results=[]; let sent=0; let qualifyingCandidates=0; let notifyEligibleCandidates=0; const errors=[]; const deliveryEvidence=[];
  for(const row of Array.isArray(rows)?rows:[]) {
    let acceptedMessageId = null;
    try {
      const q=await quoteHistory(row.symbol), signal=assess(row,q);
      const candidate=signal.status==='REENTRY_CANDIDATE';
      if (candidate) qualifyingCandidates++;
      const notifyEligible = shouldNotifySignal(row.last_alert_signature, signal.status);
      if (notifyEligible) notifyEligibleCandidates++;
      if(notifyEligible) {
        const chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();
        if(!chatId) throw new Error('Telegram chat ID is not configured');
        // One notification per configured thesis/target episode. Existing claims are never auto-retried.
        const deliveryKey=buildDeliveryKey(row);
        const delivery=await sendOnceWithDurableClaim({
          claim: async () => db('rpc/claim_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_symbol:row.symbol,p_chat_id:chatId})}),
          send: async () => sendTelegram(row,q,signal),
          recordAccepted: async (messageId) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:'accepted',p_message_id:messageId,p_error:null})}),
          recordFailure: async (status,messageId,error) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:status,p_message_id:messageId,p_error:error})}),
        });
        deliveryEvidence.push({symbol:row.symbol,...delivery,statePersisted:false});
        if(delivery.status==='accepted') {
          acceptedMessageId=delivery.messageId;
          sent++;
        } else if(delivery.status==='accepted_state_persistence_failed') {
          acceptedMessageId=delivery.messageId;
          sent++;
          throw new Error('Telegram accepted message ID '+delivery.messageId+', but delivery-state persistence is unconfirmed; automatic duplicate sends are suppressed pending reconciliation.');
        } else if(delivery.status==='rejected' || delivery.status==='uncertain') {
          throw new Error('Telegram delivery '+delivery.status+': '+delivery.error);
        }
      }
      const patch={last_price:q.price,sma20:q.sma20,sma50:q.sma50,drawdown_from_52_week_high_pct:q.drawdownFrom52WeekHighPct,retrieved_at:q.retrievedAt,last_alert_signature:signal.status,updated_at:new Date().toISOString()};
      await db('reentry_watchlist?symbol=eq.'+encodeURIComponent(row.symbol),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
      if (acceptedMessageId) {
        const evidence = deliveryEvidence.find(item => item.symbol === row.symbol && item.messageId === acceptedMessageId);
        if (evidence) evidence.statePersisted = true;
      }
      results.push({...row,...patch,status:signal.status,reasons:signal.reasons});
    } catch(e) {
      const detail = String(e?.message||e);
      const deliveryNote = acceptedMessageId
        ? ' Telegram accepted message ID '+acceptedMessageId+'; the durable notification claim suppresses automatic duplicate sends while state is reconciled.'
        : '';
      errors.push(row.symbol+': '+detail+deliveryNote);
      results.push({...row,status:'INSUFFICIENT_DATA',reasons:[acceptedMessageId
        ? 'Telegram returned accepted message ID '+acceptedMessageId+'. Delivery-state reconciliation is required; automatic duplicate sends remain suppressed by the durable claim.'
        : 'Could not refresh quote/history or persist the scan; alert delivery was not confirmed.']});
    }
  }
  const summary = { activeRows: Array.isArray(rows) ? rows.length : 0, evaluatedRows: results.length, qualifyingCandidates, notifyEligibleCandidates, telegramSent: sent, errors: errors.length };
  return {ok:errors.length===0,scanStatus:classifyScan(summary),...summary,errors,deliveryEvidence,items:results};
}
function publicRow(row) {
  return {symbol:row.symbol,ownershipStatus:row.ownership_status||'sold',salePrice:row.sale_price==null?null:Number(row.sale_price),saleDate:row.sale_date||null,plannedExitPrice:row.planned_exit_price==null?null:Number(row.planned_exit_price),upperReviewPrice:row.upper_review_price==null?null:Number(row.upper_review_price),targetPrice:Number(row.target_price),thesis:row.thesis||'',thesisInvalidated:Boolean(row.thesis_invalidated),active:Boolean(row.active),lastPrice:row.last_price==null?null:Number(row.last_price),sma20:row.sma20==null?null:Number(row.sma20),sma50:row.sma50==null?null:Number(row.sma50),drawdownFrom52WeekHighPct:row.drawdown_from_52_week_high_pct==null?null:Number(row.drawdown_from_52_week_high_pct),retrievedAt:row.retrieved_at||null,status:row.status||'INSUFFICIENT_DATA',reasons:row.reasons||['Refresh market data for a current assessment.']};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const cron=await isCron(req);
  if(cron && req.method==='GET' && String(req.query?.run||'')==='true') {
    try { return res.status(200).json(await runScan()); }
    catch(e) { return res.status(500).json({ok:false,error:String(e?.message||e)}); }
  }
  if(!requireAccess(req,res)) return;
  try {
    if(req.method==='GET' && String(req.query?.research||'')==='true') {
      const symbol=String(req.query?.symbol||'META').trim().toUpperCase();
      if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) return res.status(400).json({ok:false,error:'Valid ticker is required for research.'});
      return res.status(200).json(await fetchReentryResearch(symbol));
    }
    if(req.method==='GET') {
      let rows=await db('reentry_watchlist?select=*&order=symbol.asc');
      if(String(req.query?.refresh||'')==='true') {
        const refreshed=await runScan();
        rows=refreshed.items;
      }
      return res.status(200).json({ok:true,items:(Array.isArray(rows)?rows:[]).map(publicRow)});
    }
    if(req.method==='POST') {
      const symbol=String(req.body?.symbol||'').trim().toUpperCase(), target=Number(req.body?.targetPrice);
      const thesis=String(req.body?.thesis||'').trim().slice(0,1200);
      if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!(target>0)||!Number.isFinite(target)) return res.status(400).json({ok:false,error:'Valid ticker and positive target price are required.'});
      const salePrice=req.body?.salePrice==null||req.body?.salePrice===''?null:Number(req.body.salePrice);
      const ownershipStatus=req.body?.ownershipStatus==='holding'?'holding':'sold';
      const plannedExit=Number(req.body?.plannedExitPrice);
      const upperReview=Number(req.body?.upperReviewPrice);
      const saleDateInput=String(req.body?.saleDate||'');
      if (ownershipStatus === 'sold' && (!(salePrice > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(saleDateInput))) return res.status(400).json({ok:false,error:'Enter the actual sale price and sale date before enabling sold-stock re-entry monitoring.'});
      if ((req.body?.plannedExitPrice!=null && req.body?.plannedExitPrice!=='' && (!(plannedExit>0)||!Number.isFinite(plannedExit))) || (req.body?.upperReviewPrice!=null && req.body?.upperReviewPrice!=='' && (!(upperReview>0)||!Number.isFinite(upperReview)))) return res.status(400).json({ok:false,error:'Exit and upper review prices must be positive numbers when set.'});
      const payload={symbol,ownership_status:ownershipStatus,sale_price:ownershipStatus==='sold'&&Number.isFinite(salePrice)&&salePrice>0?salePrice:null,sale_date:ownershipStatus==='sold'&&/^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.saleDate||''))?String(req.body.saleDate):null,planned_exit_price:Number.isFinite(plannedExit)&&plannedExit>0?plannedExit:null,upper_review_price:Number.isFinite(upperReview)&&upperReview>0?upperReview:null,target_price:target,thesis,thesis_invalidated:Boolean(req.body?.thesisInvalidated),active:req.body?.active!==false,updated_at:new Date().toISOString()};
      const saved=await db('reentry_watchlist?on_conflict=symbol',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
      return res.status(200).json({ok:true,item:publicRow(saved?.[0]||payload)});
    }
    if(req.method==='DELETE') {
      const symbol=String(req.body?.symbol||'').trim().toUpperCase();
      if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) return res.status(400).json({ok:false,error:'Valid ticker is required.'});
      await db('reentry_watchlist?symbol=eq.'+encodeURIComponent(symbol),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return res.status(200).json({ok:true,deleted:symbol});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  } catch(e) { return res.status(500).json({ok:false,error:String(e?.message||e)}); }
}
