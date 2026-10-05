import { useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { authFetch } from '../utils/apiAuth';
import FreshnessBadge from './FreshnessBadge';

type Props = {
  evidenceAvailability: Record<string, any>;
  timestamp?: number;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
};

const LABELS: Record<string, string> = {
  market: 'Market prices',
  contracts: 'SEC contracts',
  news: 'News',
  political: 'Political / policy',
  congress: 'Congress trades',
  macro: 'Macro risks'
};

function statusClass(status: string, stale?: boolean) {
  if (stale || status === 'STALE') return 'text-amber-300 border-amber-400/20 bg-amber-400/5';
  if (status === 'AVAILABLE') return 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5';
  if (status === 'CONFLICT') return 'text-rose-300 border-rose-400/20 bg-rose-400/5';
  if (status === 'NOT_APPLICABLE') return 'text-sky-300 border-sky-400/20 bg-sky-400/5';
  return 'text-white/45 border-white/10 bg-white/[.02]';
}

export default function DataHealth({ evidenceAvailability, timestamp, isLoading, error, onRefresh }: Props) {
  const entries = Object.entries(evidenceAvailability || {});

  const sourceHealth = (item: any) => {
    const status = String(item?.status || 'NOT_FOUND');
    if (status === 'NOT_FOUND') return { label: 'MISSING', tone: 'text-rose-300 border-rose-400/20 bg-rose-400/5' };
    if (status === 'PENDING') return { label: 'PENDING', tone: 'text-sky-300 border-sky-400/20 bg-sky-400/5' };
    if (item?.stale || status === 'STALE') return { label: 'STALE', tone: 'text-amber-300 border-amber-400/20 bg-amber-400/5' };
    if (!item?.retrievedAt) return { label: status === 'AVAILABLE' ? 'HEALTHY' : status, tone: status === 'AVAILABLE' ? 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5' : 'text-white/45 border-white/10 bg-white/[.02]' };

    const ageMs = Math.max(0, Date.now() - new Date(item.retrievedAt).getTime());
    if (!Number.isFinite(ageMs)) return { label: 'UNKNOWN', tone: 'text-white/45 border-white/10 bg-white/[.02]' };

    const ageSeconds = ageMs / 1000;
    const cadence = Number(item?.refreshIntervalSeconds) > 0 ? Number(item.refreshIntervalSeconds) : null;
    if (cadence && ageSeconds > cadence * 5) {
      return { label: 'STALE', tone: 'text-amber-300 border-amber-400/20 bg-amber-400/5' };
    }
    if (cadence && ageSeconds > cadence * 2) {
      return { label: 'AGING', tone: 'text-yellow-200 border-yellow-400/20 bg-yellow-400/5' };
    }
    return { label: 'HEALTHY', tone: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5' };
  };

  const freshness = (item: any) => {
    if (!item?.retrievedAt) return null;
    const ageMs = Math.max(0, Date.now() - new Date(item.retrievedAt).getTime());
    if (!Number.isFinite(ageMs)) return null;
    const ageMinutes = Math.round(ageMs / 60000);
    return ageMinutes < 1 ? 'just now' : ageMinutes + 'm ago';
  };

  const healthy = entries.filter(([, item]) => sourceHealth(item).label === 'HEALTHY').length;
  const aging = entries.filter(([, item]) => sourceHealth(item).label === 'AGING').length;
  const stale = entries.filter(([, item]) => sourceHealth(item).label === 'STALE').length;
  const missing = entries.filter(([, item]) => sourceHealth(item).label === 'MISSING').length;
  const conflicts = entries.filter(([, item]) => String(item?.status || '') === 'CONFLICT').length;
  const fallback = entries.filter(([, item]) => Boolean(item?.fallback)).length;
  const [forecastValidation, setForecastValidation] = useState<any>(null);
  const [forecastValidationError, setForecastValidationError] = useState('');
  const [jobHealth, setJobHealth] = useState<any[]>([]);
  const [jobHealthError, setJobHealthError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/job-health', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Scheduled job health unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        setJobHealth(Array.isArray(body?.jobs) ? body.jobs : []);
        setJobHealthError('');
      })
      .catch(error => {
        if (!cancelled) {
          setJobHealth([]);
          setJobHealthError(error instanceof Error ? error.message : 'Scheduled job health unavailable');
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/forecast-validation', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Forecast validation unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        setForecastValidation(body);
        setForecastValidationError('');
      })
      .catch(error => {
        if (!cancelled) {
          setForecastValidation(null);
          setForecastValidationError(error instanceof Error ? error.message : 'Forecast validation unavailable');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const validationOverall = forecastValidation?.overall || null;
  const validationGate = forecastValidation?.validationGate || null;

  return (
    <div className="space-y-6">
      <div className="aiw-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / DATA HEALTH</div>
          <div className="text-2xl font-black mt-2">Evidence Availability</div>
          <div className="text-xs text-white/45 mt-1">What evidence is currently available to the research engine, and where fallbacks or gaps exist.</div>
        </div>
        <button aria-label="Refresh evidence data" onClick={onRefresh} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-mono uppercase text-white/60 hover:text-white disabled:opacity-40">
          <RefreshCw className={isLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Refresh evidence
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" aria-label="Data health summary">
        <Metric label="Healthy" value={healthy} icon={<ShieldCheck className="w-4 h-4"/>}/>
        <Metric label="Aging" value={aging} icon={<Activity className="w-4 h-4"/>}/>
        <Metric label="Stale" value={stale} icon={<Activity className="w-4 h-4"/>}/>
        <Metric label="Missing" value={missing} icon={<ShieldAlert className="w-4 h-4"/>}/>
        <Metric label="Conflicts" value={conflicts} icon={<ShieldAlert className="w-4 h-4"/>}/>
        <Metric label="Fallbacks" value={fallback} icon={<RefreshCw className="w-4 h-4"/>}/>
        <Metric label="Total channels" value={entries.length} icon={<ShieldAlert className="w-4 h-4"/>}/>
      </div>


      <section className="rounded-2xl border border-white/10 bg-[#15181E] p-4" data-testid="scheduled-job-health">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Automation reliability</div>
            <div className="text-sm font-black mt-1">Scheduled job health</div>
            <div className="text-[9px] text-white/30 mt-1">Last success, recent failures and next expected run from GitHub Actions.</div>
          </div>
          <span className="text-[8px] font-mono uppercase text-white/25">{jobHealth.length ? jobHealth.length + ' jobs checked' : 'unavailable'}</span>
        </div>
        {jobHealthError && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{jobHealthError}</div>}
        <div className="mt-3 space-y-2">
          {jobHealth.map(job => {
            const healthy = job.conclusion === 'success';
            const degraded = job.status === 'unavailable' || job.conclusion === 'failure' || job.recentFailureCount > 0;
            return <div key={job.id} className="rounded-xl border border-white/5 bg-black/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold">{job.name}</span>
                <span className={'px-2 py-1 rounded-full border text-[8px] font-mono uppercase ' + (healthy ? 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5' : degraded ? 'text-amber-300 border-amber-400/20 bg-amber-400/5' : 'text-white/45 border-white/10')}>{job.conclusion || job.status || 'NO RUNS'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-[8px] font-mono text-white/30">
                <span>Last success: {job.lastSuccessAt ? new Date(job.lastSuccessAt).toLocaleString() : 'none recorded'}</span>
                <span>Failures since last success: {job.recentFailureCount ?? 0}</span>
                <span>Next expected: {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'not calculated'}</span>
              </div>
              <div className="mt-1 text-[7px] font-mono text-white/20">Cadence: {job.cadence}</div>
            </div>;
          })}
          {!jobHealth.length && !jobHealthError ? <div className="text-[9px] font-mono text-white/30">Loading scheduled job health…</div> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4" data-testid="forecast-validation-health">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-cyan-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Forecast validation health
            </div>
            <div className="text-sm font-black mt-1">Verified forecast sample</div>
            <div className="text-[9px] text-white/30 mt-1">Tracks completed forecasts separately from current evidence availability.</div>
          </div>
          <span className="text-[8px] font-mono uppercase text-white/30">{validationGate?.ready ? '50+ gate established' : 'validation sample building'}</span>
        </div>
        {forecastValidationError && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{forecastValidationError}</div>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
          <Metric label="Verified" value={validationOverall?.count ?? 0} icon={<CheckCircle2 className="w-4 h-4"/>}/>
          <Metric label="Direction" value={validationOverall?.directionalAccuracyPct == null ? '—' : Math.round(validationOverall.directionalAccuracyPct) + '%'} icon={<Activity className="w-4 h-4"/>}/>
          <Metric label="Typical error" value={validationOverall?.medianAbsoluteError == null ? '—' : validationOverall.medianAbsoluteError.toFixed(1) + ' pp'} icon={<Activity className="w-4 h-4"/>}/>
          <Metric label="Likely range" value={validationOverall?.p25p75CoveragePct == null ? '—' : Math.round(validationOverall.p25p75CoveragePct) + '%'} icon={<ShieldCheck className="w-4 h-4"/>}/>
          <Metric label="Gate" value={validationGate ? validationGate.verifiedCount + '/' + validationGate.minimumRequired : '—'} icon={<ShieldAlert className="w-4 h-4"/>}/>
        </div>
        <div className="mt-2 text-[8px] font-mono text-white/25">
          {validationOverall?.sampleStatus ? 'Sample status: ' + validationOverall.sampleStatus.replace('-', ' ') : 'No verified forecast history yet.'}
          {validationOverall?.newestVerifiedAt ? ' · last verified ' + new Date(validationOverall.newestVerifiedAt).toLocaleString() : ''}
          {forecastValidation?.scope?.truncated ? ' · latest ' + forecastValidation.scope.rowLimit + ' rows shown' : ''}
        </div>
      </section>

      <div className="rounded-2xl border border-white/10 bg-[#15181E] overflow-hidden" aria-label="Evidence channel health">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b border-white/10 text-[9px] font-mono uppercase tracking-widest text-white/35">
          <span>Evidence channel</span><span className="text-right">Status</span>
        </div>
        {entries.map(([key, item]) => {
          const status = String(item?.status || 'NOT_FOUND');
          const health = sourceHealth(item);
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-3 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <div className="text-xs font-bold">{LABELS[key] || key}</div>
                <div className="text-[9px] text-white/30 mt-1 break-words">
                  {item?.count != null ? item.count + ' evidence items' : ''}
                  {item?.source ? ' · ' + item.source : ''}
                  {item?.provider ? ' · provider: ' + item.provider : ''}
                  {freshness(item) ? ' · retrieved ' + freshness(item) : ''}
                  {item?.refreshIntervalSeconds ? ' · cadence ' + Math.round(item.refreshIntervalSeconds / 60) + 'm' : ''}
                  {item?.fallback ? ' · fallback' : ''}
                  {item?.upstreamError ? ' · upstream issue' : ''}
                  {item?.lastRefreshStatus ? ' · refresh ' + item.lastRefreshStatus : ''}
                  {item?.lastRefreshError ? ' · refresh error: ' + item.lastRefreshError : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={'px-2 py-1 rounded-full border text-[9px] font-mono uppercase ' + health.tone}>
                  {health.label}
                </span>
                {key === 'market' && <FreshnessBadge marketTime={item?.marketTime} retrievedAt={item?.retrievedAt} asOf={item?.asOf} stale={item?.stale} showAge={false} />}
                <span className="text-[8px] font-mono uppercase text-white/20">{status}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] p-4 text-[10px] text-white/45 leading-5">
        <div className="font-mono uppercase tracking-widest text-cyan-300/70 mb-2">JEV interpretation rule</div>
        <p>Missing evidence is not treated as negative evidence. A <b className="text-white/65">NOT_FOUND</b> channel means the system did not retrieve usable evidence; <b className="text-white/65">NOT_APPLICABLE</b> means the channel does not apply to the instrument or question.</p>
        <p className="mt-2">Fallback data is explicitly marked so research can distinguish provider failure from a clean primary-source result.</p>
      </div>

      <div className="text-[9px] font-mono text-white/25">
        <div className="text-[9px] font-mono text-white/25 space-y-1">
          <div>Last live-data refresh: {timestamp ? new Date(timestamp).toLocaleString() : 'not available'}</div>
          <div>Automatic refresh cadence: feeds 5m · market quotes 60s · manual refresh bypasses server cache.</div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-[#15181E] p-4"><div className="flex items-center gap-2 text-[9px] font-mono uppercase text-white/35">{icon}{label}</div><div className="text-2xl font-black mt-2">{value}</div></div>;
}