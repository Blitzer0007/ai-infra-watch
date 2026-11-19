# Telegram Daily Decision Brief — availability and usefulness hardening

Updated: 19 November 2026 (Asia/Kolkata). Status: draft candidate, no production send/deploy.

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
