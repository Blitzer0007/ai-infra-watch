# Portfolio research context integrity

Implemented 9 November 2026 in Codex Cloud on the Release 2 feature branch. This increment fixes the existing Python `app.get_portfolio_context` consumer. It does not change portfolio pages, financial rule thresholds, senders or database schema. Production activation remains separate.

## Problem and resulting behavior

The previous live adapter defaulted malformed/missing quantities and costs to zero, added each positive quote price to a portfolio total regardless of source time/currency/session/basis, and reported `allQuotesFresh=true` whenever every price existed. Its `change_pct or changePct` expression discarded a genuine reported zero. A malformed stored response could also become an empty list after invalid rows were dropped.

The new `portfolio-context-v2` response keeps per-holding evidence and coverage separate from complete portfolio totals. For two holdings with only one usable mark, that holding can retain its value while portfolio `currentValue` and `as_of` stay null. A usable price with a genuinely missing daily move can still mark a holding, but `dailyChangePct` stays null with an explicit finding. A reported zero stays zero.

**The current stored-holdings table has no cost-currency column.** Quote currency is not evidence of cost currency. Its existing read therefore cannot supply an aggregate `investedValue` with a proven unit, and the adapter now withholds it. The pure loaded-data contract recognizes an explicit `cost_currency=USD` for future reviewed accounting adapters, but this increment neither adds nor queries such a database column. Generic `currency`, quote currency and old USD display conventions cannot fill that gap.

Stored average cost is also not transaction/fee/corporate-action reconciled. `unrealizedPnl` and `unrealizedPct` remain null even for an explicitly denominated loaded cost packet. Holdings quantities/average costs and known marks remain available as bounded context, with `accountingBasis=unreconciled-stored-average-cost`, `accountingReconciled=false` and fixed limitations. The response never grants decision eligibility or verifies provider/issuer identity.

This is a deliberate nullable-wire compatibility change for the existing live research tool. After a future deployment, callers that previously received complete-looking values can receive explicit unavailable values instead. Current Python Finnhub quotes lack currency and session metadata; those actual packets cannot produce USD marks until a reviewed source adapter supplies those fields. No metadata is fabricated to keep old totals populated.

## Deterministic contract

| Input or output | Rule |
| --- | --- |
| Universe | At most 150 returned holdings. The read requests 151 to detect overflow; over-limit, malformed and normalized duplicate identities fail before provider work. Invalid quantities stay in the coverage denominator rather than disappearing |
| Requested symbol | Validate before the read; preserve existing case-insensitive loaded matching. Explicit selected-holding scope cannot look like whole-portfolio coverage |
| Stored numbers | Finite PostgreSQL `numeric(20,8)` compatible quantities and average costs; legitimate decimal strings accepted. Booleans, nonfinite/malformed values, out-of-range scale/magnitude and invalid signs are withheld. Zero average cost is distinct from missing cost |
| Quote numbers | Require actual finite numbers; no boolean/string coercion. Preserve small/nonzero moves and report missing/conflicting move aliases rather than calling them flat |
| Source | Current supported Python source is Finnhub with explicit `simulated=false`. Record symbol must match the requested holding; that binding is not provider-returned issuer proof. Simulated/unknown/stale/invalid/conflicting/missing quality is withheld |
| Time | Explicit timezone-bearing observation and retrieval instants. Observation age from 0 through 900 seconds inclusive; retrieval cannot precede observation or follow assessment. Date-only, naive, future or missing times remain unavailable. Retrieval/capture time never replaces observation |
| Mark unit/basis/session | Explicit exact `USD`, raw basis and a known boolean session flag. Preserve currency case; `GBp`, `GBP`, `USd`, unknown currency and unsupported bases cannot be summed as USD. No FX or exchange-calendar inference |
| Aggregate mark | Every selected holding needs a usable mark, and all observation instants must align within 60 seconds inclusive. Otherwise no partial sum is presented as a complete total. `as_of` is the oldest observation only for a complete aligned mark |
| Accounting | Known declared cost unit and valid stored numbers can describe an inventory cost. Reconciliation remains false; no realized/unrealized performance or decision eligibility is certified |
| Diagnostics | Per-holding `sourceFindings`, quote metadata, valuation availability, expected/missing symbols, separate mark/cost counts and coverage, aggregate alignment/accounting findings, usage and fixed limitations |

