# Loaded ledger review and remaining-position cost

Implemented 9 November 2026 in Codex Cloud on the Release 2 feature branch. This is the next ledger-reconciliation increment after [portfolio context integrity](release2-portfolio-context-integrity.md): manual, read-only diagnostics over already-loaded records, with the existing weighted-average calculator. It is not a broker-account reconciliation or automatic restoration of agent accounting totals.

## User flow

Open **Portfolio Intelligence → Evidence → Check loaded ledger records → Review loaded records**. The collapsed tool reports loaded holding/transaction counts, missing original fields and record/quantity problems. Valid packets can show conditional remaining cost, recorded trade result, purchases including known fees and sales after known fees, with per-symbol matches including fully closed positions.

This event runs locally. It adds no endpoint, HTTP request, quote refresh, model/JEV call, persistence, account setting, message or automatic retry. The screen reuses the portfolio's existing authenticated reads. Failed transaction reads now remain unavailable instead of becoming an indistinguishable empty list. A successful empty response is a different state. The report is in memory; changed input arrays/availability hide old figures until another explicit review, and leaving the Evidence workspace resets the panel.

**Matching loaded records is not full-history or corporate-action verification.** Results always retain `historyCoverage=unverified`, `corporateActionCoverage=unverified`, `accountingReconciled=false`, `verifiesSourceRecords=false` and `grantsDecisionEligibility=false`. The existing Python portfolio-context accounting totals remain withheld. No scanner, holding state, notification policy or validated signal family is upgraded.

## Preserve original fields before display defaults

The existing API has legacy display coercions: absent currency can become USD, an unknown transaction type can look like BUY, and boolean quantities can become numbers. New additive `accountingInputs` fields preserve the stored values before those conversions. They do not alter the existing display fields.

- Holdings carry `stored-holding-inputs-v1`, their normalized record symbol and a finite source quantity or null.
- Transactions carry `stored-ledger-inputs-v1`, symbol, type, quantity, gross amount, fee, exact-case currency, trade date, execution time and explicit derived flags.
- Supported finite SQL numeric strings are parsed; booleans, malformed/nonfinite values and absent fees/currency stay null. A reported fee of zero is retained. Currency case such as `GBp` survives and cannot become USD.
- Older DTOs lacking these fields cannot establish accounting provenance through their legacy defaults. The diagnostic requires a refreshed compatible response.
- These are **stored declarations**, not proof of broker source, account entitlement, original invoice currency or full import completeness. No table, column, query, grant or RLS change is added.

The report copies no notes, theses, destinations, source filenames, raw errors or credentials. Findings use fixed labels with bounded record IDs and symbols already present in the loaded packet.

## Deterministic gates and calculations

At most 150 holdings, 1,000 transactions and 150 distinct symbols, including closed names. Reject over-limit packets rather than truncating them into success. Findings are capped at 100 while invalid packets always withhold monetary results.

Require matching original/display holding identity/quantity, unique transaction IDs, exact provenance shapes, finite positive quantities/gross amounts, explicitly known nonnegative fees, exact USD currency and explicit non-derived/OK quality. No FX conversion or default-zero fee is allowed. Supported quantities fit eight decimal places and safe scaled-integer arithmetic; unsupported scales/magnitudes are withheld.

Trade dates must be real calendar dates and cannot follow assessment. Same-symbol, same-day mixed buys/sales require distinct timezone-bearing execution instants with millisecond-or-coarser precision, matching source trade dates and no future execution. Source/report row order is not execution proof. Same-side trades can be ordered deterministically without inventing an intraday mixed-action sequence. Venue calendars, licensing and date provenance remain unverified.

Replay **quantities only** as eight-decimal integers to reject sales before sufficient recorded inventory and exact holding/ledger mismatches, including cases the legacy relative tolerance would accept. The existing `calculatePortfolioTradingPerformance` remains the weighted-average monetary engine; no second FIFO or accounting method is introduced. Synthetic canonical sequence ranks are passed only after ordering is established. The holding's average-cost display value is not used to fill a ledger gap.

Calculate conditional record costs/results only after all gates pass. Preserve negative net sale proceeds when fees exceed gross proceeds. Check finite bounded outputs and the conservation identity:

