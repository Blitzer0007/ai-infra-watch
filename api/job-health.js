import { requireAccess } from './_access-auth.js';

const REPO = 'Blitzer0007/ai-infra-watch';

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
      return {
        id: job.id,
        name: job.name,
        cadence: job.cadence,
        status: last?.status || 'no_runs',
        conclusion: last?.conclusion || null,
        lastRunAt: last?.created_at || null,
        lastSuccessAt: lastSuccess?.updated_at || lastSuccess?.created_at || null,
        lastFailureAt: lastFailure?.updated_at || lastFailure?.created_at || null,
        recentFailureCount: failures.length,
        nextRunAt: nextScheduledRun(job.id),
        recentRuns: history.slice(0, 5).map(run => ({
          number: run.run_number,
          conclusion: run.conclusion,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        })),
      };
    });

    return res.status(200).json({
      ok:true,
      retrievedAt:new Date().toISOString(),
      source:'GitHub Actions',
      jobs,
    });
  } catch (error) {
    return res.status(502).json({
      ok:false,
      error:error instanceof Error ? error.message : 'Scheduled job health unavailable',
      jobs:JOBS.map(job => ({ ...job, status:'unavailable', nextRunAt:nextScheduledRun(job.id) })),
    });
  }
}
