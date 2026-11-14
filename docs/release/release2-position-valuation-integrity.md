# Loaded position valuation — missing P&L and current-value integrity

14 November 2026 · Codex Cloud · existing Release 2 feature branch / draft #168.

## Problem and resulting behavior

The [financial safety baseline](release2-event-risk-radar-review.md) found zero P&L defaults when prices were unavailable and invested cost used in place of current values/weights. The same substitution existed in concentration, attribution and macro-exposure inputs. A separate boundary review found that the existing portfolio API serializer coerces stored null/boolean/empty fields to numeric display defaults before the browser receives them.

This increment preserves missing values end-to-end for the reviewed loaded-position paths. It does not prove account completeness, broker source truth or predictive usefulness, and it does not modify a hosted database or activate a sender.

| Example | Result |
| --- | --- |
| Two shares, recorded USD cost $50/share, admitted price $100 | Current value $200, estimated P&L $100, return 100% |
| Same position, no usable quote | Current value/P&L/return unavailable; recorded cost remains separately visible |
| Price equals supported cost | Observed zero P&L and 0% return remain zero |
| One of two holdings lacks value | All full-denominator weights/concentration/total are withheld; the visible subset is not normalized to 100% |
| One holding valued at $100 and another at $200, both cost $50 | Current weights 33.3% / 66.7%, independent of equal invested cost |
| Stored cost null, legacy DTO cost 0 | Original input trace withholds P&L; the default cannot become a free-cost profit |
| Explicit stored zero USD cost | Dollar difference may be estimated; return percentage remains unavailable because its denominator is zero |
| Unsupported/missing cost currency | USD position value can remain observable when quantity/quote are supported; cost/P&L arithmetic is withheld |

## Shared quote admission and arithmetic

`src/utils/quoteAdmission.ts` consolidates the declared identity/source-mode/raw-USD/precision/quality/comparison checks previously in the browser-alert gate. It reuses `normalizeDecisionQuote` and `evaluateQuoteQuality`. Valuation retains the existing review policy: up to two hours for supported observations/retrieval, or explicit supported last-close metadata within the existing 96-hour market / two-hour retrieval policy. The two-minute future/ordering tolerance is unchanged. Automatic browser alerts still independently require an open regular session and at most 15 minutes; the original 55 browser-alert cases are retained.

`portfolioPositions.ts` takes an optional explicit assessment clock, uses admitted prices and finite supported quantities, and preserves null current value, P&L and percentage. Daily change is independently missing when absent. Cost must be finite, nonnegative, USD and consistent with the loaded quantity × average-cost derivation; a supplied original-input trace must also bind. These checks establish declared-input consistency, not authoritative accounting. Existing review thresholds are unchanged; unsupported inputs withhold review/average-in/recovery flags.

`calculatePositionScenario` performs bounded hypothetical target arithmetic separately from current observations. Missing/invalid cost, unsupported quantities, overflow and zero percentage denominators remain unavailable. Hypothetical references never substitute for current valuation. `snapshotCurrentValue` no longer receives invested cost; it stays null when no current snapshot is supplied.

## Original holding inputs without database changes

The existing `api/portfolio.js:normalize` response gains an additive `valuationInputs` object:

```ts
{ contractVersion: 'stored-holding-valuation-v1',
  symbol: string | null, quantity: number | null,
  averageCost: number | null, currency: string | null }
```

`server/services/ledgerInputs.js` preserves finite original numeric declarations before legacy `Number(...)` coercion. Null, empty, boolean and malformed values remain null; explicit zero is preserved. The existing accounting-input v1 contract, query, authentication and write behavior are unchanged. No column, SQL, schema, migration, service credential or client-side database access is added.

The browser binds this trace to the displayed symbol/quantity/cost/currency. A malformed/mismatched trace cannot grant quantity or cost coverage. Legacy DTOs without a trace are treated only as declared input values and require explicit USD cost currency; they do not establish original storage or full-history provenance. Hosted frontend/backend compatibility still needs authorized release acceptance. The trace is not a signed receipt or independent source authentication.

