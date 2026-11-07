import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { findFinancialTerm } from '../../data/financialTerms';
export type FinancialTermProps = { termId: string; children?: ReactNode; display?: 'inline' | 'icon' | 'label'; explanationLevel?: 'simple' | 'advanced' };
export default function FinancialTerm({ termId, children, display = 'inline', explanationLevel = 'simple' }: FinancialTermProps) {
  const term = findFinancialTerm(termId);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  if (!term) return <span>{children ?? 'Definition unavailable'}</span>;
  return <>
    <button ref={trigger} type="button" className="underline decoration-dotted underline-offset-4 text-cyan-200 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" aria-label={'Explain ' + term.label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{children ?? (display === 'icon' ? 'ⓘ' : term.label)}</button>
    {open && <dialog ref={dialog} aria-labelledby={id} onClose={() => { setOpen(false); trigger.current?.focus(); }} onCancel={event => { event.preventDefault(); dialog.current?.close(); }} className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/20 bg-[#15181e] p-6 text-white backdrop:bg-black/70">
      <h2 id={id} className="text-xl font-bold">{term.label}</h2>
      <p className="mt-3 text-base">{term.shortDefinition}</p>
      <p className="mt-3 text-sm text-white/80">Example: {term.example}</p>
      <p className="mt-3 text-sm text-amber-200">Common misunderstanding: {term.commonMisinterpretation}</p>
      <details className="mt-4 text-sm" open={explanationLevel === 'advanced'}><summary className="cursor-pointer">Advanced explanation</summary><p className="mt-2">{term.detailedExplanation}</p><p className="mt-2">{term.relevanceToMediumTermInvesting}</p></details>
      <button type="button" autoFocus onClick={() => dialog.current?.close()} className="mt-5 rounded border border-white/30 px-4 py-2 focus-visible:outline focus-visible:outline-cyan-300">Close explanation</button>
    </dialog>}
  </>;
}
