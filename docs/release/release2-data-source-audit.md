# Release 2 — data-source audit and quote provenance

Assessed 8 November 2026 in Codex Cloud. Inspected baseline: `55326d037a53637fc93815c1e64dd926f7e63591`. Verdict: **the source stack is useful, but not all paths are ready for decision-grade use**. Static implementation, mocked transport correctness, vendor documentation and actual account/runtime coverage are separate evidence levels. No live account health or entitlement is certified here.

## Sources and runtime paths

| Category / path | Existing source | Appropriate use and current limits |
| --- | --- | --- |
| Vercel quotes, `api/_market-data.js` | Yahoo Finance → Finnhub → Alpha Vantage | First successful response, not independent vendor agreement. Yahoo's chart endpoint is an unofficial integration without an established availability/licensing guarantee. Finnhub/Alpha access and exchange entitlements are unverified. Missing observation/currency/session information must remain unknown |
| Vercel `/api/quote` via `api/market.js` | Previously a separate Yahoo-only implementation | Now delegates to the shared quote router and preserves provenance. Joining its existing fallback chain changes this route's potential provider use; review budgets before deployment |
| Standalone `npm run dev`, root `server.ts` | Previously Gemini-generated price/trade/contract JSON and canned fallback data | Unsafe as financial observations. Removed that path; `/api/live-data` now returns explicit HTTP 503/unavailable with empty observations. A reviewed deterministic development adapter is still needed. The Vercel feed remains a separate handler |
| Python quotes, `aitracker-upload/mcp_servers/stocks/providers.py` | Fixture provider or Finnhub | Still an open gap: live normalization stamps the local clock as `as_of` rather than preserving Finnhub's observation time; missing values/default USD also need correction. Fixture mode is simulated, even when read today |
| JavaScript histories | Yahoo, then Finnhub, then Alpha Vantage | Reported Yahoo currency is retained; missing currency now stays null. Yahoo adjusted closes can be present; fallback raw closes are not equivalent total-return evidence. Adjustment, currency and as-of metadata must survive every consumer |
| Python candles | Yahoo live default; separate Finnhub/Stooq implementations | Availability of three classes is not an automatic three-provider fallback. Raw CSV/candle data does not prove split/dividend adjustment, delisted coverage or point-in-time correctness |
| Reported fundamentals and filings | SEC ticker mapping, submissions and company facts; existing company-scale service | Preferred primary evidence for filed facts. Validate issuer/CIK, units, fiscal period, form, filing/publication time and restatement/version. A current filing database is not automatically a historical point-in-time dataset |
| Filing-derived contracts | SEC filing inspection in `api/live-data.js` | A filing mentioning a contract is not proof of exact contract economics or signing time. `dateSigned` currently uses a filing date; fix the contract before relying on that label. Per-symbol errors can become empty results and concurrent requests lack a shared quota budget |
| Earnings and analyst context | Finnhub; optional FMP fallback in Python earnings paths | Calendars can be estimates until issuer-confirmed. Analyst targets are attributed opinions, not intrinsic values. Preserve confirmation, revision, currency and observation dates |
| News and discovery | Vercel GDELT → Google News RSS; Python Finnhub; optional Brave/Tavily and official-profile/domain filters | Discovery and corroboration candidates only. Syndicated copies are not independent sources. Preserve original publisher/document, publication time, retrieval time, coverage/failure and 24h→72h fallback window |
| Political and macro context | White House/Federal Register primary documents, GDELT/web discovery, deterministic macro taxonomy | Use original official documents for factual assertions. A static risk taxonomy is not a newly confirmed event; assigning today's update date does not establish fresh evidence |
| Congressional disclosures | Bargo API → OpenRegs by DataDawn → cache | Both are aggregators. Verify original STOCK Act disclosure and distinguish transaction date from filing date. Disclosed amount ranges are not exact flow amounts, execution prices or investable signals |
| NVIDIA, TypeSafe/JEV and REA | Summary model, typed assessment service, static source-analysis tool | None is a market-data authority. They cannot fill missing facts, certify live access or create observed financial values. No live model call was used in this audit |

`vercel.json` routes `/api/quote` through the consolidated market handler. The root Express server is a different runtime, so auditing only `api/live-data.js` misses its former generated-data path. Python provider and service files were inspected separately as text; they were outside the selected REA analysis below.

## Corrections implemented in this increment