## Consumers and read-only UI

- `measurement.ts`: concentration requires every loaded value to be finite and nonnegative, an unambiguous symbol set and a finite aggregate. Empty scope, partial values, duplicate identities, overflow and zero denominators have distinct null/coverage behavior. Attribution retains unavailable rows, known signed/zero dollar contributions, and withholds normalized weights/percentage contributions until their full denominators are supported.
- `withCurrentPortfolioWeights`: one concentration boundary supplies position weights/minor-position flags; missing weights are null rather than 0%. `decisionCardAdapter` cannot restore price/quantity valuation or eligibility after position-input admission failed.
- `PortfolioIntelligence.tsx`: cards/table/sorting/detail use current values without cost fallback. Missing P&L/weights render unavailable without healthy/red numeric classifications. Missing weight cannot produce a green “within allocation plan” message. Original-input gaps, zero cost denominators and hypothetical arithmetic remain visible rather than coerced.
- Macro-exposure weighting is withheld when current valuation coverage is incomplete. Stress/concentration/attribution preserve missing denominators. A failed existing ledger assessment cannot silently fall back to a different holding-cost P&L when transaction records are present. Loaded holding-cost estimates remain conditional when there is no trade history, and cost labels distinguish their basis.
- `PortfolioCashFlows.tsx`: uses the same quote admission and original quantity support for its price inputs; cached data is judged by actual quality/time metadata rather than its cache marker alone. Existing cash-flow/ledger accounting logic and forms are retained; full original trade-input consumption and authoritative coverage remain pending.
- `PortfolioValuationCoverage.tsx` / `PortfolioAttributionRows.tsx`: read-only coverage, per-holding limits, unknown contributions and loaded-scope explanations. Native details controls are keyboard accessible. No new effect, request, timer, storage preference, library, endpoint, model or sender.

The scoped API/client changes retain missing-data evidence; they do not complete valuation parity for every server scanner, historical/peer/forecast consumer or Python handoff. No holding decision is made eligible merely because current market value can be estimated.

## Offline verification

The new tests use invented records/declared source packets, fixed clocks and intercepted APIs. They are not real vendor or account evidence. Existing decision/classification assertions retain their numeric expectations; their positive fixtures now supply the required metadata/clock. The older missing-data browser fixture also has explicit fictional provenance and a frozen clock rather than an implicit “qa” price being accepted for valuation.

Coverage includes missing/stale/simulated/conflicting/mismatched/foreign-unit quotes; genuine zero return versus missing; original serializer null/boolean/empty coercions; cost currencies; missing versus zero cost; quantity/cost binding; partial/zero/overflow/duplicate denominators; signed attribution; closed-session reference versus automatic-alert admission; immutable/browser-safe computation; and Command Center re-admission prevention.

Browser cases cover Holdings → detail → Performance; partial/complete/recovered/lost coverage; source/quantity/cost gaps; cash-flow valuation loss; zero versus unavailable P&L; 360/768/1440px overflow and keyboard details. APIs are intercepted; no production request or write is made. The offline QA workflow includes these cases and screenshots. Local verification passes **1,214 Node tests** (53 new valuation/source cases), **12 new valuation browser checks**, the existing **seven missing-data browser checks**, **25 CI-safety checks**, TypeScript, production build, security audit, local migration-file integrity (32 files), workflow YAML and whitespace checks. Exact-head GitHub CI is a separate acceptance check. Existing large-bundle and wider accessibility/resource work remain open.

## Remaining work and limits

Authoritative full trade/import history, fees/gross amounts, same-day ordering, dividends/splits/cash flows, original transaction-input consumption, backend/Python accounting receipts, broader source/valuation parity and hosted acceptance remain open. Quote metadata cannot authenticate a publisher or prove corporate-action correctness. Existing benchmark/history and peer assumptions are not certified by this patch. Complete coverage here means the loaded positions, not the complete account.

The core engineering estimate remains approximately 60%; this is a scoped financial-safety increment. No merge, deployment, hosted Supabase operation, secret retrieval, live monitoring or Telegram message was performed.
