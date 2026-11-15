# Release 2 — missing-data analytics correction

Scope: the next calculation-audit increment on the existing Release 2 feature branch. No merge, deployment, hosted database work, notification, model call or new dependency is included.

## User story and corrected contracts

A user opens Performance or Money Flow → existing quote/history GET reads supply observations → client parsers and pure calculations establish numerical coverage → the screen shows an observed result or an explicit unavailable state. Missing inputs must not become a neutral group score, a low-risk label, a zero spread or a complete portfolio assembled from a subset.

### Quotes and groups

`parseQuoteObservation` requires an observed finite positive price and a finite numeric daily move. A genuinely observed zero move stays zero. Missing, blank, boolean, string-coerced and non-finite moves fail parsing; a response identifying another symbol is rejected. Missing low/high/previous-close fields remain null, and reversed ranges are withheld. The direct-provider and server fallback paths use the same contract. A price-only response cannot be silently promoted to a flat daily-move quote by `Number(...) || 0`.

`buildIntelligence` returns null averages, breadth, relative strength and scores for unobserved groups. It exposes observed/expected member coverage and ranks only groups with an actual score. The universe average is null without usable observations; this helper has no portfolio holdings input, so its portfolio aggregates remain unavailable instead of fabricated zeroes. Pair daily spreads require both observations.

Group/peer review calculations reject unusable daily moves and require complete supporting member/peer observations. An observed price can still support a price-only valuation while the missing move/review context stays unavailable. The existing decision-card quote/accounting/evidence gates remain authoritative, and their numerical review cutoffs are unchanged.

### Rotation

Missing history produces null rankings, not 50/100. A relative rank requires at least two observed groups. Equal returns use midpoint percentile ranks: all equal observations rank at 50, and a value between the middle two of four observations ranks at 50. The prior formula overstated ties and assigned 37.5 to that between-sample case.

History is checked as inert data: finite positive prices, valid date-only dates, unique dates, no dates after the assessment day, and chronological sorting without mutating input. A malformed symbol series is withheld rather than dropping bad rows and compressing its observation horizon. Duplicate rows, even identical ones, do not become extra daily samples.

Comparison windows use the latest source end date among configured rotation symbols. For each horizon, the most represented available start date is chosen, with date order breaking ties. A symbol outside that common window is withheld and its group coverage falls accordingly. Pair spreads require matching start/end dates. This prevents ranking different source periods as though they were the same period; it does not establish complete exchange calendars or adjusted-price provenance.

The UI displays observed coverage and source date boundaries. Direction now means **positive / negative / flat selected-period return**. Comparing a one-day cumulative return directly with a twenty-day cumulative return no longer creates a strengthening/weakening claim. Pair values are labelled by horizon rather than shown as a time-series sparkline with inferred widening/narrowing. Horizons retain 1/5/20/60/63/126 source observations; 3M/6M labels do not establish exact calendar-month coverage.

### Stress

`calculatePortfolioStressScore` retains every missing/invalid value in the expected exposure set. Every nonzero holding needs a usable current value and daily move before portfolio-wide breadth, average move, concentration penalty and the total can be released. It does not redistribute a missing holding's weight or mix its purchase cost into a current-value penalty. A known zero-value row contributes no exposure; an entirely empty/zero-exposure portfolio remains unavailable.

The UI passes a missing macro override until all exposure dimensions are assessed by the existing exposure helper. Null/invalid macro inputs cannot become zero macro stress. Existing exposure assessment may use baseline taxonomy; it is not independent verification of current events. Assessed and worst-case exposure remain separate. The existing stress weights and 45/70 label cutoffs are unchanged and remain descriptive heuristics.

An unavailable total has a null score and **Insufficient data** label. Genuine observed neutral moves can still produce a real zero in the unweighted stress helper. Hysteresis resets on missing/non-finite scores; the UI immediately withholds the old score rather than flashing or retaining an earlier contained result. Legacy `freshCount` now means numerically usable observations in these calculations; the screen says “usable” and explicitly distinguishes source/session freshness.

## Verification evidence

| Boundary | Evidence |
| --- | --- |
| Environment | Codex Cloud, current/enforced network policy, zero credential bindings |
| Browser entry and rendering | Seven fictional Playwright checks cover empty/partial portfolios, a numeric-to-unavailable transition, valid dated rotation and missing rotation at 360/768/1440px |
| Client → API | Existing quote/history/portfolio GET requests intercepted; each new browser case asserts zero POST/PUT/PATCH/DELETE requests |
| API/data boundary | Fictional responses only. No hosted handler, provider, stored portfolio or database is used; this boundary is not production-verified |
| Parser → calculation | Twenty new unit/transport cases verify missing/invalid/neutral observations, full versus partial coverage, tied ranks, dates/windows, null macro evidence and reset behavior |
| Calculation → UI | No fabricated 50/100 rotation ranking, zero pair spread, empty-portfolio 0/100 or retained contained score. Screenshots in `/workspace/artifacts/missing-analytics-{360,768,1440}.png` |

Local checks: 517 Node/TypeScript unit tests, the seven new browser cases, TypeScript, source security audit, production bundle build, local 32-file migration-manifest verification and whitespace checks passed. The broader browser/workflow run passed 146 cases and encountered one `net::ERR_ABORTED` navigation to Contracts during the 768px route inventory. The complete 768px inventory passed in isolation (17 routes with layout/label/error assertions); no assertion or retry gate was removed. Exact-head CI outcomes are recorded in draft PR #168. The existing large-bundle warning remains.

## Open evidence and next work

Numerical availability is not independent source-quality verification. Provider/session timestamp provenance, stale caches, simulation/conflict status across legacy consumers, split/dividend adjustment, point-in-time issuer history and real calendar completeness still require the shared source/rule contract audit. Existing decision-card eligibility checks are retained; this increment does not grant a new holding classification through a second scanner or activate a sender.

Concentration/attribution outside the stress calculation still have legacy cost-fallback paths requiring their own contract review. Group/stress/macro weights, non-negative breadth conventions and paper-allocation scores are not calibrated probabilities. Historical outcomes, model sensitivity and forecasting validity remain unproven by fixtures. The overall calculation audit stays open; this closes the identified frontend missing-data defects rather than certifying every arithmetic-bearing file.

Rollback is an application-code revert. There is no database rollback, stored-rule rewrite, provider setup, scheduler change or notification replay.
