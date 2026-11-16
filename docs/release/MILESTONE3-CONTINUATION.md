# Milestone 3 — Controlled research integration checkpoint

**Date:** 16 November 2026 (Asia/Kolkata)
**Repository:** `Blitzer0007/ai-infra-watch`
**Base:** Milestone 2 production `main` at `91006b4be1ae9b2c01e410d09e76299726f03694`
**Source reference:** stacked draft PR #168, `d14f5fe57028d3277cc229b704bc126192f42815` (left unchanged)
**Candidate branch:** `feature/milestone3-controlled-research-20261116`, separate from production

## Milestone 3 scope

The five-release plan defines this milestone as bounded Company/Catalyst and Daily Review research, Source Quality, and Bull/Bear/Judge roles with strict citation, abstention, privacy, request and token budgets. This is **manual, controlled research**, not autonomous trading, scheduled polling, model prediction validation or automatic alerts.

## First integrated workstream — offline deterministic Source Quality role

Ported from the prior Cloud-tested source branch, without copying the whole Release 2 stack:
- `aitracker-upload/app/agents/source_quality.py`: validated 1–5-symbol frozen quote packet, two scoped local tools (`inspect_quote` and `compare_quotes`), metadata and time/currency/identity checks, bounded calls/deadlines and fixed redacted failures.
- `aitracker-upload/scripts/run_source_quality_agent.py`: explicit fictional offline demo and optional bounded local JSON input with no model/provider or credential access.
- `aitracker-upload/tests/agents/test_source_quality.py`: upstream fictional contract regressions for unknown sources, one-provider non-corroboration, precision/threshold boundaries, distinct-provider mismatches, simulations, malformed input, zero network and CLI privacy.
- Lazy package exports in `app.agents`, and included the new test module in the standard Python Agents Tests GitHub workflow.

The imported role never authenticates publishers, accesses production DB, sends notifications, contacts NVIDIA/JEV or grants trade eligibility. No production runtime flag or HTTP route is added. The existing current-main auth, quote/portfolio/release safeguards remain intact.

## First exact-head CI regression and repair

Initial PR #173 source commit `98c5997` started the relevant CI families. Python Agents Tests failed **one actual offline CLI regression**: the Source Quality fictional demo fixture had been omitted from the port. The other 114 tests in the same selected group passed. Added the original fictional `aitracker-upload/data/research/source-quality-demo.json` fixture, retaining the source's intentionally simulated/unadmitted evidence. Strengthened the CLI test's explicit authority denial assertions. All required workflows must run successfully on the final corrective commit, not on the earlier failing SHA.

## Verification and release gates

No inherited source-branch CI conclusion certifies this new branch. Run and wait for exact-head Python Agents Tests and all other applicable workflows. If any fail, fix root causes and rerun on a new SHA. Do not remove safety assertions.


## Second workstream — bounded Bull / Bear / Judge engine (offline, unexposed)

Dependency-closed port of source PR #168's Python research council: independently initialized Bull and Bear roles, a Judge constrained to inspected/cited evidence, deterministic abstention and fixed-output presentation, independently checked admission-v2, bounded model/tool/time/response limits, and mocked-only optional NVIDIA/TypeSafe adapters. The model adapter module is **not routed or configured** on production. The source `app.jev.council` module is for bounded typed coverage only, never portfolio allocation. Fixtures carry fictional/declared source data; they prove contract consistency, not issuer authenticity, forecast correctness or entitlement. Included offline suites `test_portfolio_council.py` and `test_council_admission.py` in Python Agents CI. No new HTTP route, production feature or live permission was granted.

**Remaining:** connect the staged modules through an authenticated private development-only route with strict environment guards, build manual review UI, complete source/admission adapters, Company/Catalyst/Daily Review user flows, browser acceptance and full release gates. No user-visible production council yet.

## Third workstream — development UI, private transport and end-to-end test gates

- Ported source-bounded, manual and identity-pinned Source Quality and Bull/Bear/Judge panels, plus an optional explicit JEV coverage-only review in Opportunities. No passive model calls; research is reset on source selection/horizon.
- The only new JS/Python task routes are guarded by development-only flags and reject `VERCEL`, `VERCEL_ENV=production` and `NODE_ENV=production`, even when opt-in flags are set.
- Ported authenticated loopback-only relay transport with strict source/admission payload/response validators; migrated current main's autonomous endpoint to trusted configured/own-deployment origin instead of request-supplied Host. General agent path still uses its existing access controls.
- Ported the upstream end-to-end fictional Source Quality and Council QA scripts and wired them into the existing full mocked Playwright suite. They start isolated development gateways; they make no live provider calls, require no production secrets and should not touch private production rows.
- `JevAutonomousPortfolioLab` retains current main paper/accounting protections and only adds the QA/development council panel; JEV research is voluntary and may consume configured credits on an explicit click.
- This is not equivalent to live issuer authentication, verified prediction, cross-worker quotas, a browser accessibility audit or a production-enabled model integration.

## Next Milestone 3 increments

