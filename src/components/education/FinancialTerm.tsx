import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { findFinancialTerm } from '../../data/financialTerms';
export type FinancialTermProps = { termId: string; children?: ReactNode; display?: 'inline' | 'icon' | 'label'; explanationLevel?: 'simple' | 'advanced' };
export default function FinancialTerm({ termId, children, display = 'inline', explanationLevel = 'simple' }: FinancialTermProps) {
  const [activeTermId, setActiveTermId] = useState(termId);
  const originalTerm = findFinancialTerm(termId);
  const term = findFinancialTerm(activeTermId) ?? originalTerm;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  useEffect(() => { if (open) dialog.current?.querySelector<HTMLElement>('h2')?.focus(); }, [activeTermId, open]);
  if (!originalTerm || !term) return <span>{children ?? 'Definition unavailable'}</span>;
  return <>
    <button ref={trigger} type="button" className="underline decoration-dotted underline-offset-4 text-cyan-200 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" aria-label={'Explain ' + originalTerm.label} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setActiveTermId(termId); setOpen(true); }}>{children ?? (display === 'icon' ? 'ⓘ' : originalTerm.label)}</button>
    {open && <dialog ref={dialog} aria-labelledby={id} onKeyDown={event => {
      if (event.key !== 'Tab' || !dialog.current) return;
      const root = dialog.current as HTMLDialogElement;
      const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], input, select, textarea, [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (!controls.includes(document.activeElement as HTMLElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }} onClose={() => { setOpen(false); trigger.current?.focus(); }} onCancel={event => { event.preventDefault(); dialog.current?.close(); }} className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl border border-white/20 bg-[#15181e] p-6 text-white backdrop:bg-black/70">
      <h2 id={id} tabIndex={-1} className="text-xl font-bold">{term.label}</h2>
      <p className="mt-3 text-base">{term.shortDefinition}</p>
      <p className="mt-3 text-sm text-white/80">Example: {term.example}</p>
      <p className="mt-3 text-sm text-amber-200">Common misunderstanding: {term.commonMisinterpretation}</p>
      <details className="mt-4 text-sm" open={explanationLevel === 'advanced'}><summary className="cursor-pointer">Advanced explanation</summary><p className="mt-2">{term.detailedExplanation}</p><p className="mt-2">{term.relevanceToMediumTermInvesting}</p></details>
      <nav aria-label="Related financial terms" className="mt-4 flex flex-wrap gap-2 text-sm">
        {term.relatedTermIds.map(id => { const related = findFinancialTerm(id); return related ? <button key={id} type="button" className="rounded border border-white/25 px-3 py-2 focus-visible:outline focus-visible:outline-cyan-300" onClick={() => setActiveTermId(id)}>{related.label}</button> : null; })}
      </nav>
      <button type="button" autoFocus onClick={() => dialog.current?.close()} className="mt-5 rounded border border-white/30 px-4 py-2 focus-visible:outline focus-visible:outline-cyan-300">Close explanation</button>
    </dialog>}
  </>;
}
