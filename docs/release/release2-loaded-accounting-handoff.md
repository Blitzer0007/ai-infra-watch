# Release 2 — original-input accounting and offline Python cross-check

Implemented in Codex Cloud on the existing Release 2 feature branch, 14 November 2026. This increment consumes original loaded inputs in the reviewed client summaries and provides an **offline** Python cross-check. It does not establish authoritative account history or restore agent P&L. No merge, deployment, hosted database operation, live provider/model request, credential access or message is included.

## Problem and resulting behavior

The manual loaded-ledger checker already rejected unknown fees/currency, derived records, ambiguous ordering and exact quantity mismatches. Portfolio's trading and cash-flow summaries could still bypass that checker, consume normalized defaults and fall back to holding-average cost. A cash-flow DTO also normalized missing currency to USD before its consumer could distinguish an original declaration.

- `reviewedPortfolioAccounting.ts` uses the existing `reviewLoadedLedger` and its weighted-average engine. Original trade inputs determine cost, fees, realized result and quantity reconciliation; normalized display fields cannot substitute. Unsupported/unavailable/empty trade history withholds ledger cost and P&L rather than falling back to stored average cost.
- Current holding valuation remains separately available when supported by the existing quote admission and original quantity. Marks must bind exactly to the original symbol/quantity with no duplicates. Missing marks withhold quote-dependent P&L while retaining conditional realized results from valid loaded trades.
- The trading summary explicitly labels its valid results **Loaded-record calculation · full history unverified**. Observed zero is retained; unavailable remains an em dash. Tiny nonzero monetary results use scientific notation rather than displaying zero.
- Decision cards receive `accountingReconciled: false`, even for matching loaded records. Conditional arithmetic cannot grant decision eligibility. Full-history proof has no implementation shortcut in this increment.
- `storedCashFlowInputs` preserves original date/type/amount/currency/FX alongside the existing display DTO. It adds no database field, query, permission or write behavior. The existing save/delete forms remain unchanged.
- `reviewedCashFlowAccounting.ts` requires the strict trade review plus original cash-flow inputs, unique record IDs, valid nonfuture dates, explicit currency and positive finite amount/FX. USD requires exactly 1 USD per USD. Failed/loading retrieval is distinct from a successful empty result. Display defaults, bool/null coercions and duplicate flows cannot supply account totals. Valid results are still conditional on these loaded records and the stated gross/fee convention.

The existing legacy calculators remain for compatibility/tests. This change gates their reviewed client consumers rather than introducing a competing accounting method. It does not audit or fix every server ledger, import writer, historical return or FX consumer.

## Offline Python handoff boundary

`buildAccountingCrosscheckPacket` produces `loaded-accounting-crosscheck-v1` only after a successful strict loaded-record review. It allowlists holding symbol/quantity, transaction ID/symbol/action/quantity/amount/fee/currency/date/execution time, assessment time and the client’s expected per-symbol/totals. No notes, credentials, URLs, quotes, account identifiers or private source text enter the packet. Transaction record IDs are retained for ordering and uniqueness, so real packets would still be private accounting data.

`app/mcp_client/accounting_crosscheck.py` is a pure standard-library module and bounded stdin/stdout CLI. It imports no application configuration, source service, database, model, provider or tool. It independently validates and recomputes weighted-average inventory using 50-digit Decimal arithmetic and exact integer share units. Same-day mixed actions require distinct offset-aware execution instants; oversells, duplicate keys/IDs, unknown fields, malformed timestamps and unreconciled ending quantities fail before a receipt.

| Boundary | Limit / semantics |
| --- | --- |
| Input | 512 KiB UTF-8 JSON; duplicate keys and nonfinite constants rejected |
| Scope | At most 150 symbols/holdings and 1,000 trades; at least one trade |
| Quantity | Nonnegative exact eight-decimal share units, bounded by binary64's safe-integer scaled range; positive trades |
| Money | Finite supplied numbers, each absolute value and computed monetary total at most 1e12; explicit nonnegative fees; USD only |
| Supported convention | BUY cost = gross amount + separate fee; SELL proceeds = gross amount − separate fee; weighted-average cost |
| Comparison | Relative binary64 representation allowance: 64 × 2^-52 × trade count × result magnitude; no absolute monetary floor; zero cannot match a nonzero Decimal result |
| Receipt | SHA-256 of actual input bytes, assessment/scope/method, Decimal monetary strings and conditional status; monetary totals withheld on mismatch |
| Activity | Zero provider/model/database calls; no new HTTP endpoint, timer, worker, persistence or UI request |

The comparison allowance is an arithmetic representation policy, **not** a broker-reconciliation discrepancy threshold or permission to adjust money. Cancellation may conservatively fail a comparison. Matching supplied expected figures is independently recomputed; a hash authenticates neither the source nor the historical availability of those inputs.

All receipts retain `historyCoverage` / `corporateActionCoverage: unverified`, `verifiesSourceRecords`, `accountingReconciled`, `grantsDecisionEligibility` and `restoresAgentPnl: false`. The module is deliberately **not wired into the live `app.get_portfolio_context` tool or model arguments**. The existing portfolio-context-v2 P&L withholding and database selection are unchanged. A later authenticated, internally produced full-history receipt needs a separate reviewed contract; a caller/model cannot assert one using this packet.

## Evidence

Eight frozen invented cases exercise known fees, weighted-average partial sales, fees exceeding sale proceeds, the minimum remaining share unit, tiny money, fractional quantities, execution ordering and multiple/closed symbols. They are arithmetic fixtures, not authentic historical account events.

- 1,254 Node tests pass, including 40 new original-input/consumer/DTO cases.
- 44 independent Python/cross-language cases pass. Actual TypeScript packet generation feeds Python Decimal recomputation; tampering, duplicate JSON keys, malformed/nonfinite/underflow inputs, bounds, false authority fields, ordering and sanitized CLI failures are exercised.
- 13 new mocked browser cases cover valid conditional figures, legacy/unknown fee/currency/quantity inputs, failed retrieval, cash-flow gaps, tiny results, zero writes and 360/768/1440px. Existing valuation/ledger/missing-data cases are retained with their assertions. Positive cash-flow fixtures now explicitly provide fictional original inputs rather than relying on DTO defaults.
- Existing Python portfolio-context regressions and CI/deployment safety checks verify continued withholding and inactive production paths. TypeScript, build, source-security, local migration-file integrity, workflow syntax and whitespace checks are included in validation.

Exact-head CI is recorded in draft PR #168. Screenshots/logs are Cloud artifacts under `/tmp/aiw-accounting`; the existing large client-bundle warning remains. Browser APIs are intercepted and external requests blocked; serializer tests inject records rather than querying hosted Supabase. Hosted query/RLS/provider acceptance is not represented by these tests.

## Still required

1. Establish authoritative import/full-trade and opening-balance coverage, source-authenticated record acquisition, broker gross/net/fee conventions, original cash-flow/FX evidence and corporate actions/dividends/splits. Loaded metadata alone cannot establish these facts.
2. Review remaining server/historical/peer/FX consumers and accounting-method/precision parity across supported complete histories. Extend reconciliation beyond this conditional USD weighted-average contract as required.
3. Design and validate an internal authenticated receipt and completeness/coverage contract before restoring live Python/agent cost or P&L. Do not accept model-supplied proofs; do not widen existing database reads as part of this offline stage.
4. Financial observation adapters and the sectioned company dossier can proceed offline using explicit source/period/currency contracts. Real acquisition, model effectiveness, release acceptance and activation remain separate prerequisites.
