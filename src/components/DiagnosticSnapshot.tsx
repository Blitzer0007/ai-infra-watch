import { useState } from 'react';

type Props = { label: string; buildReport: () => unknown };

/** No effects, requests, storage or automatic clipboard access. */
export default function DiagnosticSnapshot({ label, buildReport }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);

  function prepare() {
    setText(JSON.stringify(buildReport(), null, 2));
    setStatus('Prepared from loaded data. Review before sharing.');
  }
  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. No data was sent to a server.');
    } catch {
      setStatus('Clipboard unavailable. Select and copy the preview manually.');
    } finally { setCopying(false); }
  }

  return <details className="mt-3 border-t border-white/10 pt-3" aria-label={label}>
    <summary className="cursor-pointer text-xs font-semibold">{label}</summary>
    <p className="mt-2 text-xs text-white/50">Prepare a redacted report from loaded data. Symbols, account values, quantities, record IDs and raw messages are omitted. No refresh or upload is performed.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={prepare} disabled={copying} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40">Prepare {label.toLowerCase()}</button>
      {text && <button type="button" onClick={copy} disabled={copying} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40">{copying ? 'Copying…' : 'Copy report'}</button>}
    </div>
    {text && <>
      <p className="mt-2 text-xs text-white/50">This snapshot stays unchanged when page data refreshes. Prepare again to capture a newer observation.</p>
      <textarea aria-label={label + ' preview'} readOnly value={text} rows={12} className="mt-2 w-full min-w-0 rounded-lg border border-white/15 bg-transparent p-3 font-mono text-xs" />
    </>}
    <p role="status" className="mt-2 text-xs text-white/60">{status}</p>
  </details>;
}
