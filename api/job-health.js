import { requireAccess } from './_access-auth.js';

const REPO = 'Blitzer0007/ai-infra-watch';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();


const ARCHIVE_BUCKET = 'aiw-private-historical-evidence';
const ARCHIVE_INDEX_LIMIT = 1000;
const ARCHIVE_PROVIDERS = [
  {
    provider: 'ohlc',
    label: 'OHLC as-of snapshots',
    description: 'Daily end-of-day snapshots; retained as candidate evidence pending separate point-in-time review.',
  },
  {
    provider: 'marketparquet',
    label: 'MarketParquet daily archive',
    description: 'Private daily full-market file; retrieval-time archive, not proof of original publication time.',
  },
  {
    provider: 'sp500-membership',
    label: 'S&P 500 membership evidence',
    description: 'Dated membership source bundle; legacy event provenance and coverage remain under review.',
  },
];

function parseArchiveTotalCount(contentRange, fallback) {
  const match = String(contentRange || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function safeArchiveArtifact(row) {
  return {
    id: row.id,
    provider: row.provider,
    artifactType: row.artifact_type,
    sha256: row.sha256,
    objectPath: row.object_path,
    retrievedAt: row.retrieved_at,
    sourceAsOf: row.source_as_of,
    marketDate: row.market_date,
    rowCount: row.row_count,
    symbolCount: row.symbol_count,
    evidenceStatus: row.evidence_status,
  };
}

export function summarizeArtifacts(rows, totalIndexedRows = Array.isArray(rows) ? rows.length : 0) {
  const validRows = Array.isArray(rows) ? rows.filter(row =>
    row && ARCHIVE_PROVIDERS.some(provider => provider.provider === row.provider)
  ) : [];
  const providers = ARCHIVE_PROVIDERS.map(provider => {
    const ownRows = validRows
      .filter(row => row.provider === provider.provider)
      .sort((a, b) => String(b.retrieved_at || '').localeCompare(String(a.retrieved_at || '')));
    const statusCounts = {};
    for (const row of ownRows) {
      const status = String(row.evidence_status || 'unknown');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return {
      ...provider,
      artifactCountInWindow: ownRows.length,
      statusCounts,
      latest: ownRows.length ? safeArchiveArtifact(ownRows[0]) : null,
    };
  });
  return {
    providers,
    recentArtifacts: validRows
      .slice()
      .sort((a, b) => String(b.retrieved_at || '').localeCompare(String(a.retrieved_at || '')))
      .slice(0, 20)
      .map(safeArchiveArtifact),
    inventoryWindow: {
      returnedRows: validRows.length,
      totalIndexedRows: Number.isFinite(totalIndexedRows) ? totalIndexedRows : validRows.length,
      capped: Number.isFinite(totalIndexedRows) && totalIndexedRows > validRows.length,
      limit: ARCHIVE_INDEX_LIMIT,
    },
    historicalGate: {
      status: 'BLOCKED',
      reason: 'Archive presence and recorded hashes do not establish historical publication timing or complete event-level membership provenance.',
    },
  };
}

async function loadHistoricalArchiveInventory() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Private archive metadata is not configured');
  const query = 'select=id,provider,artifact_type,sha256,object_path,retrieved_at,source_as_of,market_date,row_count,symbol_count,evidence_status&order=retrieved_at.desc&limit=' + ARCHIVE_INDEX_LIMIT;
  const response = await fetch(SUPABASE_URL + '/rest/v1/historical_data_artifacts?' + query, {
    headers: {
      ...supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY),
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Supabase archive metadata HTTP ' + response.status);
  const contentRange = response.headers.get('content-range');
  const rows = await response.json();
  return {
    ok: true,
    retrievedAt: new Date().toISOString(),
    source: 'Supabase private metadata index',
    bucket: ARCHIVE_BUCKET,
    ...summarizeArtifacts(rows, parseArchiveTotalCount(contentRange, Array.isArray(rows) ? rows.length : 0)),
  };
}

export function supabaseHeaders(key) {
  const headers = { apikey: key };
  // Opaque sb_secret_* keys belong in apikey only; legacy service_role JWTs also use Bearer.
  if (!String(key).startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  return headers;
}

async function supabase(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase scheduler health configuration missing');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY),
    signal: AbortSignal.timeout(6000),
  });
  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = []; }
  if (!response.ok) throw new Error('Supabase scheduler health HTTP ' + response.status);
  return data;
}

const JOBS = [
  { id:'portfolio-digest-primary', name:'Portfolio digest · primary', path:'portfolio-digest-scheduler.yml', cadence:'35 0,6,12,16 UTC' },
  { id:'portfolio-digest-fallback', name:'Portfolio digest · fallback', path:'portfolio-digest-fallback-scheduler.yml', cadence:'45 0,6,12,16 UTC' },
  { id:'server-smart-alerts', name:'Server Smart Alerts', scheduler:'Supabase Cron', path:'server-smart-alerts.yml', cadence:'every 10 minutes UTC' },
  { id:'earnings-alerts', name:'Earnings alerts', path:'earnings-alerts.yml', cadence:'08:30 Asia/Kolkata' },
  { id:'production-smoke', name:'Production Smoke', path:'production-smoke.yml', cadence:'every 6 hours at :23 UTC' },
  { id:'reentry-alerts', name:'Re-entry Telegram Alerts', path:'reentry-alerts.yml', cadence:'Every 15 minutes during US regular-session window', releaseGate:'REENTRY_ALERTS_ENABLED + REENTRY_ALERTS_RELEASE_APPROVED' },
  { id:'private-ohlc-asof-archive', name:'Private OHLC as-of archive', path:'private-ohlc-asof-archive.yml', cadence:'Weekdays at 23:30 UTC (05:00 IST next day)' },
  { id:'private-marketparquet-archive', name:'Private MarketParquet archive', path:'private-marketparquet-archive.yml', cadence:'Weekdays at 23:40 UTC (05:10 IST next day)' },
  { id:'private-sp500-membership-audit', name:'Private S&P 500 membership audit', path:'private-sp500-membership-audit.yml', cadence:'Monthly, day 1 at 04:17 UTC (09:47 IST)' },
];


export function summarizeRunTiming(run, now = Date.now(), stuckAfterMs = 5 * 60 * 1000) {
  const startedAt = Date.parse(run?.created_at || '');
  const finishedAt = Date.parse(run?.finished_at || run?.updated_at || '');
  const status = String(run?.status || '').toLowerCase();
  const terminal = ['completed', 'failed', 'failure', 'cancelled', 'timed_out', 'success'].includes(status);
  const hasFinished = Boolean(run?.finished_at) || terminal;
  const ageMs = Number.isFinite(startedAt) ? Math.max(0, Number(now) - startedAt) : null;
  const durationMs = Number.isFinite(startedAt)
    ? (hasFinished && Number.isFinite(finishedAt) ? Math.max(0, finishedAt - startedAt) : ageMs)
    : null;
  const unfinished = Number.isFinite(startedAt) && !hasFinished;
  return {
    ageMs,
    durationMs,
    unfinished,
    isStuck: unfinished && ageMs > stuckAfterMs,
  };
}


export function summarizeSupabaseSmartAlertHealth(row, now = Date.now(), staleAfterMs = 45 * 60 * 1000) {
  const configured = row?.job_configured === true;
  const active = row?.job_active === true;
  const successTime = Date.parse(row?.last_http_success_at || '');
  const latestHttpTime = Date.parse(row?.latest_http_at || '');
  const cronRunTime = Date.parse(row?.last_cron_run_at || '');
  const ageMs = Number.isFinite(successTime) ? Number(now) - successTime : null;
  const latestHttpFailedAfterSuccess =
    Number.isFinite(latestHttpTime) &&
    row?.latest_http_ok !== true &&
    (!Number.isFinite(successTime) || latestHttpTime >= successTime);

  let status = 'completed';
  if (!configured) status = 'missing';
  else if (!active) status = 'disabled';
  else if (latestHttpFailedAfterSuccess) status = 'failure';
  else if (!Number.isFinite(successTime)) status = 'no_runs';
  else if (ageMs < -60_000 || ageMs > staleAfterMs) status = 'stale';

  const toCount = value => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  const rawRuns = Array.isArray(row?.recent_runs) ? row.recent_runs : [];
  const recentRuns = rawRuns.slice(0, 12).map(run => {
    const createdAt = run?.createdAt || null;
    const updatedAt = run?.updatedAt || null;
    const started = Date.parse(createdAt || '');
    const finished = Date.parse(updatedAt || '');
    return {
      createdAt,
      updatedAt,
      status: run?.status || 'unknown',
      conclusion: run?.conclusion || null,
      durationMs: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null,
      ageMs: Number.isFinite(started) ? Math.max(0, Number(now) - started) : null,
      isStuck: false,
    };
  });

  const health = {
    jobConfigured: configured,
    jobActive: active,
    schedule: row?.job_schedule || null,
    cronRuns24h: toCount(row?.cron_runs_24h),
    cronFailures24h: toCount(row?.cron_failures_24h),
    latestHttpAt: row?.latest_http_at || null,
    latestHttpStatus: row?.latest_http_status ?? null,
    latestHttpOk: row?.latest_http_ok === true,
    latestHttpError: row?.latest_http_error || null,
    httpEvaluations6h: toCount(row?.http_evaluations_6h),
    httpFailures6h: toCount(row?.http_failures_6h),
    lastEvaluation: Number.isFinite(successTime) ? {
      checkedAt: row?.last_http_checked_at || null,
      evaluatedSymbols: toCount(row?.last_http_evaluated_symbols),
      freshQuotes: toCount(row?.last_http_fresh_quotes),
      sent: toCount(row?.last_http_sent),
    } : null,
  };

  return {
    scheduler: 'Supabase Cron',
    status,
    conclusion: status === 'completed' ? 'success' : 'failure',
    lastRunAt: Number.isFinite(cronRunTime) ? new Date(cronRunTime).toISOString() : null,
    lastRunDurationMs: recentRuns[0]?.durationMs ?? null,
    lastRunAgeMs: Number.isFinite(cronRunTime) ? Math.max(0, Number(now) - cronRunTime) : null,
    isStuck: false,
    unfinishedRunCount: 0,
    stuckRunCount: 0,
    lastSuccessAt: Number.isFinite(successTime) ? new Date(successTime).toISOString() : null,
    lastFailureAt: latestHttpFailedAfterSuccess && Number.isFinite(latestHttpTime)
      ? new Date(latestHttpTime).toISOString()
      : null,
    recentFailureCount: toCount(row?.cron_failures_24h) + toCount(row?.http_failures_6h),
    recentSkippedCount: 0,
    lastSkippedAt: null,
    nextRunAt: nextScheduledRun('server-smart-alerts', new Date(now)),
    recentRuns,
    schedulerHealth: health,
    ...(latestHttpFailedAfterSuccess ? { schedulerHealthError: health.latestHttpError || 'Latest Smart Alerts HTTP evaluation failed.' } : {}),
  };
}

function newYorkScheduleParts(value) {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function isReentrySessionPoll(candidate) {
  const parts = newYorkScheduleParts(candidate);
  if (!parts || parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return Number.isFinite(minuteOfDay) && minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60;
}

export function nextScheduledRun(id, now = new Date()) {
  const next = new Date(now);

  if (id === 'reentry-alerts') {
    // The GitHub schedule polls 13:00–20:45 UTC. This local-session filter
    // accounts for both EST and EDT and skips UTC poll slots that the workflow
    // preflight will deliberately reject before requesting an OIDC token.
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      for (let hour = 13; hour <= 20; hour += 1) {
        for (let minute = 0; minute < 60; minute += 15) {
          const candidate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0, 0));
          if (candidate > now && isReentrySessionPoll(candidate)) return candidate.toISOString();
        }
      }
    }
    return null;
  }

  if (id === 'private-ohlc-asof-archive' || id === 'private-marketparquet-archive') {
    const minute = id === 'private-ohlc-asof-archive' ? 30 : 40;
    const candidate = new Date(now);
    candidate.setUTCHours(23, minute, 0, 0);
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate.toISOString();
  }

  if (id === 'private-sp500-membership-audit') {
    let candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 4, 17, 0, 0));
    if (candidate <= now) candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 4, 17, 0, 0));
    return candidate.toISOString();
  }

  if (id === 'server-smart-alerts') {
    next.setUTCSeconds(0, 0);
    const minute = next.getUTCMinutes();
    next.setUTCMinutes(Math.floor(minute / 10) * 10 + 10);
    if (next <= now) next.setUTCMinutes(next.getUTCMinutes() + 10);
    return next.toISOString();
  }

  if (id === 'earnings-alerts') {
    next.setUTCHours(3, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }

  if (id === 'production-smoke') {
    next.setUTCMinutes(23, 0, 0);
    const hour = next.getUTCHours();
    const nextHour = Math.floor(hour / 6) * 6 + 6;
    next.setUTCHours(nextHour);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 6);
    return next.toISOString();
  }

  const minute = id.endsWith('fallback') ? 45 : 35;
  const hours = [0, 6, 12, 16];
  next.setUTCSeconds(0, 0);
  for (const hour of hours) {
    next.setUTCHours(hour, minute, 0, 0);
    if (next > now) return next.toISOString();
  }
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(hours[0], minute, 0, 0);
  return next.toISOString();
}

