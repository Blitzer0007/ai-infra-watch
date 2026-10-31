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

function newYorkMarketDateKey(epochMs) {
  const instant = new Date(epochMs);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return values.year && values.month && values.day ? values.year + '-' + values.month + '-' + values.day : null;
}

export function calculateReentryIndicators({ price, closes, adjustedCloses, timestamps, regularMarketTime, regularSessionEnd }) {
  const livePrice = Number(price);
  if (!(livePrice > 0) || !Number.isFinite(livePrice)) {
    throw new Error('Invalid live quote for re-entry indicators');
  }
  if (!Array.isArray(closes) || !Array.isArray(adjustedCloses) || !Array.isArray(timestamps) ||
      closes.length === 0 || closes.length !== adjustedCloses.length || closes.length !== timestamps.length) {
    throw new Error('Aligned raw, adjusted, and timestamped daily history is required for re-entry indicators');
  }

  const quoteEpoch = Number(regularMarketTime);
  if (!Number.isFinite(quoteEpoch) || quoteEpoch <= 0) {
    throw new Error('A valid market timestamp is required to identify completed re-entry bars');
  }
  const quoteEpochMs = quoteEpoch * 1000;
  const quoteDay = newYorkMarketDateKey(quoteEpochMs);
  if (!quoteDay) throw new Error('Invalid market date for re-entry indicators');

  const rows = [];
  const seenEpochs = new Set();
  const seenDays = new Set();
  for (let index = 0; index < closes.length; index += 1) {
    const rawClose = Number(closes[index]);
    // Yahoo includes null closes for non-trading gaps. Those are not market bars.
    if (!Number.isFinite(rawClose) || rawClose <= 0) continue;

    const timestamp = Number(timestamps[index]);
    const adjustedClose = Number(adjustedCloses[index]);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      throw new Error('A valid timestamp is required for every raw daily close');
    }
    if (!Number.isFinite(adjustedClose) || adjustedClose <= 0) {
      throw new Error('Complete split/dividend-adjusted coverage is required for every raw daily close');
    }
    if (seenEpochs.has(timestamp)) {
      throw new Error('Duplicate daily bar timestamps were returned');
    }
    const day = newYorkMarketDateKey(timestamp * 1000);
    if (!day) throw new Error('Invalid daily bar timestamp was returned');
    if (seenDays.has(day)) {
      throw new Error('Duplicate New York market dates were returned');
    }
    if (day > quoteDay) {
      throw new Error('Future daily bars are not valid for the current market quote');
    }
    seenEpochs.add(timestamp);
    seenDays.add(day);
    rows.push({ timestamp, day, rawClose, adjustedClose });
  }
  rows.sort((left, right) => left.timestamp - right.timestamp);

  // A daily chart timestamp is normally the session open, not the bar close.
  // Therefore a same-day row is completed only when Yahoo's actual regular
  // session end for that same New York date has passed.
  const sessionEnd = Number(regularSessionEnd);
  const sessionEndDay = Number.isFinite(sessionEnd) && sessionEnd > 0
    ? newYorkMarketDateKey(sessionEnd * 1000)
    : null;
  const sameDayBarCompleted = sessionEndDay === quoteDay && quoteEpoch >= sessionEnd;
  const completed = rows.filter(row => row.day < quoteDay || (row.day === quoteDay && sameDayBarCompleted));

  if (completed.length < 50) {
    throw new Error('At least 50 complete aligned adjusted daily bars are required');
  }
  const lastCompleted = completed.at(-1);
  const adjustmentFactor = lastCompleted.adjustedClose / lastCompleted.rawClose;
  if (!(adjustmentFactor > 0) || !Number.isFinite(adjustmentFactor)) {
    throw new Error('Invalid adjusted-close factor for re-entry indicators');
  }

  const adjustedSeries = completed.map(row => row.adjustedClose);
  const average = count => {
    const sample = adjustedSeries.slice(-count);
    if (sample.length !== count) throw new Error('Insufficient adjusted bars for re-entry indicators');
    return sample.reduce((sum, value) => sum + value, 0) / count;
  };
  const high = Math.max(...adjustedSeries);
  const adjustedLivePrice = livePrice * adjustmentFactor;
  return {
    price: livePrice,
    sma20: average(20),
    sma50: average(50),
    drawdownFrom52WeekHighPct: high > 0 ? (high - adjustedLivePrice) / high * 100 : null,
    priceBasis: 'split_dividend_adjusted_close',
    adjustmentReferenceDate: lastCompleted.day,
    adjustmentFactor,
    adjustedPointCount: completed.length,
    rawPointCount: completed.length,
  };
}

