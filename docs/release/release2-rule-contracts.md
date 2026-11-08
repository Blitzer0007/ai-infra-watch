# Release 2 — initial research rule contract

Version: `reported-growth-cash-flow-v1-experimental`.
Status: experimental, descriptive research. Not a validated signal family or holding decision.
Base: reviewed Release 1 commit `4c008237453d8e31944cb5fba00cac9726f49501`.

## Universe and snapshot

`captureResearchSnapshot` accepts already-loaded holdings/watchlist symbols, quote records, and optional normalized company/financial observations. No provider client, endpoint or credential is part of this contract.

Symbols are trimmed, uppercased, deduplicated and alphabetically ordered within holding/watchlist groups. The same symbol is a holding when present in both. Limits are 100 holdings, 50 additional watchlist symbols and 2,000 financial observations per input. A symbol with over 32 observations has all financial evidence withheld instead of silently retaining a convenient subset. Coverage reports omitted/invalid symbols and unavailable holdings.

The builder copies explicit fields, sanitizes quote scalar metadata and omits raw quote response/token fields. Evaluation receives an explicit clock and does no IO. The captured snapshot is a copy; later live input changes do not update the frozen evaluation. Re-scanning is an explicit UI action. The snapshot does not claim to represent the whole market, a historical universe or all portfolio holdings when coverage is unavailable.

## Required observations

- Quote: existing Release 1 numeric, currency, provenance, session, freshness, conflict and simulation checks. The quote helper is shared; holding decision eligibility continues to additionally require supporting evidence and reconciled accounting.
- Company: explicitly supplied equity classification and US listing, with non-simulated HTTPS source evidence observed within seven days. A ticker/name alone establishes neither classification nor listing.
- Financials: reported revenue growth in percent and reported free cash flow in USD, for the exact same fiscal period start and end. Values must be finite, currency USD and reporting basis `reported`.
- Each financial observation needs a distinct ID, provider, public HTTPS source URL without embedded credentials/token query, explicit publication/retrieval timestamps and a simulation marker.
- Fiscal period end must precede publication; publication must not follow retrieval; retrieval cannot be in the future or older than seven days. Period end cannot be older than 550 days. Calendar dates must be valid, and period start cannot follow end.
- Compatible same-period financial values that disagree are conflicting and are not averaged. Ambiguous duplicate observation IDs withhold the research classification.

These age limits are an experimental input contract, not a declaration that any vendor meets them or that the rule has predictive value. No provider is contacted to fill a missing field in this increment.

## Output semantics

| Condition | Output |
|---|---|
| Source-verified fund, leveraged ETF, or non-US listing | `excluded`: issuer operating rules do not apply |
| Missing/invalid/conflicting/simulated required inputs or unknown asset/listing provenance | `needs-data` |
| All required inputs pass; revenue growth > 0 and free cash flow > 0 | `research-candidate`, explicitly experimental |
| All required inputs pass; either reported value <= 0 | `monitor`, with adverse/descriptive reason |

Positive is a descriptive condition, not a recommended purchase threshold. The rule does not compute expected return, valuation, a confidence score, a portfolio allocation, or any of the existing four holding states. No family is promoted to validated by these conditions or by a sample-count shortcut.

Watchlist-only context reports accounting `not-applicable`. Holding context reports accounting `unverified` in this view; this increment cannot display a return, sizing or exposure conclusion. It never asserts reconciliation simply to pass a quote gate.

Every usable reported metric has a supporting/adverse reason with an evidence ID, period and unit. Quote and company references are separate. Bad or simulated source fields cannot be used as trusted financial evidence. The fictional JSON fixture deliberately retains simulation markers and can never produce eligible research.

## Current UI integration boundary

The Opportunities view currently receives existing holdings/watchlist and quote snapshots plus descriptive company names. It intentionally does **not** infer classification/listing, inject financials, fetch an enrichment API or present missing fundamentals as a successful research case. Expect `needs-data` until a later reviewed provider adapter supplies compatible normalized evidence.

This is the R2.0/R2.1 foundation. Financial/context provider enrichment, catalyst calendar, read-only alert inbox, notification policy preview, journal/evaluation extensions and Release 1 risk-completion work remain separately tracked. Existing scoring/accounting/notification semantics are unchanged.