1. Extract pure quote normalization for the existing three providers. Missing move/range/previous close/time/currency remains null; genuine observed zero remains zero. A historical bar cannot become a current instant quote when provider current price is absent. Reject a returned Yahoo/Alpha symbol mismatch when the provider supplies its identity.
2. Avoid using a five-day chart baseline as yesterday's close. Prefer an explicit regular-market previous close; otherwise use an unambiguous earlier exchange-calendar-day close with aligned timestamps and one current-day bar. Missing timezone, reference or alignment withholds the move. This is not a full exchange-calendar or missing-session certification.
3. Keep observation time separate from retrieval time. Alpha's trading date remains date-only instead of an invented midnight instant; missing Finnhub/Yahoo time remains unknown. Session/currency metadata is not guessed for providers that omit it.
4. Route `/api/quote` through the shared cache, normalization and redacted failure classifications. Explicit refresh bypasses the warm entry; failed refresh preserves the original observation as explicitly stale. HTTP responses are no-store. Remove the separate handler's unrelated `CERE` → `CBRS` alias; remaining legacy aliases still require issuer-history review.
5. Stop manufacturing USD for histories. Preserve provider-reported Yahoo currency, otherwise return null for Yahoo/Finnhub/Alpha history currency.
6. Report expected/observed symbol coverage, missing prices/moves, unknown times and explicitly stale symbols. A complete feed observation time is the **oldest** valid covered observation, only when every expected symbol has a valid timestamp. A single newest quote or fresh retrieval cannot date the whole feed. Time coverage does not establish freshness or eligibility.
7. Health summaries distinguish missing/date-only/future observation times and metadata coverage. A positive price means price availability only; it does not establish decision-grade evidence.
8. Disable the standalone generated/canned financial feed. HTTP 503/unavailable is intentional until a deterministic adapter is configured. This changes standalone behavior; it does not deploy anything or rewrite stored data.

No provider, runtime dependency, scheduler, secret, database schema or account configuration was added. The shared router is still first-success failover; the existing pure comparison helper is not proof that all vendors are fetched or independently corroborated at runtime. A successful fetch can still be stale, delayed, incomplete or unsuitable for a particular calculation.

## Actual REA investigation and limits

Used the existing isolated **REA 6.8.0** CLI at `/workspace/tools/rea-6.8.0/node_modules/rea-agents/scripts/rea.mjs`. No installation, global agent/MCP registration or application execution occurred. The user specifically requested REA for this investigation; its main project role remains feature mirroring.

Created a source-only snapshot at `/workspace/references/aiw-data-sources-55326d0` with these 12 selected files plus package metadata:

```text
api/_market-data.js
api/live-data.js
server/api/quote.js
server/api/company-scale.js
server/api/market-data-health.js
server/services/marketDataValidation.js
src/utils.ts
src/App.tsx
src/utils/quoteObservation.ts
src/utils/decisionEligibility.ts
src/utils/researchSnapshot.ts
src/components/PortfolioIntelligence.tsx
```

`analyze-javascript-application` used bounded limits of 40,000 semantic nodes, 5,000 nodes/file, 12,000 unknowns, 512 MiB heap and a 60-second analysis timeout. It parsed **12 files with zero parse failures**, read 317,025 source-text bytes, visited 47,210 AST nodes and reported 445 static findings. These are analysis counts, not counts of confirmed defects. Application graph coverage is **partial**; semantic coverage is **partial and truncated** by the configured caps. Structural module count is zero. A summary projection's “complete-within-view” label does not make the application analysis complete.

- Artifact SHA-256: `6f2273487c41a056b5e860b8e8a993012ead28b6a7ddb68dfb3b4329d8fc1fdc`.
- Canonical analysis evidence: `ev_10e79deb1031d184b367204d9f7a9f1f3bff0b7eb5d5af225aa5f13be20f138b`.
- Structural trace of the Yahoo endpoint: no match in the partial graph. This is inconclusive, not evidence the request is absent.
- Backward semantic trace of `changePct`: ambiguous, six seeds/nodes, zero traversed relations and 1,729 relevant unknowns. This does not establish end-to-end provenance.

Retained Cloud artifacts, outside Git/application dependencies:

```text
/workspace/artifacts/rea-aiw-data-sources-manifest.json
/workspace/artifacts/rea-aiw-data-sources.summary.json
/workspace/artifacts/rea-aiw-data-sources.evidence.json
/workspace/artifacts/rea-aiw-data-sources-feature-trace-corrected.json
/workspace/artifacts/rea-aiw-data-sources-semantic-trace-corrected.json
```

