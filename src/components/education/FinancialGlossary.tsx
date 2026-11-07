import { financialTerms } from '../../data/financialTerms';
import FinancialTerm from './FinancialTerm';
export default function FinancialGlossary() {
  return <section aria-label="Financial glossary" className="rounded-2xl border border-white/15 p-4 text-sm">
    <h2 className="text-xl font-bold">Financial glossary</h2><p className="mt-2 text-white/70">Plain-language context for your 2–12 month research horizon.</p>
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{financialTerms.map(term => <li key={term.id}><FinancialTerm termId={term.id} /><p className="mt-1 text-white/70">{term.shortDefinition}</p></li>)}</ul>
  </section>;
}
