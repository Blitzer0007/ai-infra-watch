# Release 2 — valuation input explanations and missing glossary definitions

Implemented offline in Codex Cloud on the existing feature branch, 15 November 2026. The dossier now explains **why** its price/annual-diluted-EPS and EV/EBITDA multiples remain unavailable. This is a read-only diagnostic presentation over the existing independently admitted statement inputs, not a new financial calculation, price feed or valuation-eligibility contract.

## Behavior and interfaces

`reviewDossierValuation(symbol, reference, packet)` in `src/utils/dossierValuation.ts` invokes the existing original-row/issuer/period admission once and returns that canonical admission plus two bounded input checklists. `CompanyDossier` reuses the returned admission for the statement cards; it does not run a second validation pass or retain derived readiness state between inputs. Invalid/failed/replaced packets cannot leave earlier figures in the review.

The compact **Valuation input review** has two cards, with native keyboard-accessible expandable checklists:

- Price / annual diluted EPS: compatible price, a single explicit annual diluted EPS declaration, period/share-class/currency/split/adjustment compatibility, and issuer/original-source verification.
- EV/EBITDA: compatible price, point-in-time common shares, cash, complete non-overlapping interest-bearing debt, supported annual EBITDA, other applicable capital claims, compatible dates/currency/adjustments, and source/issuer verification.

Each input remains labelled missing, not connected, declaration only, selection needed, incomplete scope, unverified, unsupported or not meaningful. No fully-ready state exists in this stage. Both multiple values stay null and source/issuer/valuation/decision authority stays false, even when every supported raw statement declaration is present.

Specific distinctions:

- A positive diluted EPS declaration is **declaration only**, not proof of compatible earnings. Supported zero or negative EPS is visible as an observed value with a nonpositive-denominator explanation; it never becomes missing or a positive multiple. Basic EPS is not silently substituted for the deliberately labelled diluted-EPS review; a future explicitly defined basic-EPS calculation is a separate contract.
- Several annual EPS periods require an explicit choice; this view does not guess the latest. A single reported fiscal year is not automatically trailing twelve months, and no forward estimate is inferred.
- Only point-in-time common shares satisfy that declaration slot. Cover-page and weighted-average shares retain their separate scopes and do not replace it. Multiple cash/share dates also need an explicit compatible-date choice.
- Observed zero cash remains a declaration. Missing cash/debt is not zero. Borrowing components retain incomplete scope regardless of whether one or all supported components are loaded; they are not summed and cannot establish total debt or a debt-free company.
- EBITDA is unsupported. Operating income, operating cash flow and arbitrary add-backs cannot replace it. Preferred equity, noncontrolling interests and other applicable EV claims remain unverified rather than assumed absent.
- No chart price, holding purchase cost, analyst target, new provider read or live quote is used. Actual holding dossiers still supply no financial packet and display the corresponding gaps.

The existing original declaration cards remain available below the review. Source metadata, filing dates and publication bounds retain their previous meanings; none of the new labels authenticate a publisher, an economic share class or actual historical availability.

## Contextual glossary

The static glossary now contains **22** definitions. New standalone **EPS growth** and **EV/EBITDA** entries are searchable in Guide and linked directly from the dossier's Growth/Valuation sections. The P/E entry now distinguishes a fiscal year from trailing twelve months and states price/EPS basis requirements.

EPS growth explains the positive-baseline formula, zero/negative-baseline limitations, loss-to-profit turnaround wording, equivalent periods, basic/diluted and reported/adjusted earnings, splits/restatements and buybacks. EV/EBITDA explains enterprise-value claims, eligible cash, period/currency/share consistency, reported/adjusted EBITDA, nonpositive denominators and why liabilities are not debt. Static worked examples are educational and do not use holding data or imply a calculation in the dossier.

The existing modal component supplies focus containment, Escape dismissal, trigger-focus restoration and related-term navigation. Checklists default closed to limit page length. No new global listeners, effects, persistence, dependency, fetch, model call, sender or endpoint is introduced. The optional holding disclosure retains its deferred code loading and contained load-failure behavior.

## Verification and remaining work

22 new Node cases cover original-input admission and scope tampering, all six source failures, observed zero/loss/tiny EPS, missing diluted EPS, multiple annual/share dates, cash-only/unsupported-currency coverage, zero cash and incomplete debt, period/EBITDA semantics, input isolation, forbidden clock/network calls and glossary caveats/link integrity. Eleven added browser cases exercise collapsed input checks, zero/loss/missing/ambiguous/failed-source states, contextual glossary dialogs and the searchable Guide entries. The full Node suite passes 1,484 cases; the combined statement/dossier/Guide browser regressions pass 53 cases. Existing holding/navigation regressions also remain in CI. Screenshot evidence uses the fictional `dossier-statements-{360,768,1440}.png` artifacts for the compact view, with expanded checklist overflow and 44px contextual help targets checked separately; this does not certify full accessibility or other browsers.

The remaining-work register marks the two glossary definitions implemented. Compatible price/share/EPS adjustment contracts, broader debt/taxonomy/capital-structure/EBITDA coverage, authentic acquisition and issuer evidence, real holding integration and actual valuation calculations remain pending. The approximate 60% core engineering estimate is unchanged. Existing bundle-size/resource acceptance remains separate; exact-head CI is recorded in draft PR #168.

No merge, deployment, production Supabase operation, live polling, provider/model request or Telegram message is included. Event Risk Radar remains fixture-only; its authentic account/source acquisition, real-history evaluation and separately authorized scheduling/delivery prerequisites are unchanged.