Trace requests initially supplied the evidence bundle instead of its canonical analysis record and were rejected by REA's schema/integrity validation. Corrected requests used that record and produced the results above; the rejected files are not successful trace evidence. Manual source inspection and fictional regression tests substantiate the concrete fixes. REA did not validate vendor truth, licenses, runtime execution, account access or financial-model correctness. The snapshot predates this increment's corrections.

## Public documentation and budgets

Reviewed official documentation, without account credentials:

- [SEC developer resources](https://www.sec.gov/about/developer-resources): no more than ten requests/second across machines; use an identifiable User-Agent. Add a shared budget/concurrency limiter rather than assuming per-process parallel batches are safe.
- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): public submissions/XBRL interfaces, no API-key authentication. Unit/period/context interpretation remains the application's responsibility.
- [Alpha Vantage support](https://www.alphavantage.co/support/): standard free allowance is 25 requests/day; US real-time/delayed data requires appropriate paid entitlement. Do not apply exceptions or account permissions without verification. [API documentation](https://www.alphavantage.co/documentation/) distinguishes quote/update capabilities.
- [Finnhub quote documentation](https://finnhub.io/docs/api/quote): current account-specific rate/market/exchange entitlements were not verified. Do not promote a source-code rate-limit comment into a confirmed allowance.

The existing shared chain can make up to three sequential provider attempts with eight-second request timeouts. Actual end-to-end latency/body parsing, cache/resource bounds, refresh abuse, shared quotas and per-provider cost must be reviewed before activation. Routing a larger symbol universe through Alpha's free fallback could exhaust its allowance quickly. No paid upgrade, new provider or live request is implied by this recommendation.

## Next implementation and release gates

1. **Unify quote/source contracts across Python and JavaScript.** Correct Python observation-time/default-zero/USD handling. Preserve separate observed, published, retrieved and market-date precision. Carry issuer/listing identity, currency, raw/adjusted basis, source mode, coverage and explicit failures through server decision consumers; price availability alone must not grant eligibility.
2. **Bound upstream use and correct evidence semantics.** SEC concurrency/rate budgets, explicit unavailable versus successful empty coverage, and filing-date versus signing-date labels come first. Add issuer-original links/confirmation for news, political and disclosure evidence; distinguish static taxonomy from dated events.
3. **Audit historical calculation inputs.** Preserve adjustment/currency metadata through portfolio, peer, benchmark, forecast and Python event-study paths. Require supported units, periods and point-in-time facts before adding dossier valuation/growth calculations. Current snapshots do not solve survivorship, delisting or restatement bias.
4. **Configure development-only access when available.** This Cloud environment reports zero credential bindings and no custom allowed hosts. Live coverage, latency, quotas, exchange calendars, corporate actions and licensing remain untested. Configure appropriate development credentials through secure environment controls, never in chat/source or from production. Any actual external acceptance work remains a separate authorized step.
5. **Then extend company research.** Build sectioned business/growth/financial-health/valuation/risks/sources views over supported facts, with explicit unavailable states. NVIDIA may summarize bounded verified facts and JEV may assess typed coverage; neither supplies missing numbers.

The [Release 2 engineering estimate](release2-progress.md) remains approximately **55% complete / 45% pending**. This source inventory and passing fixtures do not increase the percentage or certify all calculations.

## Verification and rollback

**539 Node/TypeScript tests passed**, including 22 new normalization, route, history-currency, coverage/health and standalone-feed safety cases. Provider requests are fully intercepted with fictional responses and child processes receive only fictional provider credentials. Checks cover missing versus observed zero, chart references, malformed identity/date/time, original observation retention on stale fallback, cache/refresh, method/input validation, redacted all-provider failure and unavailable standalone output.

TypeScript, source security audit, 32-file local migration-manifest integrity, production frontend build and whitespace checks passed. The existing large-bundle warning remains. Exact-head CI and its broader offline/browser/disposable-database checks are recorded in draft PR #168; local unit tests alone do not replace that gate.

No production endpoint/secret, hosted database query/change, real Telegram/email message, live model call, deployment, provider-data import or account configuration was used. Public documentation research is separate from authenticated provider testing. Rollback is a reviewed application-code revert; there is no stored-data repair, schema rollback or message replay. Re-enabling generated/canned financial observations is not a valid rollback strategy for source accuracy.
