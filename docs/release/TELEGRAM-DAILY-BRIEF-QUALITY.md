# Telegram Daily Decision Brief — availability and usefulness hardening

Initial review: 19 November 2026 (Asia/Kolkata). Status: draft candidate, no production send/deploy.

## Observed issue

The owner reports that Telegram's daily portfolio brief is not useful because it repeatedly says "unavailable".

A read-only GitHub audit found:
- The daily scheduler and fallback each had successful `schedule` workflow runs on 19 November (UTC date of start 18 November). Both returned `{ok:true,skipped:true, reason:"digest slot already completed or another scheduler is running it"}` for slot `2026-11-18-22`. **A successful GitHub workflow does not prove a fresh Telegram message was sent**, and these skipped runs cannot establish the content of the previously delivered message.
- `server/api/portfolio-digest.js` loads holdings, ledger rows and admitted quote observations **before** requesting the Decision Center over a second authenticated HTTPS request. If that independent request fails, its fallback formatter formerly discarded the already-loaded portfolio context and sent only a generic unavailable warning.
- `server/utils/dailyDecisionBrief.js` independently printed `unavailable` for multiple metrics when the actual accounting review deliberately reports `conditional-loaded-records`, SPY/SOXX benchmark history is unverified, earnings coverage is unknown, or quotes are withheld. Many of those suppressions are **intentional correctness gates**, not a missing UI string.
- `fetchDecisionCenter` attempts configured CRON_SECRET, AIW_ACCESS_TOKEN and AGENT_API_TOKEN only; no real credentials, private database rows, Telegram history or decision-center response were inspected in this audit. The precise underlying cause of any real Decision Center failure cannot be asserted from the skipped workflow runs alone.

## Candidate correction

**Presentation:** The updated brief starts with next review actions and explicitly distinguishes *service reachability* from *portfolio data availability*. When Decision Center fails but holdings were loaded, it now reports:
- the actual number of recorded holdings;
- the number of **fresh admitted** quotes out of the actual number of holdings, plus the strict coverage status;
- a **marked USD holdings value** only when the existing quote-admission contract is complete and the value is a real finite number; never treat it as trading return;
- up to three finite, symbol-validated **source-reported** quote moves, not ACT/WATCH rule breaches;
- an explicit next step for verifying rules, ledger records and source freshness.

**No fabricated financial facts:** When accounting remains `conditional-loaded-records`, do not show derived trading P&L as decision-ready. In incomplete cases, explain the reason once rather than repeating "unavailable" for P&L, concentration, SPY/SOXX and stress scenario. Complete independently validated financial evidence still displays as before. Incompletely sourced earnings remain unverified rather than "no events".

**Scope:** Only formatter, previously loaded digest-to-formatter data, fictional tests and docs. No new background network call, provider refresh, scheduled job, Telegram dispatch, secret read, database write, investment eligibility, or production configuration change.

## Verification

- The existing GET preview integration test must still invoke no Telegram send and no database write.
- The existing POST Telegram test is fully intercepted with a fake Telegram API and a fictional chat ID; it must preserve accepted message ID semantics and the same reply keyboard.
- New pure tests cover null Decision Center with 3 holdings and partial quote data, a complete marked holding value, failure to show a partial or type-coerced valuation, a conditional ledger with nonzero unverified P&L that must **not** appear, and malformed quote observations that cannot masquerade as rule alerts.
- Require exact PR-head Frontend CI, Security audit, and UI/API/Database validation, including mocked browser and disposable PostgreSQL checks. Do not merge or deploy without a reviewed release decision.
- Later live diagnosis, **only with explicit owner authorization and a read-only endpoint**, should inspect a redacted summary of `decisionLayerStatus`, `decisionLayerError`, `quoteCoverage`, `accountingStatus` and actual digest slot state. Avoid printing private holdings or bearer tokens in CI logs, and do not resend an old slot.


## November 21 production investigation

The November 20 screenshot shows a successful Decision Center response with partial coverage, ten rule-state rows, zero prompts, 65 independent verified forecasts and 18 pending. Those fields cannot identify the missing tickers, prove ten rules actually ran, establish predictive accuracy or diagnose a provider outage. The 18:05 India slot precedes the US regular open in November.

Production `6827cce` and the newer main `347240c7` share the same digest and Decision Center code. The production formatter discarded admissible per-symbol observations, treated total rule-state rows as evaluated rules, and printed unavailable totals even when specific failure reasons were present. The digest also overwrote the decision snapshot with a second read and removed actions absent from the second quote set. Benchmarks require compatible dated cash flows and historical prices. Full-history reconciliation is unverified.

The combined candidate preserves the Decision Center assessment. Telegram shows usable observed prices, timestamps, quote coverage, evaluated rule counts and bounded issuer-specific checks. Pre-open Yahoo references require a matching returned ticker, raw USD price, recent provider observation and retrieval, and a provider-declared upcoming regular open. They never enter valuation, rules or return alerts. Missing daily moves stay missing. The web review accepts null coverage percentages. Optional forecast or signal service failures leave the rest of the decision response readable. Malformed earnings responses report a source failure.

Verification used the locked production build, fictional GET previews with intercepted transports, a mocked Telegram transport, Chromium accounting/navigation cases and a 17-route smoke check. No private production row or live sender was used. For release review, compare candidate and live alias IDs, inspect the earlier alias change through project history, and use the guarded release flow for the reviewed commit.
