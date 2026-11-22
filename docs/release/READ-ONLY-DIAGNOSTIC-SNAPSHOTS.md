# Read-only source and accounting diagnostic snapshots

22 November 2026 · `feature/read-only-health-snapshot` · based on deployed main `978ccefac76e36fa24e4b35cab2f1a08cbaca899`.

## Problem and behavior

Production UI and quote repairs shipped in PR #187, but authenticated per-symbol source availability and full accounting remain unverified. Data Health samples the internal provider router (SPY plus up to three holdings); browser quotes use the public Yahoo endpoint. A successful sample cannot certify that separate route or full portfolio coverage. Ledger issue details currently sit beside private position data, which makes sharing troubleshooting evidence difficult.

This increment adds a local diagnostic preview/copy control in Data Health and the Overview accounting disclosure. Prepare builds a small report from the response already held in component state. The user reviews it and separately clicks Copy; clipboard rejection leaves a selectable read-only preview. No report is uploaded, stored persistently, logged or sent to Telegram. Existing page requests and refresh behavior are unchanged; the controls make no request themselves.

## Contract and privacy

`health-diagnostic-snapshot-v1` uses explicit field projection. It omits ticker symbols, holding/transaction counts and IDs, account values, prices, quantities, cash flows, source URLs, raw errors, reason messages, keys and auth headers. Do not replace projection with JSON serialization of a server response. Fixed provider/status/error vocabularies map unknown strings to `unknown`; missing booleans/counts remain null. Channel identifiers use only the six known public channel names; additional names are omitted with a flag.

- Source report: up to four numbered rows, up to three attempts per quote/history, fixed provider error codes, declared quote metadata presence, reported eligibility/status, history adjustment counts, and original sample/quote timestamps. It names the internal-router scope and explicitly does not claim to test the public endpoint.
- Accounting report: declared accounting/quote-coverage states and counts of canonical ledger issue entries and allowlisted field-specific details (including unknown and truncation). Up to 250 entries are summarized. Counts do not mean distinct records, complete history or issue-free accounting; absent issue lists remain null.
- `preparedAt` is separate from the original `observedAt`. Copy does not change the prepared report, ages or eligibility. The preview stays frozen through page refresh; Prepare again creates a newer snapshot from currently loaded data. Invalid/future observation times remain null.
- `grantsDecisionEligibility` is always false. Declared conditional ledger matching never establishes history/corporate-action coverage, benchmark eligibility or verified P&L.

## Files and verification

`src/utils/healthDiagnosticSnapshot.ts` implements deterministic projections; its tests cover field injection, unsupported vocabulary/types, bounds, failed/empty responses, timestamps and financial redaction. `DiagnosticSnapshot.tsx` handles explicit preparation, preview and clipboard fallback. DataHealth/DecisionImpactCenter integrate it without fetching. Existing browser suites exercise narrow/wide layouts, keyboard access, real handler-produced fictional fee/ledger failures, exact clipboard text and zero additional requests/writes.

Local test results and exact-head CI are recorded in CODEX-CONTINUATION.md and the draft PR. Tests use fictional/intercepted data; no live source or account completeness is inferred. Production is unchanged by this feature branch.

## Next acceptance

After review and a separately approved deployment, use an authenticated app session to prepare redacted source/accounting snapshots. Compare internal provider errors with the actual public quote route rather than assuming they are equivalent. Choose provider repairs only from observed contract/failure evidence. Reconcile authentic broker history, fee/currency/corporate-action coverage before changing any financial gate. Never paste auth tokens or full private account packets into a report.

Event Radar source acquisition, prospective forecast outcomes and frozen-evidence Bull/Bear/Judge usefulness comparisons remain separate pending work. This control does not authorize model activation, new polling, database writes, messages or deployment.
