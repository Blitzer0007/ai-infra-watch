import { classifyFreshness, formatFreshnessAge, type FreshnessInput } from '../utils/freshness';

type Props = FreshnessInput & {
  className?: string;
  showAge?: boolean;
  labelOverride?: string;
  provider?: string | null;
  expandable?: boolean;
  timeZone?: string;
};

function tone(label: string) {
  if (label === 'Live') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (label === 'Delayed') return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  if (label === 'Last close') return 'border-white/15 bg-white/[.04] text-white/45';
  return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
}

export default function FreshnessBadge({ className = '', showAge = true, labelOverride, provider, expandable = false, timeZone, ...input }: Props) {
  const result = classifyFreshness(input);
  const label = labelOverride || result.label;
  const age = showAge ? formatFreshnessAge(result.ageMinutes) : '';
  const formatTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { timeZone }) : 'Unavailable';
  const badge = (
    <span
      data-testid="freshness-badge"
      title={['Source: ' + (provider || 'unavailable'), 'Market time: ' + formatTime(input.marketTime), 'Retrieved: ' + formatTime(input.retrievedAt)].join(' · ')}
      className={'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-mono font-black uppercase tracking-wider ' + tone(label) + ' ' + className}
    >
      <span aria-hidden="true" className={'w-1.5 h-1.5 rounded-full ' + (label === 'Live' ? 'bg-emerald-300' : label === 'Delayed' ? 'bg-amber-300' : label === 'Unknown' ? 'bg-rose-300' : 'bg-white/30')} />
      {label}{age ? ' · ' + age : ''}
    </span>
  );
  if (!expandable) return badge;
  return <details className="mt-2 text-sm text-white/75" data-testid="freshness-provenance">
    <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-cyan-300">{badge} <span>Quote source and timestamps</span></summary>
    <dl className="mt-2 grid gap-1 break-words">
      <dt className="font-bold">Source</dt><dd>{provider || 'Unavailable'}</dd>
      <dt className="font-bold">Market observation</dt><dd>{formatTime(input.marketTime)}</dd>
      <dt className="font-bold">Retrieved</dt><dd>{formatTime(input.retrievedAt)}</dd>
    </dl>
    <p className="mt-2">Market time describes the price observation. Retrieval time describes when it was fetched and cannot establish a live price by itself.</p>
  </details>;
}