export function summarizeReentryDeliveryHealth(deliveries, watchlist) {
  const rows = Array.isArray(deliveries) ? deliveries : [];
  const watched = Array.isArray(watchlist) ? watchlist : [];
  const statusCounts = { sending: 0, accepted: 0, rejected: 0, uncertain: 0 };
  for (const row of rows) {
    const status = String(row?.status || '').toLowerCase();
    if (Object.hasOwn(statusCounts, status)) statusCounts[status] += 1;
  }
  const latestAccepted = rows.find(row => String(row?.status || '').toLowerCase() === 'accepted') || null;
  return {
    activeWatchlistRows: watched.filter(row => row?.active === true).length,
    activeSoldRows: watched.filter(row => row?.active === true && String(row?.ownership_status || '').toLowerCase() === 'sold').length,
    activeHoldingRows: watched.filter(row => row?.active === true && String(row?.ownership_status || '').toLowerCase() === 'holding').length,
    deliveryLedgerRowsInWindow: rows.length,
    ledgerWindowLimit: 100,
    statusCounts,
    lastAcceptedAt: latestAccepted?.completed_at || latestAccepted?.created_at || null,
    latestDeliveryStatus: rows[0]?.status || null,
  };
}

export function skippedRunsSinceLastSuccess(history, lastSuccessTime) {
  return (Array.isArray(history) ? history : []).filter(run => {
    if (String(run?.conclusion || '').toLowerCase() !== 'skipped') return false;
    const skippedAt = Date.parse(run.created_at || run.updated_at || '');
    return !Number.isFinite(lastSuccessTime) || skippedAt > lastSuccessTime;
  }).length;
}

