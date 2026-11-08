# Release 2 — controlled JEV credit use and REA status

Branch: `feature/release2-opportunity-research`, stacked draft PR #168. The user confirmed credits are in the official TypeSafe console. No production access, deployment or REA installation is included.

## Existing JEV integration

The repository already contains a server-side TypeSafe client (`aitracker-upload/app/jev/client.py`) and authenticated assessment endpoint (`api/jev-assess.py`). Generic on-demand reviews appear in Portfolio Intelligence, signal fusion, the paper Portfolio Lab, contracts, event studies, macro and congressional disclosures. Autonomous Research also uses typed routing/evidence checks before a separate LLM generates prose. Forward Outlook has explicit evidence/result-review actions.

These are code integration findings, not verification that any production credential, credit balance or live route is currently healthy. JEV returns typed judgments, not source documents, verified financial data or profitable predictions. Existing investment/accounting/evidence gates remain separate and authoritative.

## New Opportunities review

After scanning loaded data, expand **Review evidence coverage with JEV**, select one symbol and explicitly run its review. A single authenticated POST to the existing assessment endpoint asks two Choice questions: next manual evidence check and supplied coverage context. There is no agent loop, new provider retrieval, notification or persistence action.

The request uses a fixed ten-field schema: version, symbol, rule version, deterministic eligibility/status, public source observation time and four bounded coverage counts. It excludes quantities, purchase costs, portfolio context, saved theses, notes, company names, raw source text/URLs, private snapshot IDs and credentials. It is intentionally a **coverage-summary review**, not a reading of filings or a new source-verification service.

The new `opportunities` assessment kind validates exact keys, enums, integer counts, known rule version, timestamp and status consistency before calling TypeSafe. Extra/private or malformed input causes no provider call. Typed model choices are validated afterward. Missing/conflicting input flags constrain the output server-side and again in the browser; model output cannot promote an ineligible candidate. There is no confidence-to-profit conversion or new research score.

### Request and usage limits

- No request on mounting, opening the disclosure, selecting a symbol, filtering or rescanning.
- One in-flight request; repeated clicks do not fan out. A fifteen-second browser timeout aborts the request, but cannot guarantee that provider work/billing stopped.
- At most five HTTP attempts per mounted view, including failures. This is a browser guard, not an account-wide or durable spend limit; reload/navigation resets it. The existing authenticated endpoint's per-process rate limit is unchanged.
- Successful results are reused for identical sanitized summaries, including new captures with unchanged public inputs. Different symbols or changed public facts require a new manual action.
- Results are keyed to the summary; late responses cannot appear under a different symbol. Requests abort when the view unmounts. No automatic retry, timer-driven refresh or fallback-provider spend is added.
- Model, reported input tokens and latency are displayed when usable. Exact credit deductions and account balance are not inferred. Failure/interruption leaves eligibility unchanged and warns that credits may already have been used.

TypeSafe's [official pricing help](https://help.typesafe.ai/articles/5187202169-how-much-does-jev-cost), reviewed 8 November 2026, publishes $0.042 per million input tokens and free output tokens. No price is hardcoded into the UI; provider billing remains the source of truth. One request contains two questions and billing follows the provider's reported usage.

## Cloud live-call prerequisite

At inspection, the managed Cloud environment reports zero credential bindings and no custom HTTP hosts. No TypeSafe credit/balance/model API or production secret was accessed. All development calls are intercepted or injected fixtures.

To enable a separately scoped first live Cloud test:

1. Create/use a development TypeSafe key, then put it in **Codex Cloud environment settings** as server-side `TYPESAFE_API_KEY`, with destination restricted to `api.typesafe.ai`. Do not paste the key into chat, source, browser storage or a committed environment file. Production credentials remain untouched.
2. Permit HTTPS to `api.typesafe.ai` in the Cloud network policy. Preserve the existing package-manager hosts/presets and other configuration.
3. Use `JEV_ENABLED=true`. The existing pinned `jev-1.13.0` remains unchanged in this increment. [TypeSafe's 1.14 announcement](https://typesafe.ai/blog/jev-1-14) documents a newer model; evaluate it on fixed cases separately before changing the shared application pin. No experimental headers are added.
4. After settings apply, refresh environment status and require current/ready observations. Run one explicitly bounded review through the isolated Cloud assessment path using fictional/public metadata, reporting only model/usage/result metadata. Do not run production UI tests, research scans, Telegram handlers or hosted database routes to test credit access.

This code change is still a draft. The production endpoint will not gain the new assessment kind until an approved application release; no production deployment was performed. There is no need to install or run code on Windows.

## REA: current use and practical benefit

**REA is not installed, registered as a callable tool, imported, or used in AI Infra Watch.** The earlier instruction to evaluate `morluto/rea` without installing it is preserved. Existing Codex/source inspection and Playwright checks are not represented as REA usage.

The [official REA README](https://github.com/morluto/rea/blob/main/README.md) describes developer tools for inspecting JavaScript/Electron applications, websites, runtime behavior and native binaries, returning analysis evidence to an agent. Its practical potential here is a targeted investigation of a named reference feature/navigation flow, application-module boundaries or difficult runtime behavior. It is not a market-data provider, stock-selection engine, accounting system or substitute for evaluation evidence.

Compatibility inspection against the published `6.8.0` package metadata: this Cloud runtime's Node `24.22.1` satisfies `^22.23.4 || ^24.22.1 || >=26.12.1`; a procps `ps` executable is present on Linux. This establishes basic prerequisite compatibility only. MCP registration/restart, runtime behavior, resource use and any native-analysis engines are untested. An approved development-only trial would be isolated from the application runtime and production credentials. No installation, runtime configuration or source incorporation occurred.

## Verification and remaining work

Tests cover metadata minimization, strict provider-call boundaries, invalid and private payload rejection, typed-output validation, deterministic gate preservation, usage redaction, explicit auth, no mounting fetch, single-flight/double-click behavior, successful-result reuse after rescan, view attempt limit, stale symbol responses, and 360/768/1440px layouts. The existing scanner still produces the same deterministic classifications without JEV.

Cloud validation passed: **457 frontend unit tests, 19 Python injected-client/evaluation tests and 128 mocked browser/workflow checks**, plus TypeScript, production build, source security audit, migration-manifest integrity and whitespace. An initial full run hit a mobile-navigation focus timeout; both viewport cases and the complete unchanged suite passed on rerun. No focus assertion or unrelated navigation code was changed. Exact counts and pushed-head CI outcomes are recorded in draft PR #168. Tests use no actual TypeSafe credits. Existing bundle-size and hosted-production verification limitations remain open.

Reported financial enrichment and research evaluation/journal work remain pending. Spending JEV credits cannot fill missing reported metrics or establish historical point-in-time evidence. Rollback is a reviewed application-code revert; no schema rollback or notification replay is needed.
