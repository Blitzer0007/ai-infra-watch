# Release 2 — controlled JEV credit use and REA status

Branch: `feature/release2-opportunity-research`, stacked draft PR #168. The user confirmed credits are in the official TypeSafe console. This records the JEV increment and subsequent mirroring plan. Latest REA execution and holding-detail implementation are documented in the [first mirroring review](release2-holding-detail-mirroring.md). No production access or deployment is included.

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

**REA 6.8.0 is now installed and used as an isolated Cloud CLI for the requested feature-mirroring increment.** It is outside the application dependency tree, has no MCP/agent registration, and is not part of the application runtime. Earlier source inspection and Playwright checks remain distinct from the actual REA run; see the [retained evidence and limits](release2-holding-detail-mirroring.md).

The user's intended primary use is **feature mirroring**, rather than general debugging or architecture inspection. The [official REA README](https://github.com/morluto/rea/blob/main/README.md) describes inspecting a selected application/website feature, returning evidence of how it works, and using those findings to build a version in the target project. That is the workflow to prioritize for AI Infra Watch.

For each selected reference feature:

1. Identify the reference URL/repository, exact feature and desired behavior. Start with one bounded flow rather than a whole-product clone.
2. Use REA to capture relevant page structure, interactions, navigation, loading/empty/error states and supporting implementation evidence where available. Keep observations and inferred behavior distinct.
3. Produce a parity specification mapping the reference behavior to AI Infra Watch's components, accessibility/responsive requirements and existing financial/data-quality constraints.
4. Build the feature in Codex Cloud using an original implementation, retaining applicable attribution when source code is reused.
5. Verify the resulting behavior with interaction tests and side-by-side screenshots. Record supported parity and remaining gaps; a similar screenshot alone does not prove the feature works.

REA supplies source-analysis evidence; implementation and verification complete the mirroring flow. It supplies no market data or independent validation of investment rules. The [reference shortlist and first brief](feature-mirroring-and-nvidia-shortlist.md) select Ghostfolio-style holdings drilldown. The bounded selected-source analysis is complete with explicit partial graph coverage; full reference-runtime parity remains unverified.

This Cloud runtime's Node `24.22.1` and Linux `ps` satisfy REA 6.8.0's prerequisites. The isolated CLI completed selected-source analysis; it ran no reference application code. MCP registration, native-analysis engines and full reference-browser behavior are untested. No application dependency, agent configuration or source-code incorporation was added.

## NVIDIA model role and existing compatibility

The user supplied NVIDIA base URL `https://integrate.api.nvidia.com/v1` and `openai/gpt-oss-20b:free`. NVIDIA's [official inference reference](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-20b-infer) uses `openai/gpt-oss-20b` without `:free`; the suffix belongs to an OpenRouter route. The [model shortlist](feature-mirroring-and-nvidia-shortlist.md) recommends the corrected 20B model as the baseline, with separate text and vision challengers to evaluate. Account/model-specific access and limits remain unverified.

The existing Python LLM client already supports an OpenAI-compatible base URL. For a confirmed compatible NVIDIA endpoint, the current transport uses `LLM_PROVIDER=openai`, `OPENAI_BASE_URL`, server-side `OPENAI_API_KEY` and `LLM_MODEL`; the provider name describes the transport and does not require sending requests to OpenAI when the NVIDIA URL is explicitly configured. No values or credentials were changed here.

Use NVIDIA for evidence-grounded research summaries and explanations, JEV for typed triage, and REA for reference-feature mirroring. NVIDIA output cannot create missing financial observations or override deterministic evidence/accounting gates. REA's documented MCP workflow is agent-driven; a direct NVIDIA-to-REA agent integration has not been established or tested.

Before a live NVIDIA run, confirm the exact model ID/base URL, configure a development credential in Cloud settings scoped to the selected NVIDIA host, and check the model's supported parameters and quotas. Explicitly review `LLM_FINAL_MODEL` and `LLM_FINAL_REASONING_EFFORT`: current settings contain an NVIDIA-specific final-model default, which must not silently switch the user's chosen model or send an unsupported parameter. Keep tests stubbed, requests/token limits bounded and production settings unchanged.

## Verification and remaining work

Tests cover metadata minimization, strict provider-call boundaries, invalid and private payload rejection, typed-output validation, deterministic gate preservation, usage redaction, explicit auth, no mounting fetch, single-flight/double-click behavior, successful-result reuse after rescan, view attempt limit, stale symbol responses, and 360/768/1440px layouts. The existing scanner still produces the same deterministic classifications without JEV.

Cloud validation passed: **457 frontend unit tests, 19 Python injected-client/evaluation tests and 128 mocked browser/workflow checks**, plus TypeScript, production build, source security audit, migration-manifest integrity and whitespace. An initial full run hit a mobile-navigation focus timeout; both viewport cases and the complete unchanged suite passed on rerun. No focus assertion or unrelated navigation code was changed. Exact counts and pushed-head CI outcomes are recorded in draft PR #168. Tests use no actual TypeSafe credits. Existing bundle-size and hosted-production verification limitations remain open.

Reported financial enrichment and research evaluation/journal work remain pending. Spending JEV credits cannot fill missing reported metrics or establish historical point-in-time evidence. Rollback is a reviewed application-code revert; no schema rollback or notification replay is needed.
