import { useId, useState } from 'react';
import { searchFinancialTerms } from '../../data/financialTerms';
import FinancialTerm from './FinancialTerm';

export default function FinancialGlossary() {
  const [query, setQuery] = useState('');
  const id = useId();
  const terms = searchFinancialTerms(query);
  return <section aria-label="Financial glossary" className="rounded-2xl border border-white/15 p-4 text-sm">
    <h2 className="text-xl font-bold">Financial glossary</h2>
    <p className="mt-2 text-white/70">Plain-language context for your 2–12 month research horizon.</p>
    <label htmlFor={id} className="mt-4 block">Find a financial term</label>
    <input id={id} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try EPS, cost basis or volatility"
      className="mt-1 w-full rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline focus-visible:outline-cyan-300" />
    <p className="mt-2 text-white/70" role="status">{terms.length} definitions found</p>
    {!terms.length && <p className="mt-3">No matching definitions. Try a different term.</p>}
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{terms.map(term => <li key={term.id}><FinancialTerm termId={term.id} /><p className="mt-1 text-white/70">{term.shortDefinition}</p></li>)}</ul>
  </section>;
}
