import { classifyFreshness, formatFreshnessAge, type FreshnessInput } from '../utils/freshness';

type Props = FreshnessInput & {
  className?: string;
  showAge?: boolean;
  labelOverride?: string;
};

function tone(label: string) {
  if (label === 'Live') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (label === 'Delayed') return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  if (label === 'Last close') return 'border-white/15 bg-white/[.04] text-white/45';
  return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
}

export default function FreshnessBadge({ className = '', showAge = true, labelOverride, ...input }: Props) {
  const result = classifyFreshness(input);
  const label = labelOverride || result.label;
  const age = showAge ? formatFreshnessAge(result.ageMinutes) : '';
  return (
    <span
      data-testid="freshness-badge"
      title={result.referenceTime ? 'Reference: ' + new Date(result.referenceTime).toLocaleString() : 'No reliable timestamp available'}
      className={'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider ' + tone(label) + ' ' + className}
    >
      <span aria-hidden="true" className={'w-1.5 h-1.5 rounded-full ' + (label === 'Live' ? 'bg-emerald-300' : label === 'Delayed' ? 'bg-amber-300' : label === 'Unknown' ? 'bg-rose-300' : 'bg-white/30')} />
      {label}{age ? ' · ' + age : ''}
    </span>
  );
}