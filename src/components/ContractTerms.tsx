import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileSearch, ShieldCheck } from 'lucide-react';

interface Props {
  symbol: string;
  accession?: string;
  url?: string;
}

interface Detail {
  counterparty: string | null;
  disclosedValue: string | null;
  duration: string | null;
  capacity: string | null;
  hardware: string | null;
  geography: string | null;
  paymentTerms: string | null;
  commercialModel: string | null;
  summary: string | null;
  evidence: string[];
  extractionCoverage?: {
    level: string;
    percent: number;
  };
  source: string;
}

export default function ContractTerms({ symbol, accession, url }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || detail || !url) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const endpoint =
          '/api/contract-detail?symbol=' +
          encodeURIComponent(symbol) +
          '&accession=' +
          encodeURIComponent(accession || '') +
          '&url=' +
          encodeURIComponent(url);

        const res = await fetch(endpoint);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || 'Contract extraction failed');
        }

        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Contract extraction failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, detail, symbol, accession, url]);

  const coverage = detail?.extractionCoverage;

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        disabled={!url}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05] disabled:opacity-40 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-cyan-300">
          <FileSearch className="w-3.5 h-3.5" />
          Contract Intelligence · Extract SEC Terms
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/35" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/35" />
        )}
      </button>

      {open && (
        <div className="p-4 bg-[#0F1115]/40 space-y-4">
          {loading && (
            <div className="text-[10px] font-mono text-white/35">
              Reading the primary SEC filing and extracting commercial terms…
            </div>
          )}

          {error && (
            <div className="text-[10px] font-mono text-rose-300">{error}</div>
          )}

          {detail && (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-cyan-400/10 bg-cyan-400/5 p-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-300" />
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">
                      Extraction Coverage
                    </div>
                    <div className="text-[10px] text-white/45 mt-1">
                      Coverage reflects how many contract fields were successfully extracted; it is not a guarantee that every extracted field is correct.
                    </div>
                  </div>
                </div>
                {coverage && (
                  <div className="min-w-[170px]">
                    <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                      <span className="text-white/35 uppercase">{coverage.level}</span>
                      <span className="text-cyan-300">{coverage.percent}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400/70 rounded-full"
                        style={{ width: Math.max(0, Math.min(100, coverage.percent)) + '%' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Fact label="Counterparty" value={detail.counterparty || 'Not identified'} />
                <Fact label="Disclosed value" value={detail.disclosedValue || 'Not quantified'} />
                <Fact label="Duration" value={detail.duration || 'Not identified'} />
                <Fact label="Capacity" value={detail.capacity || 'Not identified'} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Fact label="Commercial model" value={detail.commercialModel || 'Not identified'} />
                <Fact label="Geography / facility" value={detail.geography || 'Not identified'} />
              </div>

              <FactBlock
                label="Hardware / infrastructure"
                value={detail.hardware || 'Not identified in extracted text.'}
              />

              <FactBlock
                label="Payment / revenue terms"
                value={detail.paymentTerms || 'Not identified in extracted text.'}
              />

              <FactBlock
                label="Extracted commercial summary"
                value={detail.summary || 'No contract-specific summary extracted.'}
              />

              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/35 mb-2">
                  Evidence from primary filing
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-2 aiw-scroll-region">
                  {detail.evidence.length ? (
                    detail.evidence.map((item, index) => (
                      <div
                        key={index}
                        className="text-[10px] text-white/45 leading-relaxed border-l border-cyan-400/20 pl-3"
                      >
                        {item}
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-white/30 font-mono">
                      No usable evidence snippets extracted.
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">
                Source: SEC EDGAR primary filing · {accession || 'accession unavailable'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/10 p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">
        {label}
      </div>
      <div className="text-[11px] font-mono font-bold text-white mt-1 break-words">
        {value}
      </div>
    </div>
  );
}

function FactBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/10 p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30 mb-1">
        {label}
      </div>
      <div className="text-xs text-white/65 leading-relaxed">{value}</div>
    </div>
  );
}