async function quoteHistory(symbol) {
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1y&interval=1d';
  const response=await fetch(url,{headers:{'User-Agent':'ai-infra-watch/1.0'},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('Market quote unavailable for '+symbol);
  const body=await response.json(), result=body?.chart?.result?.[0];
  const meta=result?.meta;
  const timestamps=result?.timestamp;
  const closes=result?.indicators?.quote?.[0]?.close;
  const adjustedCloses=result?.indicators?.adjclose?.[0]?.adjclose;
  if(!meta || !Array.isArray(timestamps) || !Array.isArray(closes) || !Array.isArray(adjustedCloses)) {
    throw new Error('Adjusted history unavailable for '+symbol);
  }
  const lastValidRaw=closes.map(Number).filter(v=>Number.isFinite(v)&&v>0).at(-1);
  const price=Number(meta.regularMarketPrice || lastValidRaw);
  const regularMarketTime=meta.regularMarketTime == null ? NaN : Number(meta.regularMarketTime);
  const regularPeriod=meta.currentTradingPeriod?.regular;
  const regularSessionEnd=regularPeriod?.end == null ? NaN : Number(regularPeriod.end);
  const indicators=calculateReentryIndicators({
    price,
    closes,
    adjustedCloses,
    timestamps,
    regularMarketTime,
    regularSessionEnd,
  });
  const marketTime = Number.isFinite(regularMarketTime) && regularMarketTime > 0
    ? new Date(regularMarketTime * 1000).toISOString()
    : null;
  const sessionStart=regularPeriod?.start == null ? NaN : Number(regularPeriod.start);
  const sessionEnd=regularSessionEnd;
  const regularSession = Number.isFinite(sessionStart) && Number.isFinite(sessionEnd) && sessionStart > 0 && sessionEnd > sessionStart
    ? { start: sessionStart, end: sessionEnd }
    : null;
  return {...indicators,retrievedAt:new Date().toISOString(),marketTime,regularSession};
}

function newYorkClockParts(value) {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

/** True only during the regular US equity session; the quote-date check separately rejects holidays/stale prices. */
export function isRegularUsEquitySession(now = new Date()) {
  const parts = newYorkClockParts(now);
  if (!parts || parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return Number.isFinite(minuteOfDay) && minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60;
}

export function isSameNewYorkMarketDate(marketTime, now = new Date()) {
  if (!marketTime) return false;
  const quote = newYorkClockParts(marketTime);
  const current = newYorkClockParts(now);
  return Boolean(quote && current && quote.year === current.year && quote.month === current.month && quote.day === current.day);
}

/** Prevent off-hours/manual refreshes or stale holiday quotes from sending notifications. */
export function hasValidRegularSessionBounds(regularSession) {
  const start = regularSession?.start == null ? NaN : Number(regularSession.start);
  const end = regularSession?.end == null ? NaN : Number(regularSession.end);
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > start;
}

export function isWithinRegularSessionBounds(regularSession, now = new Date()) {
  if (!hasValidRegularSessionBounds(regularSession)) return false;
  const start = Number(regularSession.start);
  const end = Number(regularSession.end);
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(instant) && instant >= start * 1000 && instant < end * 1000;
}

export function canSendReentryNotification(marketTime, now = new Date(), allowScheduledRun = false, regularSession = null) {
  return allowScheduledRun === true
    && isRegularUsEquitySession(now)
    && isSameNewYorkMarketDate(marketTime, now)
    && isWithinRegularSessionBounds(regularSession, now);
}

/** A deferred notification must retain the previous signature so the next eligible session can send it once. */
export function resolveLastAlertSignature(previousSignature, nextStatus, notificationDeferred = false) {
  return notificationDeferred ? (previousSignature ?? null) : nextStatus;
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

const BILLIONAIRE_ASSOCIATED_FUNDS = [
  { name: 'Berkshire Hathaway', aliases: ['BERKSHIRE HATHAWAY'], context: 'Warren Buffett-associated manager; this is the firm’s disclosed portfolio, not Buffett’s personal account.' },
  { name: 'Pershing Square Capital Management', aliases: ['PERSHING SQUARE CAPITAL MANAGEMENT', 'PERSHING SQUARE'], context: 'Bill Ackman-associated fund manager.' },
  { name: 'Bridgewater Associates', aliases: ['BRIDGEWATER ASSOCIATES'], context: 'Ray Dalio-founded manager; reported firm holdings, not a personal portfolio.' },
  { name: 'Citadel Advisors', aliases: ['CITADEL ADVISORS'], context: 'Ken Griffin-associated institutional manager.' },
  { name: 'Appaloosa LP', aliases: ['APPALOOSA', 'APPALOOSA LP'], context: 'David Tepper-associated fund manager.' },
  { name: 'Tiger Global Management', aliases: ['TIGER GLOBAL MANAGEMENT', 'TIGER GLOBAL'], context: 'Chase Coleman-associated investment manager.' },
  { name: 'Renaissance Technologies', aliases: ['RENAISSANCE TECHNOLOGIES'], context: 'Institutional investment manager; association is to the firm, not a current personal holding.' },
  { name: 'Scion Asset Management', aliases: ['SCION ASSET MANAGEMENT', 'SCION'], context: 'Michael Burry-associated investment manager.' },
];
function normalizeFundName(value) {
  return String(value || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').trim()
    .replace(/\b(INCORPORATED|INC|CORPORATION|CORP|LIMITED|LTD|LLC|LP|L P|LLP|PLC|CO|COMPANY)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function associatedManager(name) {
  const normalized = normalizeFundName(name);
  return BILLIONAIRE_ASSOCIATED_FUNDS.find(manager =>
    manager.aliases.some(alias => normalized === normalizeFundName(alias) || normalized.startsWith(normalizeFundName(alias) + ' '))
  ) || null;
}
export function normalizeFundOwnership(symbol, payload) {
  const raw = Array.isArray(payload?.ownership) ? payload.ownership : [];
  const funds = raw.filter(row => row && typeof row.name === 'string' && row.name.trim()).map(row => {
    const matched = associatedManager(row.name);
    return {
      name: row.name.trim(),
      shares: row.share != null && Number.isFinite(Number(row.share)) ? Number(row.share) : null,
      shareChange: row.change != null && Number.isFinite(Number(row.change)) ? Number(row.change) : null,
      filingDate: row.filingDate || null,
      portfolioPercent: row.portfolioPercent != null && Number.isFinite(Number(row.portfolioPercent)) ? Number(row.portfolioPercent) : null,
      billionaireAssociation: matched ? matched.name : null,
      context: matched?.context || 'Institutional/fund ownership record returned by Finnhub; no billionaire association asserted.',
      source: 'Finnhub fund-ownership',
    };
  });
  const associated = funds.filter(row => row.billionaireAssociation);
  return {
    symbol: String(symbol || '').toUpperCase(),
    source: 'Finnhub fund-ownership',
    retrievedAt: new Date().toISOString(),
    status: funds.length ? 'available' : 'no_records_returned',
    funds,
    billionaireAssociatedFunds: associated,
    message: funds.length
      ? null
      : 'Finnhub returned no fund ownership rows for this ticker. This is not proof that the stock has no institutional or billionaire-associated holders.',
  };
}
async function fetchFundOwnership(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) return {
    symbol, source: 'Finnhub fund-ownership', status: 'unavailable', funds: [], billionaireAssociatedFunds: [],
    retrievedAt: new Date().toISOString(), message: 'FINNHUB_API_KEY is not configured for server-side research.',
  };
  const query = new URLSearchParams({ symbol, limit: '100', token: apiKey });
  try {
    const payload = await researchFetchJson('https://finnhub.io/api/v1/stock/fund-ownership?' + query.toString(), {}, 7000);
    return normalizeFundOwnership(symbol, payload);
  } catch (error) {
    return {
      symbol, source: 'Finnhub fund-ownership', status: 'unavailable', funds: [], billionaireAssociatedFunds: [],
      retrievedAt: new Date().toISOString(), message: String(error?.message || error),
    };
  }
}


async function researchFetchJson(url, headers = {}, timeoutMs = 7000) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('Source returned HTTP ' + response.status);
  return response.json();
}

export function normalizeAnalystResearch(ratingsRows, targets, nowMs = Date.now()) {
  const currentRatings = (Array.isArray(ratingsRows) ? ratingsRows : [])
    .filter(row => row && typeof row.period === 'string')
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0] || null;
  const periodText = String(currentRatings?.period || '');
  const isMonthPeriod = periodText.length === 7 && periodText[4] === '-' &&
    Number.isInteger(Number(periodText.slice(0, 4))) &&
    Number.isInteger(Number(periodText.slice(5, 7))) &&
    Number(periodText.slice(5, 7)) >= 1 && Number(periodText.slice(5, 7)) <= 12;
  const ratingsUpdatedAt = isMonthPeriod
    ? Date.parse(periodText + '-01T00:00:00.000Z')
    : Date.parse(periodText);
  const ratingsDateValid = Number.isFinite(ratingsUpdatedAt) && ratingsUpdatedAt <= nowMs + 86400000;
  const ratingsFresh = Boolean(currentRatings && ratingsDateValid && nowMs - ratingsUpdatedAt <= 180 * 86400000);
  const usableRatings = Boolean(currentRatings && ratingsFresh);

  const targetMeanAvailable = targets?.targetMean != null && Number.isFinite(Number(targets.targetMean)) && Number(targets.targetMean) > 0;
  const targetMedianAvailable = targets?.targetMedian != null && Number.isFinite(Number(targets.targetMedian)) && Number(targets.targetMedian) > 0;
  const targetUpdatedAt = Date.parse(String(targets?.lastUpdated || ''));
  const targetDateValid = Number.isFinite(targetUpdatedAt) && targetUpdatedAt <= nowMs + 86400000;
  const targetFresh = targetDateValid && nowMs - targetUpdatedAt <= 180 * 86400000;
  const hasAnyTarget = Boolean(targets && (targetMeanAvailable || targetMedianAvailable));
  const targetsUsable = Boolean(targetFresh && (targetMeanAvailable || targetMedianAvailable));
  const available = usableRatings || targetsUsable;
  const staleReturnedSources = Boolean((currentRatings && !ratingsFresh) || (hasAnyTarget && !targetFresh));
  const staleOnly = !available && staleReturnedSources;
  let message = null;
  if (available && currentRatings && !ratingsFresh && targetsUsable) {
    message = 'The latest recommendation counts are stale and excluded; fresh price targets remain available.';
  } else if (available && targets && hasAnyTarget && !targetFresh) {
    message = 'Price targets are stale or lack a usable update date; they are excluded from price-context calculations.';
  } else if (staleOnly) {
    message = 'Finnhub returned analyst data, but available records are stale or lack a usable update date; stale figures are excluded from current consensus.';
  } else if (!available) {
    message = 'Finnhub returned no usable fresh ratings or price targets.';
  }

  return {
    status: available ? 'available' : staleOnly ? 'stale' : 'unavailable',
    source: 'Finnhub',
    retrievedAt: new Date(nowMs).toISOString(),
    recommendationPeriod: currentRatings?.period || null,
    ratingFreshness: !currentRatings ? 'unavailable' : ratingsFresh ? 'fresh' : ratingsDateValid ? 'stale' : 'date_unavailable',
    ratings: usableRatings ? {
      strongBuy: Number(currentRatings.strongBuy) || 0,
      buy: Number(currentRatings.buy) || 0,
      hold: Number(currentRatings.hold) || 0,
      sell: Number(currentRatings.sell) || 0,
      strongSell: Number(currentRatings.strongSell) || 0,
    } : null,
    targets: targets ? {
      low: targets.targetLow != null && Number.isFinite(Number(targets.targetLow)) && Number(targets.targetLow) > 0 ? Number(targets.targetLow) : null,
      mean: targetMeanAvailable ? Number(targets.targetMean) : null,
      median: targetMedianAvailable ? Number(targets.targetMedian) : null,
      high: targets.targetHigh != null && Number.isFinite(Number(targets.targetHigh)) && Number(targets.targetHigh) > 0 ? Number(targets.targetHigh) : null,
      analystCount: targets.numberOfAnalysts != null && Number.isFinite(Number(targets.numberOfAnalysts)) && Number(targets.numberOfAnalysts) > 0 ? Number(targets.numberOfAnalysts) : null,
      lastUpdated: targets.lastUpdated || null,
      freshness: targetFresh ? 'fresh' : targetDateValid ? 'stale' : 'date_unavailable',
    } : null,
    errors: [],
    message,
  };
}

async function fetchAnalystResearch(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) return {
    status: 'unavailable', source: 'Finnhub', ratingFreshness: 'unavailable',
    ratings: null, targets: null, errors: [],
    message: 'FINNHUB_API_KEY is not configured for server-side research.',
    retrievedAt: new Date().toISOString(),
  };
  const base = 'https://finnhub.io/api/v1/stock/';
  const query = 'symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(apiKey);
  const [ratingsResult, targetsResult] = await Promise.allSettled([
    researchFetchJson(base + 'recommendation?' + query),
    researchFetchJson(base + 'price-target?' + query),
  ]);
  const ratingsRows = ratingsResult.status === 'fulfilled' && Array.isArray(ratingsResult.value) ? ratingsResult.value : [];
  const targets = targetsResult.status === 'fulfilled' ? targetsResult.value : null;
  const normalized = normalizeAnalystResearch(ratingsRows, targets);
  const errors = [
    ...(ratingsResult.status === 'rejected' ? ['Rating consensus unavailable.'] : []),
    ...(targetsResult.status === 'rejected' ? ['Price targets unavailable.'] : []),
  ];
  return { ...normalized, errors };
}
function textTag(block, tag) {
  const match = String(block || '').match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

export function parseMeta13fPosition(xml) {
  const rows = String(xml || '').match(/<infoTable(?:\s[^>]*)?>[\s\S]*?<\/infoTable>/gi) || [];
  const matches = rows.filter(row => textTag(row, 'cusip').replace(/\s/g, '').toUpperCase() === META_CUSIP);
  if (!matches.length) {
    return {
      reported: false, shares: null, marketValueUsd: null, commonStockReported: false,
      options: { call: { reported: false, reportedQuantity: null, marketValueUsd: null }, put: { reported: false, reportedQuantity: null, marketValueUsd: null } },
    };
  }

  const totals = {
    common: { count: 0, shares: 0, valueUsd: 0 },
    call: { count: 0, quantity: 0, valueUsd: 0 },
    put: { count: 0, quantity: 0, valueUsd: 0 },
  };
  const other = { count: 0, quantity: 0, valueUsd: 0 };
  for (const row of matches) {
    const quantity = Number(textTag(row, 'sshPrnamt').replace(/,/g, ''));
    const valueThousands = Number(textTag(row, 'value').replace(/,/g, ''));
    const valueUsd = Number.isFinite(valueThousands) ? valueThousands * 1000 : null;
    const putCall = textTag(row, 'putCall').toUpperCase();
    const amountType = textTag(row, 'sshPrnamtType').toUpperCase();
    if (putCall === 'CALL' || putCall === 'PUT') {
      const bucket = totals[putCall.toLowerCase()];
      bucket.count += 1;
      if (Number.isFinite(quantity)) bucket.quantity += quantity;
      if (valueUsd != null) bucket.valueUsd += valueUsd;
    } else if (!putCall && (!amountType || amountType === 'SH')) {
      totals.common.count += 1;
      if (Number.isFinite(quantity)) totals.common.shares += quantity;
      if (valueUsd != null) totals.common.valueUsd += valueUsd;
    } else {
      other.count += 1;
      if (Number.isFinite(quantity)) other.quantity += quantity;
      if (valueUsd != null) other.valueUsd += valueUsd;
    }
  }

  const hasCommon = totals.common.count > 0;
  const optionSummary = kind => ({
    reported: totals[kind].count > 0,
    reportedQuantity: totals[kind].count > 0 ? totals[kind].quantity : null,
    marketValueUsd: totals[kind].count > 0 ? totals[kind].valueUsd : null,
  });
  return {
    reported: true,
    commonStockReported: hasCommon,
    shares: hasCommon ? totals.common.shares : null,
    marketValueUsd: hasCommon ? totals.common.valueUsd : null,
    options: { call: optionSummary('call'), put: optionSummary('put') },
    otherReportableLines: other.count,
  };
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
    const amendments = [];
    for (let i = 0; i < (recent.form || []).length; i++) {
      const form = recent.form[i];
      if (!['13F-HR', '13F-HR/A'].includes(form) || !recent.accessionNumber?.[i] || !recent.filingDate?.[i]) continue;
      const row = { accession: recent.accessionNumber[i], filingDate: recent.filingDate[i], reportDate: recent.reportDate?.[i] || null };
      if (form === '13F-HR') filings.push(row);
      else amendments.push(row);
    }
    filings.sort((a, b) => String(b.filingDate).localeCompare(String(a.filingDate)));
    const filing = filings[0];
    if (!filing) throw new Error('No original 13F-HR filing found');
    const samePeriodAmendments = amendments.filter(row =>
      row.filingDate > filing.filingDate && (filing.reportDate ? row.reportDate === filing.reportDate : true)
    ).sort((a, b) => String(b.filingDate).localeCompare(String(a.filingDate)));
    const amendment = samePeriodAmendments[0] || null;
    const accessionPath = filing.accession.replaceAll('-', '');
    const baseUrl = 'https://www.sec.gov/Archives/edgar/data/' + Number(manager.cik) + '/' + accessionPath + '/';
    const amendmentUrl = amendment
      ? 'https://www.sec.gov/Archives/edgar/data/' + Number(manager.cik) + '/' + amendment.accession.replaceAll('-', '') + '/' + amendment.accession + '-index.html'
      : null;
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
      filingUrl: baseUrl + filing.accession + '-index.html',
      amendmentDate: amendment?.filingDate || null, amendmentUrl,
      source: 'SEC EDGAR Form 13F-HR',
      status: position.reported ? 'reported_in_filing' : 'not_listed_in_latest_filing',
    };
  } catch (error) {
    return { ...manager, status: 'unavailable', reported: null, shares: null, marketValueUsd: null, reportDate: null, filingDate: null, filingUrl: null, amendmentDate: null, amendmentUrl: null, source: 'SEC EDGAR', message: String(error?.message || error) };
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
  const [analyst, institutionalHoldings, quote] = await Promise.all([
    fetchAnalystResearch(cacheKey).catch(error => ({ status: 'unavailable', source: 'Finnhub', message: String(error?.message || error), retrievedAt: new Date().toISOString() })),
    fetchFundOwnership(cacheKey),
    fetchResearchPrice(cacheKey).catch(error => ({ price: null, retrievedAt: new Date().toISOString(), source: null, error: String(error?.message || error) })),
  ]);
  const targetMean = analyst?.targets?.freshness === 'fresh' ? analyst.targets.mean : null;
  const targetMedian = analyst?.targets?.freshness === 'fresh' ? analyst.targets.median : null;
  const currentPrice = Number.isFinite(Number(quote?.price)) && Number(quote.price) > 0 ? Number(quote.price) : null;
  const priceContext = {
    currentPrice,
    quoteSource: currentPrice ? 'Yahoo Finance chart endpoint' : null,
    quoteRetrievedAt: quote?.retrievedAt || null,
    quoteMarketTime: quote?.marketTime || null,
    meanTargetUpsidePct: currentPrice && Number.isFinite(targetMean) && targetMean > 0 ? Number(((targetMean / currentPrice - 1) * 100).toFixed(2)) : null,
    medianTargetUpsidePct: currentPrice && Number.isFinite(targetMedian) && targetMedian > 0 ? Number(((targetMedian / currentPrice - 1) * 100).toFixed(2)) : null,
  };
  const data = {
    ok: true, symbol: cacheKey, requestedAt: new Date().toISOString(), analyst, priceContext,
    institutionalHoldings: {
      ...institutionalHoldings,
      asOfMeaning: 'Fund ownership records are disclosure-based snapshots, not live positions. Filing dates describe the source record and can lag the current date; provider coverage varies by ticker.',
      billionaireAssociationNote: 'Manager associations are labels for the investment firm, not assertions about a billionaire’s personal account. A fund missing from the returned list is not proof of zero exposure.',
      autopilotReference: AUTOPILOT_HOLDINGS_REFERENCE,
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
      return {status:'EXIT_REVIEW',reasons:['Price reached your planned exit-review level of $'+plannedExitPrice.toFixed(2)+'. This is a review alert, not an automatic sell.','Consolidate fresh company evidence, current analyst consensus and dated institutional filings alongside valuation, position size, taxes and earnings timing before deciding. This is still a manual review, not an automatic sell.']};
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
export function reentryTelegramReleaseEnabled(env = process.env) {
  return String(env.REENTRY_ALERTS_ENABLED || '').trim().toLowerCase() === 'true' &&
    String(env.REENTRY_ALERTS_RELEASE_APPROVED || '').trim().toLowerCase() === 'true';
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
export async function sendOnceWithDurableClaim({ claim, inspectExistingClaim, send, recordAccepted, recordFailure }) {
  const claimed = await claim();
  if (claimed !== true) {
    let existing = null;
    if (typeof inspectExistingClaim === 'function') {
      try { existing = await inspectExistingClaim(); } catch { existing = null; }
    }
    const previousMessageId = Number(existing?.telegram_message_id);
    if (existing?.status === 'accepted' && Number.isInteger(previousMessageId) && previousMessageId > 0) {
      // Telegram accepted this episode earlier. Reconcile the watchlist state without resending.
      return {
        status: 'already_accepted',
        messageId: previousMessageId,
        attempted: false,
        deliveryRecordPersisted: true,
        priorStatus: 'accepted',
        reconciliationRequired: false,
      };
    }
    return {
      status: 'existing_claim_suppressed',
      messageId: Number.isInteger(previousMessageId) && previousMessageId > 0 ? previousMessageId : null,
      attempted: false,
      deliveryRecordPersisted: Boolean(existing),
      priorStatus: existing?.status || 'unknown',
      reconciliationRequired: true,
      error: 'An existing delivery claim prevents a new send; inspect the persisted delivery state before retrying.',
    };
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
      // The durable claim remains "sending"; do not infer rejection if persistence failed.
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
    return { status: 'accepted', messageId, attempted: true, deliveryRecordPersisted: true, reconciliationRequired: false };
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

export function classifyScan({ activeRows, evaluatedRows, qualifyingCandidates, notifyEligibleCandidates, notificationsDeferred = 0, notificationsDeferredOutsideSession = 0, notificationsDeferredNonScheduled = 0, notificationsDeferredStaleQuote = 0, notificationsDeferredMissingSession = 0, telegramSent, telegramPreviouslyAccepted = 0, errors }) {
  if (activeRows === 0) return 'empty_watchlist';
  if (errors > 0) return 'completed_with_errors';
  if (notifyEligibleCandidates > 0 && notificationsDeferred >= notifyEligibleCandidates) {
    if (notificationsDeferredNonScheduled >= notifyEligibleCandidates) return 'notifications_deferred_non_scheduled_scan';
    if (notificationsDeferredOutsideSession >= notifyEligibleCandidates) return 'notifications_deferred_outside_market_session';
    if (notificationsDeferredStaleQuote >= notifyEligibleCandidates) return 'notifications_deferred_stale_quote';
    if (notificationsDeferredMissingSession >= notifyEligibleCandidates) return 'notifications_deferred_missing_session_metadata';
    return 'notifications_deferred_by_safety_gate';
  }
  if (notificationsDeferred > 0) return 'completed_with_deferred_notifications';
  if (notifyEligibleCandidates > 0 && (telegramSent > 0 || telegramPreviouslyAccepted > 0)) return 'telegram_delivery_confirmed';
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
async function runScan({ allowNotifications = false } = {}) {
  const rows=await db('reentry_watchlist?active=eq.true&select=*');
  const results=[]; let sent=0; let previouslyAccepted=0; let qualifyingCandidates=0; let notifyEligibleCandidates=0; let notificationsDeferred=0; let notificationsDeferredOutsideSession=0; let notificationsDeferredNonScheduled=0; let notificationsDeferredStaleQuote=0; let notificationsDeferredMissingSession=0; const errors=[]; const deliveryEvidence=[];
  for(const row of Array.isArray(rows)?rows:[]) {
    let acceptedMessageId = null;
    try {
      const q=await quoteHistory(row.symbol), signal=assess(row,q);
      const candidate=signal.status==='REENTRY_CANDIDATE';
      if (candidate) qualifyingCandidates++;
      const notifyEligible = shouldNotifySignal(row.last_alert_signature, signal.status);
      const now = new Date();
      const regularSessionOpen = isRegularUsEquitySession(now);
      const quoteMarketDateValid = isSameNewYorkMarketDate(q.marketTime, now);
      const sessionBoundsPresent = hasValidRegularSessionBounds(q.regularSession);
      const actualSessionOpen = isWithinRegularSessionBounds(q.regularSession, now);
      const notificationWindowOpen = canSendReentryNotification(q.marketTime, now, allowNotifications, q.regularSession);
      if (notifyEligible) notifyEligibleCandidates++;
      if (notifyEligible && !notificationWindowOpen) {
        notificationsDeferred++;
        if (!allowNotifications) notificationsDeferredNonScheduled++;
        else if (!regularSessionOpen || (sessionBoundsPresent && !actualSessionOpen)) notificationsDeferredOutsideSession++;
        else if (!quoteMarketDateValid) notificationsDeferredStaleQuote++;
        else if (!sessionBoundsPresent) notificationsDeferredMissingSession++;
      }
      if(notifyEligible && notificationWindowOpen) {
        const chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();
        if(!chatId) throw new Error('Telegram chat ID is not configured');
        // One notification per configured thesis/target episode. Existing claims are never auto-retried.
        const deliveryKey=buildDeliveryKey(row);
        const delivery=await sendOnceWithDurableClaim({
          claim: async () => db('rpc/claim_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_symbol:row.symbol,p_chat_id:chatId})}),
          inspectExistingClaim: async () => {
            const existingRows=await db('reentry_telegram_deliveries?delivery_key=eq.'+encodeURIComponent(deliveryKey)+'&select=status,telegram_message_id,last_error&limit=1');
            return Array.isArray(existingRows) ? (existingRows[0] || null) : null;
          },
          send: async () => sendTelegram(row,q,signal),
          recordAccepted: async (messageId) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:'accepted',p_message_id:messageId,p_error:null})}),
          recordFailure: async (status,messageId,error) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:status,p_message_id:messageId,p_error:error})}),
        });
        deliveryEvidence.push({symbol:row.symbol,...delivery,statePersisted:false});
        if(delivery.status==='accepted') {
          acceptedMessageId=delivery.messageId;
          sent++;
        } else if(delivery.status==='already_accepted') {
          acceptedMessageId=delivery.messageId;
          previouslyAccepted++;
        } else if(delivery.status==='accepted_state_persistence_failed') {
          acceptedMessageId=delivery.messageId;
          sent++;
          throw new Error('Telegram accepted message ID '+delivery.messageId+', but delivery-state persistence is unconfirmed; automatic duplicate sends are suppressed pending reconciliation.');
        } else if(delivery.status==='rejected' || delivery.status==='uncertain') {
          throw new Error('Telegram delivery '+delivery.status+': '+delivery.error);
        } else if(delivery.status==='existing_claim_suppressed') {
          throw new Error('Telegram delivery claim is '+delivery.priorStatus+'; no resend occurred. Reconciliation is required before another attempt.');
        }
      }
      const patch={last_price:q.price,sma20:q.sma20,sma50:q.sma50,drawdown_from_52_week_high_pct:q.drawdownFrom52WeekHighPct,retrieved_at:q.retrievedAt,last_alert_signature:resolveLastAlertSignature(row.last_alert_signature,signal.status,notifyEligible && !notificationWindowOpen),updated_at:new Date().toISOString()};
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
  const summary = { activeRows: Array.isArray(rows) ? rows.length : 0, evaluatedRows: results.length, qualifyingCandidates, notifyEligibleCandidates, notificationsDeferred, notificationsDeferredOutsideSession, notificationsDeferredNonScheduled, notificationsDeferredStaleQuote, notificationsDeferredMissingSession, telegramSent: sent, telegramPreviouslyAccepted: previouslyAccepted, errors: errors.length };
  return {ok:errors.length===0,scanStatus:classifyScan(summary),...summary,errors,deliveryEvidence,items:results};
}
function publicRow(row) {
  return {symbol:row.symbol,ownershipStatus:row.ownership_status||'sold',salePrice:row.sale_price==null?null:Number(row.sale_price),saleDate:row.sale_date||null,plannedExitPrice:row.planned_exit_price==null?null:Number(row.planned_exit_price),upperReviewPrice:row.upper_review_price==null?null:Number(row.upper_review_price),targetPrice:Number(row.target_price),thesis:row.thesis||'',thesisInvalidated:Boolean(row.thesis_invalidated),active:Boolean(row.active),lastPrice:row.last_price==null?null:Number(row.last_price),sma20:row.sma20==null?null:Number(row.sma20),sma50:row.sma50==null?null:Number(row.sma50),drawdownFrom52WeekHighPct:row.drawdown_from_52_week_high_pct==null?null:Number(row.drawdown_from_52_week_high_pct),retrievedAt:row.retrieved_at||null,status:row.status||'INSUFFICIENT_DATA',reasons:row.reasons||['Refresh market data for a current assessment.']};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const cron=await isCron(req);
  if(cron && req.method==='GET' && String(req.query?.run||'')==='true') {
    // Two independent production approvals are required; missing values fail closed.
    if (!reentryTelegramReleaseEnabled()) {
      return res.status(200).json({ok:true,notificationsEnabled:false,scanStatus:'notifications_disabled',telegramSent:0,telegramPreviouslyAccepted:0});
    }
    try { return res.status(200).json(await runScan({ allowNotifications: true })); }
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
      let refreshResult=null;
      if(String(req.query?.refresh||'')==='true') {
        // Manual refresh evaluates and persists current market data, but never sends Telegram.
        refreshResult=await runScan({allowNotifications:false});
        rows=refreshResult.items;
      }
      return res.status(200).json({
        ok:refreshResult ? refreshResult.ok : true,
        items:(Array.isArray(rows)?rows:[]).map(publicRow),
        ...(refreshResult ? {refresh:{
          scanStatus:refreshResult.scanStatus,
          activeRows:refreshResult.activeRows,
          evaluatedRows:refreshResult.evaluatedRows,
          errors:refreshResult.errors,
        }} : {}),
      });
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
