# Release 2 — shared accounting and Decision Center abstention

15 November 2026. Feature-branch increment for draft PR #168, within milestone 1. No production release or live acceptance is represented.

## Problem and resulting behavior

The server Decision Center had a separate permissive accounting path: missing fees could become zero, missing currency could become USD, an unusable ledger could fall back to stored average cost, and partial quotes/history closes could supply portfolio values and stress totals. Trading P&L was also exposed as cash-flow P&L, and downside impacts were clipped to zero.

The reviewed handler now uses `calculateReviewedServerPortfolio` over original stored rows and the same loaded-ledger and declared-quote checks used by the reviewed browser consumers:

- Missing/invalid fees, currency, identifiers, dates, execution order, derived markers, exact ending quantities or numeric support withhold ledger cost/P&L. Stored average cost never substitutes. Duplicate, oversold, unavailable and empty histories do not certify a reconciled account.
- Supported marks remain separate from ledger support. Admitted raw USD quotes require matching identity, explicit source/session/precision, valid observation/retrieval chronology and the existing valuation age policy. Last close remains distinct from live coverage. Stale/simulated/conflicting/incompatible quotes are withheld with bounded explanations. Yahoo normalization preserves explicit stale/simulation markers and declares precision from its original instant field.
- A missing mark withholds full current value, portfolio weights, concentration, stress totals and quote-dependent P&L. Conditional realized results and ledger cost may remain available when original loaded trades pass. No history-close or cost-price fallback supplies a current mark.
- Matched arithmetic is labelled `conditional-loaded-records`; history/corporate-action coverage remains unverified and `accountingReconciled`, `verifiesSourceRecords`, and decision authority remain false. Allocation-increase prompts cannot bypass the missing reconciliation contract.
- Profit-review selection and displayed rule impacts use conditional loaded-ledger cost, not stored average cost. Downside impacts retain their sign; unsupported impacts remain null. Known zero and tiny nonzero money remain distinct in the API and UI.
- External cash-flow P&L and benchmark comparisons are withheld until compatible dated cash-flow/history evidence is supported. The old cash-mirroring calculator remains exported for compatibility, but no longer supplies this handler's benchmark results. Two benchmark quote fetches are removed.

The UI shows Trading P&L with its conditional input requirements, expandable accounting/quote issues and a separate reconciliation gate. An empty prompt list no longer appears as a green clean bill of health. Comparison placeholders explain their missing evidence. Existing Telegram formatting/transport/policies are unchanged; this increment sends nothing and does not restore financial authority to downstream digests or agents.

## Shared source and compatibility

Canonical pure implementations now live in `shared/portfolioAccounting.js`, `shared/loadedLedgerReview.js`, `shared/quoteAdmission.js`, `shared/decisionEligibility.js`, `shared/freshness.js` and `shared/calendarInstant.js`. Typed TypeScript adapters preserve browser interfaces. Transaction-quality classification is reused from `server/services/ledgerInputs.js`; the existing Portfolio API normalizer retains its behavior.

Twelve pre-extraction ledger/consumer outputs and 21 declared-quote outputs are frozen against source commit `59eb550c7d4c8df63a776ee340906cc77e342a36`. Tests compare the shared implementations and typed browser adapters with these originals. Existing permissive calculators remain compatibility APIs; new consumers should use the strict review boundary. The loaded review's existing eight-decimal share, money bounds, chronology, weighted-average method and representation policies are preserved.

The Decision Center's existing authenticated transaction SELECT additionally requests existing `id`, `order_executed_at` and `price` columns. These are present in the local recorded schema and allow original identity/order/quality checks. No table, migration, grant, RLS policy, authentication permission, write path or production query was created or executed. Hosted schema/grant compatibility still needs separately authorized verification; mocks do not establish it.

## Evidence

- 1,714 Node cases pass, including 73 new retained-output, server/client parity, malformed-original, quote-admission, tiny-money, execution-order and privacy/bundle cases. Existing compatibility tests retain their assertions.
- Seventy focused browser/workflow cases pass across the accounting, valuation, alert, rule, calendar and CI-safety selection. Seven new cases run the **actual handler and math** with completely replaced transports, then feed its responses to the browser: supported records, unknown fees, missing/simulated quotes, tiny gains, observed zero and signed losses. They exercise disclosure, unavailable values, reconciliation withholding, 360px layout and zero writes.
- TypeScript, production build, source-security scan and the 32-file local migration-manifest integrity check pass. Final exact-head CI is recorded in draft PR #168. The existing large entry-bundle warning remains (approximately 1,768.4 kB / 491.6 kB gzip).

All records/events/credentials in replays are invented; subprocess environments omit provider credentials, every transport is replaced and no actual service is called. Fixture-only edits trigger the standard checks and the new browser cases are included in CI.

## Still pending before release or financial authority

1. Authentic broker/import acquisition, complete trade/opening-balance and corporate-action coverage, independently supported gross/net/fee conventions, external cash flows and FX evidence. Matching loaded records cannot establish these facts.
2. Supported history/price-basis/session coverage for trailing rules, benchmark comparisons and historical returns. Do not insert a hard-coded completeness flag to make missing-source checks pass.
3. Remaining server return-alert, historical, peer and FX consumers; account-wide provider coordination and measured resource limits; an authenticated internal receipt before restoring Python/agent P&L.
4. Hosted read/schema/access compatibility and integrated milestone acceptance, exact reviewed release candidate, protected environment/CLI/stage/rollback prerequisites. Development fixtures do not certify a production portfolio or justify a trade.

No merge, deployment, production secret access, hosted database operation, live polling activation or Telegram send occurred. Milestone deployments remain **0/5**.