1. Integrate manual frozen-source quality review into a bounded development/QA user flow and its authenticated local transport, with fail-closed response validation and zero passive writes. Do not expose a live production research endpoint just to demonstrate it.
2. Port a minimal, dependency-closed Bull/Bear/Judge research council and deterministic source-admission contracts from PR #168; retain independent perspectives and Judge abstention; cap model/tool work; do not infer verified issuer truth.
3. Establish Company/Catalyst and Daily Review research role navigation, grounded citations and explicit no-data/loading/denied states.
4. Add browser, backend, privacy, budget, source-conflict and evaluation fixtures, and verify entire exact-current-SHA CI. Only then consider a separately reviewed Milestone 3 production release.

**Restrictions:** Cloud/GitHub CI only; do not run on the user's Windows PC. Do not merge/deploy, alter Supabase or private rows/secrets, activate schedulers, send Telegram, trade, or call paid/live model providers in this increment.


## Production-visible offline research review

The candidate's default production build now adds only **manual zero-request coverage tools**:
- Opportunities → scan → Source coverage checklist, frozen from already-loaded quote metadata, with explicit uncertainty;
- JEV Portfolio Lab → manual Bull/Bear/Judge evidence preflight, showing missing source families with zero model requests and automatic Judge abstention;
- Company Research → a manually requested Company/Catalyst/Daily Review evidence checklist that retains source-record scope and marks unsupported authority unknown.
These are research-readiness experiences, not a claim that live model inference, publisher authentication or forecast outcomes are available. Development-only authenticating loopback workflows remain separate. Production never activates `COUNCIL_DEV_ENABLED` or `SOURCE_QUALITY_DEV_ENABLED` and no live models/providers were called for development.

## Acceptance hardening — manual research without transport

Added `qa/test_milestone3_candidate.py` and the UI/API/DB validation workflow selection. Browser acceptance at 360, 768 and 1440px uses fictional holdings/watchlist inputs and enforces zero non-GET requests. The manual Opportunities source coverage view, JEV research-evidence preflight, and Company/Catalyst/Daily Review checklist must not fetch a provider, run a model, save portfolio data or issue Telegram sends. Tests also verify missing original alert/calendar context is not fabricated. Source Quality and Council separate loopback integrations remain covered by the upstream fictional browser suites.

## CI environment regression (fixed on candidate branch)

The first integrated UI test workflow hit fixture setup errors because its browser-only dependency install lacked `uvicorn`; the new QA suite deliberately launches a separate loopback FastAPI server to test the actual private relay. The workflow now installs the repository's existing `aitracker-upload/requirements.txt` in **only** the offline mocked UI runner, preserving real backend execution instead of marking source/council tests skipped. The unit-test failures on the first UI-integrated head were also corrected by restoring the fictional SEC fixture and updating the proxy test for explicit trusted backend origins. Exact-head CI must be rerun and all gates green.

## Shared Python provider admission and offline budget verification

Integrated the original review-tested `provider_budget.py` with its existing actual-client adapters for Finnhub quote/research/earnings/candles/news and SEC `LiveEdgarClient`. The coordinator is process-shared: 30 Finnhub attempts and 60 SEC attempts per 60 seconds, default one in-flight request/provider, bounded spacing, three attempts and 8 seconds per operation, shared cooldown on 429 and fixed redacted failures. This does not add polling or perform any new request; existing deliberate provider reads are throttled.

Added `test_provider_budget.py` to the Python Agents CI MCP contract test step. The fictional/test-only suite exercises actual client seams under a synthetic clock, concurrency, token redaction, retry-denial and fail-closed budget behavior. No live HTTP/vendor/key calls are permitted in CI. Limits are **process-local** and are not proof of cross-worker/account-wide spend, source authenticity, actual billing, or license compliance. Do not merge or deploy until all current-main tests and exact SHA workflows succeed.

## Provider quote provenance compatibility and contract verification

The first process-budget run found an actual dependency mismatch: source-branch Finnhub normalization intentionally withholds missing price/currency/observation data, while current-main `Quote` schema still required non-null values and implicitly defaulted missing values. Reconciled the dependency-closed stocks Quote/QuoteBatch schemas and StockService/fixture expectations with their upstream strict-provenance counterparts, preserving unavailable timestamps rather than synthesizing a retrieval instant. Contract tests, service/provider tests and new provenance regressions are now explicitly selected in Python Agents CI, alongside shared provider-budget coverage.

These schema changes may affect Python consumers; do not claim acceptance until exact-head end-to-end CI and the existing main-backward-compatibility suites pass. No new model or provider calls are activated.

## Market-data consumer compatibility

After strict quote metadata was ported, the first full MCP tests exposed inherited consumers that synthesized missing moves, currency or observation times into present facts. Ported the narrow upstream, tested dependency closure for `stocks/feed.py`, `app/agents/_convert.py`, `app/agents/mcp_pipeline.py` and `app/agents/market.py`. These keep missing source fields explicitly unavailable, require actual usable quotes before MCP market synthesis, maintain dedupe keyed on actual observation quality (not request retrieval time), and ensure transient feed failures back off. All upstream fictional quote-provenance tests must remain enabled. The stricter source and budget claims remain offline; no new provider poller is activated.
