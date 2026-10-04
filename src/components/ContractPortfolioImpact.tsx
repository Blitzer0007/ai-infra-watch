import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BriefcaseBusiness, Gauge, Link2, Waves } from 'lucide-react';
import { Contract } from '../types';

type Props = {
  contract: Contract;
};

type CompanyScale = {
  symbol: string;
  company: string | null;
  cik: string | null;
  revenue: {
    value: number;
    start: string;
    end: string;
    filed: string | null;
    tag: string;
  } | null;
  source: string;
  error?: string;
};

const PORTFOLIO_SYMBOLS = new Set([
  'DGXX','DRAM','SOXL','NVDA','MSFT','NBIS','VIVO','META','NOW','PHVS'
]);

const COUNTERPARTY_ALIASES: Array<[RegExp, string]> = [
  [/microsoft|\bmsft\b/i, 'MSFT'],
  [/meta platforms|\bmeta\b/i, 'META'],
  [/nvidia|\bnvda\b/i, 'NVDA'],
  [/micron|\bmu\b/i, 'MU'],
  [/amd|advanced micro/i, 'AMD'],
  [/cerebras|\bcbrs\b/i, 'CBRS'],
  [/san.?disk|\bsndk\b/i, 'SNDK'],
  [/service ?now|\bnow\b/i, 'NOW'],
  [/nebius|\bnbis\b/i, 'NBIS'],
  [/vivo.?power|\bvivo\b/i, 'VIVO'],
  [/digi ?power|\bdgxx\b/i, 'DGXX'],
];

function canonicalCounterparty(value?: string): string | null {
  if (!value) return null;
  for (const [pattern, symbol] of COUNTERPARTY_ALIASES) {
    if (pattern.test(value)) return symbol;
  }
  return null;
}

function parseValue(value?: string): { amount: number | null; qualifier: string } {
  if (!value) return { amount: null, qualifier: '' };
  const match = value.match(/(?:up to|approximately|about|minimum of|aggregate of|total of|committed)?\s*\$\s*([0-9,.]+)\s*(T|B|M|K|trillion|billion|million|thousand)?/i);
  if (!match) return { amount: null, qualifier: '' };
  const n = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return { amount: null, qualifier: '' };
  const unit = String(match[2] || '').toLowerCase();
  const multiplier = unit === 't' || unit === 'trillion' ? 1e12
    : unit === 'b' || unit === 'billion' ? 1e9
    : unit === 'm' || unit === 'million' ? 1e6
    : unit === 'k' || unit === 'thousand' ? 1e3 : 1;
  const amount = n * multiplier;
  const qualifier = /up to/i.test(value) ? 'up to' : /minimum/i.test(value) ? 'minimum' : '';
  return { amount, qualifier };
}

function annualizeValue(value?: string, duration?: string): number | null {
  const { amount } = parseValue(value);
  if (amount == null || !duration) return null;
  const years = Number(duration.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1] || 0);
  if (!years) return null;
  const hasMonth = /month/i.test(duration);
  const normalizedYears = hasMonth ? years / 12 : years;
  return normalizedYears > 0 ? amount / normalizedYears : null;
}

function parseCapacity(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*(GW|MW|kW)/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = match[2].toUpperCase();
  return unit === 'GW' ? n * 1000 : unit === 'kW' ? n / 1000 : n;
}

function relatedSignals(contract: Contract, counterparty: string | null): string[] {
  const out = new Set<string>();
  const text = [
    contract.hardware,
    contract.details,
    contract.duration,
    contract.value,
    counterparty || '',
  ].join(' ').toLowerCase();

  if (/gpu|blackwell|rubin|accelerator|compute|cluster/i.test(text)) {
    out.add('AI compute / accelerator utilization');
  }
  if (/power|mw|gw|data.?center|colocation|campus|facility/i.test(text)) {
    out.add('Power and data-center capacity execution');
  }
  if (/lease|hosting|capacity reservation|services?|subscription|rental|gpus?-as-a-service/i.test(text)) {
    out.add('Contracted capacity / recurring service demand');
  }
  if (/storage|ssd|nand|hbm|dram|memory/i.test(text)) {
    out.add('Memory / storage demand and supply conditions');
  }
  if (/purchase|supply|order/i.test(text)) {
    out.add('Hardware procurement / supply commitments');
  }

  if (!out.size) {
    out.add('Revenue/backlog visibility and execution');
    out.add('Capital spending required to fulfill the agreement');
    out.add('Reliance on one customer or partner');
  }
  return Array.from(out).slice(0, 3);
}