function workflowMatches(run, fileName) {
  return String(run?.path || '').endsWith(fileName);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error:'GET required' });

  try {
    const response = await fetch(
      'https://api.github.com/repos/' + REPO + '/actions/runs?event=schedule&per_page=100',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ai-infra-watch-job-health/1.0',
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error('GitHub Actions API HTTP ' + response.status);
    const body = await response.json();
    const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];

    const jobs = JOBS.map(job => {
      const history = runs
        .filter(run => workflowMatches(run, job.path))
        .sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const successes = history.filter(run => run.conclusion === 'success');
      const failures = history.filter(run => ['failure','cancelled','timed_out','action_required','stale'].includes(String(run.conclusion || '').toLowerCase()));
      const last = history[0] || null;
      const lastSuccess = successes[0] || null;
      const lastFailure = failures[0] || null;
      const lastSuccessTime = lastSuccess ? Date.parse(lastSuccess.created_at || lastSuccess.updated_at || '') : NaN;
      const failuresSinceLastSuccess = failures.filter(run => {
        const failureTime = Date.parse(run.created_at || run.updated_at || '');
        return !Number.isFinite(lastSuccessTime) || failureTime > lastSuccessTime;
      });
      const skippedRuns = history.filter(run => String(run.conclusion || '').toLowerCase() === 'skipped');
      const recentSkippedCount = skippedRunsSinceLastSuccess(history, lastSuccessTime);
      const lastSkipped = skippedRuns[0] || null;
      const observedAt = Date.now();
      const lastTiming = summarizeRunTiming(last, observedAt, 15 * 60 * 1000);
      const unfinishedRunCount = history.filter(run => summarizeRunTiming(run, observedAt, 15 * 60 * 1000).unfinished).length;
      const stuckRunCount = history.filter(run => summarizeRunTiming(run, observedAt, 15 * 60 * 1000).isStuck).length;
      return {
        id: job.id,
        name: job.name,
        cadence: job.cadence,
        releaseGate: job.releaseGate || null,
        status: lastTiming.isStuck ? 'stuck' : last?.status || 'no_runs',
        conclusion: lastTiming.isStuck ? 'failure' : last?.conclusion || null,
        lastRunAt: last?.created_at || null,
        lastRunDurationMs: lastTiming.durationMs,
        lastRunAgeMs: lastTiming.ageMs,
        isStuck: lastTiming.isStuck,
        unfinishedRunCount,
        stuckRunCount,
        lastSuccessAt: lastSuccess?.updated_at || lastSuccess?.created_at || null,
        lastFailureAt: lastFailure?.updated_at || lastFailure?.created_at || null,
        recentFailureCount: failuresSinceLastSuccess.length,
        recentSkippedCount,
        lastSkippedAt: lastSkipped?.created_at || lastSkipped?.updated_at || null,
        nextRunAt: nextScheduledRun(job.id),
        recentRuns: history.slice(0, 5).map(run => {
          const timing = summarizeRunTiming(run, observedAt, 15 * 60 * 1000);
          return {
            number: run.run_number,
            status: run.status,
            conclusion: run.conclusion,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            durationMs: timing.durationMs,
            ageMs: timing.ageMs,
            isStuck: timing.isStuck,
          };
        }),
      };
    });

    const smartAlertsJob = jobs.find(job => job.id === 'server-smart-alerts');
    if (smartAlertsJob) {
      try {
        const cronRows = await supabase('rpc/server_smart_alerts_cron_health');
        const cronHealth = Array.isArray(cronRows) ? cronRows[0] : cronRows;
        if (!cronHealth || typeof cronHealth !== 'object') {
          throw new Error('Supabase Cron health RPC returned no scheduler record');
        }
        Object.assign(smartAlertsJob, summarizeSupabaseSmartAlertHealth(cronHealth));
      } catch (error) {
        smartAlertsJob.scheduler = 'Supabase Cron';
        smartAlertsJob.status = 'unavailable';
        smartAlertsJob.conclusion = 'failure';
        smartAlertsJob.lastSuccessAt = null;
        smartAlertsJob.schedulerHealthError = error instanceof Error
          ? error.message
          : 'Supabase Smart Alerts scheduler health unavailable';
      }
    }

    const reentryJob = jobs.find(job => job.id === 'reentry-alerts');
    if (reentryJob) {
      try {
        const [deliveries, watchlist] = await Promise.all([
          supabase('reentry_telegram_deliveries?select=status,created_at,completed_at&order=created_at.desc&limit=100'),
          supabase('reentry_watchlist?select=active,ownership_status&limit=100'),
        ]);
        reentryJob.deliveryHealth = summarizeReentryDeliveryHealth(deliveries, watchlist);
      } catch (error) {
        reentryJob.deliveryHealthError = error instanceof Error ? error.message : 'Re-entry delivery ledger unavailable';
      }
    }

    let forecastJob = null;
    try {
      const history = await supabase('forecast_scheduler_runs?select=id,created_at,finished_at,source,slot,status,http_status,holdings,created_count,skipped_count,error&order=created_at.desc&limit=20');
      const successes = history.filter(run => run.status === 'completed' && Number(run.http_status) === 200);
      const failures = history.filter(run => run.status === 'failed' || Number(run.http_status) >= 400);
      const latest = history[0] || null;
      const lastSuccess = successes[0] || null;
      const lastFailure = failures[0] || null;
      const observedAt = Date.now();
      const lastTiming = summarizeRunTiming(latest, observedAt, 5 * 60 * 1000);
      const unfinishedRunCount = history.filter(run => summarizeRunTiming(run, observedAt, 5 * 60 * 1000).unfinished).length;
      const stuckRunCount = history.filter(run => summarizeRunTiming(run, observedAt, 5 * 60 * 1000).isStuck).length;
      const nextRun = (now = new Date()) => {
        const next = new Date(now);
        next.setUTCSeconds(0,0);
        const slots = [75,105,135];
        const day = next.getUTCDay();
        for (let offset=0; offset<=7; offset += 1) {
          const candidateDay = (day + offset) % 7;
          if (candidateDay === 0 || candidateDay === 6) continue;
          for (const minuteOfDay of slots) {
            const candidate = new Date(next);
            candidate.setUTCDate(next.getUTCDate() + offset);
            candidate.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
            if (candidate > now) return candidate.toISOString();
          }
        }
        return null;
      };
      forecastJob = {
        id:'forecast-auto-tracker',
        name:'Forecast Auto Tracker',
        cadence:'06:45 + 07:15 + 07:45 IST weekdays',
        scheduler:'Supabase Cron',
        status: lastTiming.isStuck ? 'stuck' : latest?.status || 'no_runs',
        conclusion: lastTiming.isStuck ? 'failure' : latest?.status === 'completed' ? 'success' : latest?.status === 'failed' ? 'failure' : latest?.status || null,
        lastRunAt: latest?.created_at || null,
        lastRunDurationMs: lastTiming.durationMs,
        lastRunAgeMs: lastTiming.ageMs,
        isStuck: lastTiming.isStuck,
        unfinishedRunCount,
        stuckRunCount,
        lastSuccessAt: lastSuccess?.finished_at || lastSuccess?.created_at || null,
        lastFailureAt: lastFailure?.finished_at || lastFailure?.created_at || null,
        recentFailureCount: failures.length,
        nextRunAt: nextRun(),
        lastRun: latest ? { source:latest.source, slot:latest.slot, status:latest.status, httpStatus:latest.http_status, holdings:latest.holdings, created:latest.created_count, skipped:latest.skipped_count, error:latest.error, durationMs:lastTiming.durationMs, ageMs:lastTiming.ageMs, isStuck:lastTiming.isStuck } : null,
        recentRuns: history.slice(0,5).map(run => {
          const timing = summarizeRunTiming(run, observedAt, 5 * 60 * 1000);
          return { source:run.source, slot:run.slot, status:run.status, httpStatus:run.http_status, createdAt:run.created_at, finishedAt:run.finished_at, created:run.created_count, skipped:run.skipped_count, error:run.error, durationMs:timing.durationMs, ageMs:timing.ageMs, isStuck:timing.isStuck };
        }),
      };
    } catch (error) {
      forecastJob = { id:'forecast-auto-tracker', name:'Forecast Auto Tracker', cadence:'06:45 + 07:15 + 07:45 IST weekdays', scheduler:'Supabase Cron', status:'unavailable', conclusion:null, nextRunAt:null, error:error instanceof Error ? error.message : 'Forecast scheduler health unavailable' };
    }

    let historicalArchive = null;
    let historicalArchiveError = '';
    try {
      historicalArchive = await loadHistoricalArchiveInventory();
    } catch (archiveError) {
      historicalArchiveError = archiveError instanceof Error ? archiveError.message : 'Private archive inventory unavailable';
    }

    return res.status(200).json({
      ok:true,
      retrievedAt:new Date().toISOString(),
      source:'GitHub Actions + Supabase Cron',
      jobs:[...jobs, forecastJob],
      historicalArchive,
      historicalArchiveError,
    });
  } catch (error) {
    return res.status(502).json({
      ok:false,
      error:error instanceof Error ? error.message : 'Scheduled job health unavailable',
      jobs:[...JOBS.map(job => ({ ...job, status:'unavailable', nextRunAt:nextScheduledRun(job.id) })), { id:'forecast-auto-tracker', name:'Forecast Auto Tracker', cadence:'06:45 + 07:15 + 07:45 IST weekdays', scheduler:'Supabase Cron', status:'unavailable', nextRunAt:null }],
    });
  }
}
