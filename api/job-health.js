import { requireAccess } from './_access-auth.js';

const REPO = 'Blitzer0007/ai-infra-watch';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function supabase(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase scheduler health configuration missing');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY },
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
  { id:'server-smart-alerts', name:'Server Smart Alerts', path:'server-smart-alerts.yml', cadence:'every 10 minutes UTC' },
  { id:'earnings-alerts', name:'Earnings alerts', path:'earnings-alerts.yml', cadence:'08:30 Asia/Kolkata' },
  { id:'production-smoke', name:'Production Smoke', path:'production-smoke.yml', cadence:'every 6 hours at :23 UTC' },
];

function nextScheduledRun(id, now = new Date()) {
  const next = new Date(now);

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
      return {
        id: job.id,
        name: job.name,
        cadence: job.cadence,
        status: last?.status || 'no_runs',
        conclusion: last?.conclusion || null,
        lastRunAt: last?.created_at || null,
        lastSuccessAt: lastSuccess?.updated_at || lastSuccess?.created_at || null,
        lastFailureAt: lastFailure?.updated_at || lastFailure?.created_at || null,
        recentFailureCount: failuresSinceLastSuccess.length,
        nextRunAt: nextScheduledRun(job.id),
        recentRuns: history.slice(0, 5).map(run => ({
          number: run.run_number,
          conclusion: run.conclusion,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        })),
      };
    });

    let forecastJob = null;
    try {
      const history = await supabase('forecast_scheduler_runs?select=id,created_at,finished_at,source,slot,status,http_status,holdings,created_count,skipped_count,error&order=created_at.desc&limit=20');
      const successes = history.filter(run => run.status === 'completed' && Number(run.http_status) === 200);
      const failures = history.filter(run => run.status === 'failed' || Number(run.http_status) >= 400);
      const latest = history[0] || null;
      const lastSuccess = successes[0] || null;
      const lastFailure = failures[0] || null;
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
        status: latest?.status || 'no_runs',
        conclusion: latest?.status === 'completed' ? 'success' : latest?.status === 'failed' ? 'failure' : latest?.status || null,
        lastRunAt: latest?.created_at || null,
        lastSuccessAt: lastSuccess?.finished_at || lastSuccess?.created_at || null,
        lastFailureAt: lastFailure?.finished_at || lastFailure?.created_at || null,
        recentFailureCount: failures.length,
        nextRunAt: nextRun(),
        lastRun: latest ? { source:latest.source, slot:latest.slot, status:latest.status, httpStatus:latest.http_status, holdings:latest.holdings, created:latest.created_count, skipped:latest.skipped_count, error:latest.error } : null,
        recentRuns: history.slice(0,5).map(run => ({ source:run.source, slot:run.slot, status:run.status, httpStatus:run.http_status, createdAt:run.created_at, finishedAt:run.finished_at, created:run.created_count, skipped:run.skipped_count, error:run.error })),
      };
    } catch (error) {
      forecastJob = { id:'forecast-auto-tracker', name:'Forecast Auto Tracker', cadence:'06:45 + 07:15 + 07:45 IST weekdays', scheduler:'Supabase Cron', status:'unavailable', conclusion:null, nextRunAt:null, error:error instanceof Error ? error.message : 'Forecast scheduler health unavailable' };
    }

    return res.status(200).json({
      ok:true,
      retrievedAt:new Date().toISOString(),
      source:'GitHub Actions + Supabase Cron',
      jobs:[...jobs, forecastJob],
    });
  } catch (error) {
    return res.status(502).json({
      ok:false,
      error:error instanceof Error ? error.message : 'Scheduled job health unavailable',
      jobs:[...JOBS.map(job => ({ ...job, status:'unavailable', nextRunAt:nextScheduledRun(job.id) })), { id:'forecast-auto-tracker', name:'Forecast Auto Tracker', cadence:'06:45 + 07:15 + 07:45 IST weekdays', scheduler:'Supabase Cron', status:'unavailable', nextRunAt:null }],
    });
  }
}
