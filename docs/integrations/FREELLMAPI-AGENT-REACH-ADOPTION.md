# AI Infra Watch: FreeLLMAPI + Agent Reach adoption review

**Date:** 19 November 2026. **Status:** Evidence review and mocked integration test only. **Live use:** OFF.

## Inspected upstream repositories (pinned review basis)

- **FreeLLMAPI:** [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi), default branch main as of `9d2b4b407b12e489ecd35320cd630d5ff97cd666`, MIT license. This is the **upstream** of several similarly named forks, e.g. `rodrigoangeloni/free-llm-api` and `MaurizioCasciano/Free-LLM-API`, which advertise differing provider/model counts. The upstream README claims 87 providers, 1,313 free endpoints and 10.1B potential monthly free tokens. **Those are promotional aggregate catalog figures, not a granted quota to this app or a durability guarantee.**
- **Agent Reach:** [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach), default branch main as of `c70ae6da5d39bc90e09ad2ae0575ccc89f31e284`, MIT license, `pyproject.toml` version 1.6.1 and Python ≥3.10. Inspected README (English), security policy and package metadata. It is a CLI for installing/routing upstream web/social tools, **not** a stable structured market-data API or an LLM inference service.

Both projects can be reviewed/reused under MIT, retaining copyright and license notices for actual copied portions. No upstream executable code is imported into this repository by this candidate.

## Decision

| Capability | Reuse | Why |
|---|---|---|
| OpenAI-compatible request surface / model routing | **YES — existing client, mock-only first** | Existing `aitracker-upload/app/llm/client.py` already supports `LLM_PROVIDER=openai`, `OPENAI_BASE_URL` and a server-side key. A router URL can be configured in an isolated environment; no source fork or new JS runtime is required |
| FreeLLMAPI self-hosted aggregate proxy in production | **NO** | Upstream explicitly says personal experimentation/learning, not production. Requires a long-running Docker/Node service with persistent SQLite and encryption key—an ill fit for the application's Vercel free-tier functions. Upstream provider terms, regional availability, model compatibility, and quotas must be checked independently |
| Free-tier LLM in Bull/Bear/Judge | **ONLY OPTIONAL / NON-DECISIONAL** | Good for experimental commentary and prompt comparisons. Existing `portfolio_council.py` validates numeric evidence and constrains model/tool calls; a failed/free model must never manufacture a bullish/bearish price, increase confidence, or make a trading recommendation |
| Agent Reach public web/GitHub/RSS/YouTube discovery | **YES — adapter pattern, not CLI installation in Vercel** | Existing `mcp_servers/stocks/social_research.py` already implements Brave → Tavily → GDELT fallback; `research_sources.py` already supports official issuer sources. Add a provenance-preserving, bounded optional source-adapter later; prefer issuer/SEC/exchange originals over video/social summaries |
| Agent Reach login/cookie/social extraction and persistent shell tools | **NO for this release** | The project installs and invokes upstream CLIs. Optional sources use account login and possibly cookie/session copying; risk includes account suspension, ToS conflicts, prompt injection, privacy exposure, changing HTML and serverless runtime mismatch |
| Public social sentiment as financial ground truth | **NEVER** | Social posts are at most low-trust hypotheses. Require corroborating primary sources before showing any decision-driving numerical evidence |

## Why the current app already covers part of this

- `aitracker-upload/app/llm/client.py`: provider-neutral `generate()` facade, stub fixtures, bounded retries/timeouts, optional OpenAI-compatible URL, per-call model override. No new inference dependency is needed for a first mock.
- `aitracker-upload/app/config/settings.py`: `OPENAI_BASE_URL` can select an OpenAI-compatible provider; `JEV_BASE_URL`, `JEV_MODEL` and `TYPESAFE_API_KEY` are separate. The app already supports the NVIDIA NIM endpoint through that OpenAI-compatible setting. **Do not replace JEV's typed routing with a generic LLM.**
- `aitracker-upload/app/agents/portfolio_council.py`: bounded Bull/Bear/Judge, strict market/financial/catalyst/risk evidence contract, no direct provider or write tools.
- `aitracker-upload/mcp_servers/stocks/social_research.py`: tiered search with degrade-on-failure; `research_sources.py` holds official issuer/analyst integration. No production rewriting is needed to learn from Agent Reach's channel routing.

## Bounded implementation phases

1. **Phase A — existing OpenAI-compatible client contract, completed in this candidate.** Add an offline test proving the request path `/v1/chat/completions`, model ID, timeout and bearer header against a fictional FreeLLMAPI-shaped endpoint. No live inference, access keys, or remote proxy installation.
2. **Phase B — external source contract proposal, not implemented yet.** Add a small allowlisted, read-only adapter for public issuer RSS and GitHub releases/issues, with a fixed upper bound (e.g. 2 sources/query, 5 entries/source, 10-second timeout, 1 retry). Persist normalized `{source_id,source_url,title,observed_at,published_at,retrieved_at,source_type,license,confidence_basis}`; missing dates remain null. Validate domain allowlists, redirects and IP/SSRF protections; no arbitrary URLs supplied by the LLM. Reject prompt injection and never grant scraped pages tool-invocation authority.
3. **Phase C — optional isolated provider trial, separately approved.** Use an authorized cloud environment, not the owner's Windows machine and not production Vercel. Enable only a permitted endpoint and user-owned credentials stored server-side; configure `LLM_PROVIDER=openai`, `OPENAI_BASE_URL` to a *reviewed and authenticated* OpenAI-compatible endpoint, `OPENAI_API_KEY` to that endpoint's own key and a pinned `LLM_MODEL`. Set strict requests/tokens/cost/time limits, logs without prompts/financial rows, and a kill switch. Start with public fictional/synthetic data. Any provider's claimed free tier must be reconfirmed at the provider itself.
4. **Phase D — human-reviewed research evidence.** Only primary SEC/issuer/exchange facts can enter decision-evidence quality gates; public discovery enrichments must retain `basis=unknown` or `estimate`, with negative/unknown quality status where appropriate. LLM summaries may describe citations but may not self-certify a source or overwrite numeric data. No automatic trades or Telegram sends.

## Required gates before a functional rollout

- Pin upstream release/commit and check exact dependency tree, vulnerabilities, rights and provider terms; copying code is optional, not the default.
- Keep all external-data and model calls opt-in, server-side only; no public credential surface. Prevent token leakage in logs and model outputs. Strip cookies and private Supabase rows.
- Define independent evidence freshness, timestamp provenance, source identity, host and redirect allowlist, strict response sizes and per-provider budget/circuit breaker. Never silently fall back from an evidence-grade result to a non-evidence social source.
- Unit-test transport mocks (429/5xx, invalid JSON, timeouts, malicious redirects, provider mismatch) and model attribution; fail closed with an explicit `not-configured`/unknown status, never `BUY` or `SELL` on missing inputs.
- Require exact-head Security/Frontend/UI/API/DB CI before merge. Any Vercel release requires a separately approved guarded deployment. This review **does not** authorize future provider spending, cookies, external ingestion or production deployment.

## User-facing value

Use FreeLLMAPI's routing **ideas** for optional, low-cost Bull/Bear/Judge text experiments and provider observability. Use Agent Reach's source-discovery **patterns** to improve issuer news/RSS and GitHub research context with citations. Neither one fixes the existing Telegram digest's missing quotes or accounting data: an LLM must never fill unknown market prices or unavailable P&L with plausible text. The Telegram brief correction is separately tracked in PR #180, and the UI/UX redesign in PR #179.