Decimal multiplication/summing uses a private precision context and converts only finite results to JSON numbers. It does not round a tiny observed move or value into a fabricated zero. JSON numbers remain floating representations at the wire boundary; this context is not a replacement for a reconciled financial ledger.

`freshQuoteCount`/legacy `liveQuoteCount` and `allQuotesFresh` now describe accepted source/identity/time checks, separately from mark-unit/basis/session eligibility. Fresh timestamps alone cannot make `allMarksAvailable=true`. Overall context status remains partial/needs-data while accounting is unreconciled, even when mark coverage is complete. Empty or unknown-symbol scopes have zero observed holdings and unavailable totals, not invented zero profit or perfect coverage. Coverage describes the returned stored scope, not an audit of an entire brokerage account.

## Bounded existing read path

`ApplicationResearchService.portfolio_context` retains the existing read-only table path but explicitly selects only `id,symbol,quantity,average_cost,purchase_date,notes`, with stable order and the overflow-detection limit. Its strict-record option rejects malformed roots/elements instead of dropping rows. Other application-context adapters retain their existing behavior. No SQL, grants, RLS, RPC or hosted configuration changes are included.

The quote phase makes at most **20 stock-service calls**, with a **five-second cooperative quote-phase budget**, checked before calls and before accepting successful results. Late results are withheld, pending holdings remain in coverage, and the context adapter adds no retry. Provider failures, unavailable configuration and call/time limits have fixed codes; raw transport URLs, credentials and exception bodies are not returned.

These are logical stock-service calls, not HTTP request counters. The existing provider owns its own retry policy, so `providerRequestCount=null` rather than an invented exact request total. A synchronous provider call can exceed the cooperative deadline before returning; this is not hard cancellation. The stored-holdings read has its existing timeout separately. Shared provider/SEC quotas, cross-tool caching/deduplication, HTTP byte caps and an account-wide latency/resource budget remain open.

## Implementation and verification

- `aitracker-upload/app/mcp_client/portfolio_valuation.py`: pure selection, source gates, decimal computation, scoped response and limitations; no network, model, hosted storage or message capability.
- `aitracker-upload/app/mcp_client/application_sources.py`: strict bounded read, minimal projection, fixed failures, injected clocks and logical quote-call budget.
- `aitracker-upload/tests/mcp/test_portfolio_context.py`: 83 fictional regression cases, with HTTP forbidden. Covers malformed/duplicate/oversized universes, numeric/time/unit/source boundaries, zero/missing moves and costs, complete/partial/unaligned marks, cost/accounting abstention, scope, call/time budgets, redaction and real in-process tool serialization. A real Python Finnhub normalizer packet passes through the actual stock service and consumer without a currency/session guess.
- Existing offline Python CI includes the new file. The fixture-mode private-snapshot interface is unchanged and remains explicitly fixture-labeled; tests supply fictional snapshots and do not read a private portfolio file.

Local verification includes the new 83 cases and the broader agent/MCP/evaluation/API regression, source security, migration-manifest integrity, whitespace and 25 offline workflow-safety cases. Exact final-head results and CI links are recorded in draft PR #168. No UI code changed; the existing combined browser CI guards regressions.

## Next work and rollback

Review transaction-ledger currency, fee, inventory and corporate-action reconciliation before restoring cost/performance aggregates. Extend strict metadata eligibility into remaining decision/history consumers, then implement shared SEC/provider budgets, filing-date semantics and adjusted/point-in-time history integrity. Financial dossier expansion and model effectiveness acceptance remain separate work. REA stays a feature-reference investigation tool; this deterministic consumer fix needed no new REA run or framework.

Rollback is a reviewed application/test/workflow revert. No stored data, schema or message repair is required. This increment uses no hosted read/write, production secret, real quote/model call, notification, merge or deployment. Release 2 remains approximately 55% engineering complete; production rollout has not started.