export default function ContractPortfolioImpact({ contract }: Props) {
  const analysis = useMemo(() => {
    const counterparty = canonicalCounterparty(contract.client);
    const issuerDirect = PORTFOLIO_SYMBOLS.has(contract.company);
    const counterpartyHeld = counterparty ? PORTFOLIO_SYMBOLS.has(counterparty) : false;
    const { amount, qualifier } = parseValue(contract.value);
    const annualized = annualizeValue(contract.value, contract.duration);
    const capacityMw = parseCapacity(contract.hardware) ?? parseCapacity(contract.details);
    const signals = relatedSignals(contract, counterparty);

    return {
      counterparty,
      issuerDirect,
      counterpartyHeld,
      amount,
      qualifier,
      annualized,
      capacityMw,
      signals,
    };
  }, [contract]);

  const [scale, setScale] = useState<CompanyScale | null>(null);
  const [scaleLoading, setScaleLoading] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);

  useEffect(() => {
    setScale(null);
    setScaleError(null);
  }, [contract.company]);

  async function loadScale() {
    if (scaleLoading || scale) return;
    setScaleLoading(true);
    setScaleError(null);
    try {
      const response = await fetch('/api/company-scale?symbol=' + encodeURIComponent(contract.company), { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'SEC company scale lookup failed.');
      setScale(payload);
    } catch (error) {
      setScaleError(error instanceof Error ? error.message : 'SEC company scale lookup failed.');
    } finally {
      setScaleLoading(false);
    }
  }

  const latestRevenue = scale?.revenue?.value ?? null;
  const annualizedToRevenue = analysis.annualized != null && latestRevenue
    ? (analysis.annualized / latestRevenue) * 100
    : null;
  const contractValueToRevenue = analysis.amount != null && latestRevenue
    ? (analysis.amount / latestRevenue) * 100
    : null;

  return (
    <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="w-4 h-4 text-emerald-300" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-300">
            Contract → Portfolio Impact
          </span>
        </div>
        <span className="text-[8px] font-mono uppercase text-white/25">
          Business impact map · not a return forecast
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase">
        <span className="rounded border border-white/10 bg-black/15 px-2 py-1 text-white/55">
          Issuer: {contract.company}
        </span>
        {analysis.issuerDirect && (
          <span className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">
            Direct holding
          </span>
        )}
        {analysis.counterparty && (
          <>
            <ArrowRight className="w-3 h-3 text-white/20" />
            <span className="rounded border border-white/10 bg-black/15 px-2 py-1 text-white/55">
              Counterparty: {analysis.counterparty}
            </span>
          </>
        )}
        {analysis.counterpartyHeld && (
          <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-300">
            Portfolio counterparty
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Metric icon={<Gauge className="w-3.5 h-3.5" />} label="Disclosed value" value={contract.value} />
        <Metric
          icon={<BriefcaseBusiness className="w-3.5 h-3.5" />}
          label="Simple annual run-rate"
          value={analysis.annualized == null ? '—' : formatMoney(analysis.annualized) + '/yr'}
        />
        <Metric
          icon={<Waves className="w-3.5 h-3.5" />}
          label="Capacity signal"
          value={analysis.capacityMw == null ? '—' : formatMw(analysis.capacityMw)}
        />
      </div>

      <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-cyan-300/70">
              Economic scale context
            </div>
            <div className="text-[9px] text-white/30 mt-1">
              Uses the issuer's latest annual revenue reported to SEC XBRL. This is scale context, not recognized contract revenue or a return forecast.
            </div>
          </div>
          {!scale && (
            <button
              type="button"
              onClick={loadScale}
              disabled={scaleLoading}
              className="rounded border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1.5 text-[8px] font-mono uppercase text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50"
            >
              {scaleLoading ? 'Reading SEC…' : 'Load SEC scale'}
            </button>
          )}
        </div>

        {scaleError && (
          <div className="mt-2 text-[9px] font-mono text-rose-300/80">{scaleError}</div>
        )}

        {scale?.error && (
          <div className="mt-2 text-[9px] font-mono text-amber-300/70">{scale.error}</div>
        )}

        {scale && !scale.error && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <Metric
              icon={<Gauge className="w-3.5 h-3.5" />}
              label="Latest annual revenue"
              value={latestRevenue == null ? '—' : formatMoney(latestRevenue)}
            />
            <Metric
              icon={<BriefcaseBusiness className="w-3.5 h-3.5" />}
              label="Annualized / annual revenue"
              value={annualizedToRevenue == null ? '—' : annualizedToRevenue.toFixed(1) + '%'}
            />
            <Metric
              icon={<ArrowRight className="w-3.5 h-3.5" />}
              label="Disclosed value / annual revenue"
              value={contractValueToRevenue == null ? '—' : contractValueToRevenue.toFixed(1) + '%'}
            />
          </div>
        )}

        {scale?.revenue && (
          <div className="mt-2 text-[8px] font-mono text-white/20">
            SEC revenue fact: {scale.revenue.tag} · FY ending {scale.revenue.end} · filed {scale.revenue.filed || 'date unavailable'} · source {scale.source}.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/5 bg-black/10 p-3">
          <div className="text-[8px] font-mono uppercase tracking-widest text-white/25 mb-2">Why this can matter</div>
          <div className="space-y-1.5">
            {analysis.signals.map(signal => (
              <div key={signal} className="flex gap-2 text-[10px] leading-relaxed text-white/55">
                <span className="mt-1 h-1 w-1 rounded-full bg-emerald-300/70 shrink-0" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-[8px] font-mono uppercase tracking-widest text-white/25 mb-2">
            <Link2 className="w-3.5 h-3.5" />
            Portfolio linkage
          </div>
          <div className="text-[10px] leading-relaxed text-white/55">
            {analysis.issuerDirect && analysis.counterpartyHeld
              ? contract.company + ' and ' + analysis.counterparty + ' are both portfolio holdings, so the agreement is relevant to both sides of the tracked relationship.'
              : analysis.issuerDirect
                ? contract.company + ' is a direct holding; the contract is mapped first to the issuer\'s business sensitivity.'
                : analysis.counterpartyHeld
                  ? analysis.counterparty + ' is a tracked counterparty; the issuer itself is outside the held portfolio.'
                  : 'No direct holding or mapped portfolio counterparty was identified from the contract record.'}
          </div>
        </div>
      </div>

      {analysis.amount != null && analysis.qualifier && (
        <div className="text-[8px] font-mono text-white/25">
          Value qualifier: {analysis.qualifier} · simple annual run-rate assumes an even allocation across the stated term.
        </div>
      )}

      {analysis.annualized != null && (
        <div className="text-[8px] font-mono text-white/25">
          Annual run-rate is arithmetic only; it is not an estimate of reported revenue, cash flow, margin, or stock-price impact.
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/10 p-3">
      <div className="flex items-center gap-2 text-[8px] font-mono uppercase tracking-widest text-white/25">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xs font-mono font-bold text-white/75 break-words">{value}</div>
    </div>
  );
}

function formatMoney(value: number): string {
  if (value >= 1e12) return '$' + (value / 1e12).toFixed(1) + 'T';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + value.toFixed(0);
}

function formatMw(mw: number): string {
  return mw >= 1000 ? (mw / 1000).toFixed(1) + ' GW' : mw.toFixed(mw % 1 ? 1 : 0) + ' MW';
}