```text
remaining recorded cost − recorded trade result
    = purchases including fees − sales after fees
```

Use an explicit floating arithmetic allowance for this identity, not a guessed financial discrepancy threshold. JSON and display numbers remain floating representations; this tool is not a precision-certified ledger. Very small nonzero amounts use scientific notation rather than displaying a fabricated zero.

The gross-amount-plus-separate-fees convention is the existing application's accounting assumption. Broker column semantics, missing imports, realized-lot method, corporate actions, transfers, dividends, taxes, FX and full historical coverage must be reviewed before treating these conditional outputs as account performance. No current marks or portfolio return percentages are calculated here.

## Numerical defect corrected in three existing paths

After a partial sale, the frontend, decision-center calculator and holding-return ledger previously cleared remaining inventory/cost whenever its quantity was below a tolerance proportional to the original position. Buying 100,000 shares for 100,000 USD and selling 99,999 for 99,999 USD could erase the final share's 1 USD cost and create an apparent gain.

All three now share `QUANTITY_EPSILON=0.000000005`: half the stored holding's eight-decimal share unit. Closure no longer scales with original position size, and an excessive sale cannot pass merely because it is small relative to a large position. Tests preserve the one-share remainder, the minimum recorded share unit and reject excess sales across the pure frontend/server paths.

This changes numerical inventory handling, not alert thresholds, schedules or recipients. After a future deployment it can change calculations and dependent eligibility where the old arithmetic was wrong. Broader legacy aggregate quantity tolerances and other accounting fallbacks remain audit work; this increment does not certify every calculation or replace those contracts.

## Implementation and verification

| Boundary | Implementation |
| --- | --- |
| Original source fields | `server/services/ledgerInputs.js`, additive fields in `api/portfolio.js` and `src/utils/portfolioApi.ts` |
| Strict loaded review | `src/utils/loadedLedgerReview.ts`, reusing `portfolioAccounting.ts` |
| Manual screen and availability | `src/components/portfolio/LoadedLedgerReview.tsx`, `PortfolioIntelligence.tsx` |
| Shared inventory precision | `shared/accountingPrecision.js`, used by frontend, decision-center and holding-return ledgers |
| Regression | `loadedLedgerReview.test.ts`, `ledgerInputs.test.js`, `qa/test_loaded_ledger_review.py` |

Local Cloud verification passed **638 Node tests** (53 additional cases), TypeScript/production build, source security, migration-manifest integrity, whitespace and 25 offline workflow-safety cases. All **ten new browser scenarios** passed, using fictional API responses and intercepted network boundaries. Coverage includes explicit activation with zero new requests/writes, unknown fees, legacy default rejection, quantity mismatch, unavailable versus empty history, closed positions and keyboard/360/768/1440px rendering. The real API normalizers and three accounting paths are exercised separately by injected-record unit tests.

The first browser run exposed incomplete fictional DTOs in the closed-position fixture: they omitted legacy trade-date fields consumed by another Evidence component. Corrected the fixture to the actual DTO shape; all assertions and the complete ten-case run passed. Screenshots contain fictional data only. Broader browser/screen-reader acceptance and the existing large-bundle warning remain open.

Applied React review: event-only bounded calculation, no new fetching/effects/storage, native disclosures/buttons, explicit loading/error states, input-bound in-memory results and no color-only status. Frontend and QA CI now include `shared/**` changes; the existing full mocked-browser job includes this file and uploads fictional screenshots. Deployment/live-check triggers remain unchanged. Exact-head CI is recorded in draft PR #168.

## Next steps and rollback

Establish authoritative import/history completeness, gross/fee semantics, corporate-action coverage, currency and inventory reconciliation before passing a reviewed receipt to Python or restoring agent P&L. Complete remaining cross-layer accounting tolerances/precision review and shared SEC/provider budgets. REA remains for feature-reference mirroring; no new framework, provider or REA installation was needed.

Rollback is a reviewed code/test/workflow revert, with no stored data, schema or message repair. No production secret, hosted query/write, live financial/model call, notification, merge or deployment occurred. Release 2 remains approximately 55% engineering complete; production rollout has not started.
