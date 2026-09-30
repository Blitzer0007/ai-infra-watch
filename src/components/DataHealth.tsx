import { Activity, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

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
  const available = entries.filter(([, item]) => item?.status === 'AVAILABLE' && !item?.stale).length;
  const stale = entries.filter(([, item]) => item?.stale || item?.status === 'STALE').length;
  const missing = entries.filter(([, item]) => item?.status === 'NOT_FOUND').length;
  const conflicts = entries.reduce((sum, [, item]) => sum + Number(item?.conflictCount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="aiw-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / DATA HEALTH</div>
          <div className="text-2xl font-black mt-2">Evidence Availability</div>
          <div className="text-xs text-white/45 mt-1">What evidence is currently available to the research engine, and where fallbacks or gaps exist.</div>
        </div>
        <button onClick={onRefresh} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-mono uppercase text-white/60 hover:text-white disabled:opacity-40">
          <RefreshCw className={isLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Refresh evidence
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{error}</div>}

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Available" value={available} icon={<ShieldCheck className="w-4 h-4"/>}/>
        <Metric label="Stale / fallback" value={stale} icon={<Activity className="w-4 h-4"/>}/>
        <Metric label="Missing" value={missing} icon={<ShieldAlert className="w-4 h-4"/>}/>
        <Metric label="Conflicts" value={conflicts} icon={<ShieldAlert className="w-4 h-4"/>}/>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#15181E] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b border-white/10 text-[9px] font-mono uppercase tracking-widest text-white/35">
          <span>Evidence channel</span><span>Status</span>
        </div>
        {entries.map(([key, item]) => {
          const status = String(item?.status || 'NOT_FOUND');
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center px-4 py-3 border-b border-white/5 last:border-0">
              <div>
                <div className="text-xs font-bold">{LABELS[key] || key}</div>
                <div className="text-[9px] text-white/30 mt-1">
                  {item?.count != null ? item.count + ' evidence items' : ''}
                  {item?.source ? ' · ' + item.source : ''}
                  {item?.provider ? ' · provider: ' + item.provider : ''}
                </div>
              </div>
              <span className={'px-2 py-1 rounded-full border text-[9px] font-mono uppercase ' + statusClass(status, item?.stale)}>
                {item?.stale ? 'STALE' : status}
              </span>
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
        Last live-data refresh: {timestamp ? new Date(timestamp).toLocaleString() : 'not available'}
      </div>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-[#15181E] p-4"><div className="flex items-center gap-2 text-[9px] font-mono uppercase text-white/35">{icon}{label}</div><div className="text-2xl font-black mt-2">{value}</div></div>;
}
