import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileSearch } from 'lucide-react';

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
  summary: string | null;
  evidence: string[];
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
        const endpoint = '/api/contract-detail?symbol=' + encodeURIComponent(symbol)
          + '&accession=' + encodeURIComponent(accession || '')
          + '&url=' + encodeURIComponent(url);
        const res = await fetch(endpoint);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Contract extraction failed');
        if (!cancelled) setDetail(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Contract extraction failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, detail, symbol, accession, url]);

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
          Extract terms from SEC filing
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/35" /> : <ChevronDown className="w-4 h-4 text-white/35" />}
      </button>

      {open && (
        <div className="p-4 bg-[#0F1115]/40 space-y-4">
          {loading && <div className="text-[10px] font-mono text-white/35">Reading primary SEC filing…</div>}
          {error && <div className="text-[10px] font-mono text-rose-300">{error}</div>}
          {detail && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Fact label="Counterparty" value={detail.counterparty || 'Not identified'} />
                <Fact label="Disclosed value" value={detail.disclosedValue || 'Not quantified'} />
                <Fact label="Duration" value={detail.duration || 'Not identified'} />
                <Fact label="Capacity" value={detail.capacity || 'Not identified'} />
              </div>

              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/35 mb-1">Hardware / infrastructure</div>
                <div className="text-xs text-white/70 leading-relaxed">{detail.hardware || 'Not identified in extracted text.'}</div>
              </div>

              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/35 mb-1">Extracted commercial summary</div>
                <div className="text-xs text-white/70 leading-relaxed">{detail.summary || 'No contract-specific summary extracted.'}</div>
              </div>

              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/35 mb-1">Evidence snippets</div>
                <div className="space-y-2">
                  {detail.evidence.map((item, index) => (
                    <div key={index} className="text-[10px] text-white/45 leading-relaxed border-l border-cyan-400/20 pl-3">{item}</div>
                  ))}
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
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">{label}</div>
      <div className="text-[11px] font-mono font-bold text-white mt-1 break-words">{value}</div>
    </div>
  );
}
