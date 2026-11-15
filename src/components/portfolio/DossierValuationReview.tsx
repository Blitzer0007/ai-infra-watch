import FinancialTerm from '../education/FinancialTerm';
import type {reviewDossierValuation,ValuationInputStatus} from '../../utils/dossierValuation';
const labels:Record<ValuationInputStatus,string>={'missing':'Missing','not-connected':'Not connected','declaration-only':'Declaration only',nonpositive:'Not meaningful','selection-needed':'Selection needed',partial:'Incomplete scope',unverified:'Unverified',unsupported:'Unsupported'};
export default function DossierValuationReview({review}:{review:ReturnType<typeof reviewDossierValuation>}){
  return <section aria-label="Valuation input review" className="grid min-w-0 gap-3 lg:grid-cols-2">
    {([{id:'annual-pe',term:'pe',title:'Price / annual diluted EPS',summary:'P/E input checklist',group:review.pe},{id:'ev-ebitda',term:'ev-ebitda',title:'EV/EBITDA',summary:'EV/EBITDA input checklist',group:review.evEbitda}]).map(card=><article key={card.id} data-testid="dossier-valuation-checklist" data-multiple={card.id} className="min-w-0 space-y-2 break-words rounded-lg border border-white/20 p-3">
      <h4 className="font-semibold [&_button]:min-h-11 [&_button]:text-left"><FinancialTerm termId={card.term}>{card.title}</FinancialTerm></h4>
      <p data-testid="valuation-withholding">{card.group.status==='not-meaningful'?'Not meaningful with zero or negative diluted EPS.':'Withheld · missing or unverified compatible inputs.'}</p>
      <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">{card.summary}</summary>
        <dl className="space-y-3">{card.group.checks.map(check=><div key={check.id} data-input={check.id}>
          <dt className="font-semibold">{check.label} · {labels[check.status]}</dt><dd>{check.detail}</dd>
        </div>)}</dl>
      </details>
    </article>)}
  </section>;
}
