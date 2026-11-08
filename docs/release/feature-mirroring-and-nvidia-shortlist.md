# Feature-mirroring references and NVIDIA model shortlist

Researched: 8 November 2026, Asia/Kolkata. Scope: public product documentation, selected public source files and model API documentation. No REA installation, private reference-product session, deployment or live model call was performed. Cloud reports zero credential bindings and no custom allowed hosts. Earlier local planning edits are preserved.

Subsequent implementation: the [holding-detail mirroring review](release2-holding-detail-mirroring.md) records the isolated REA 6.8.0 run, explicit partial analysis coverage, and the original React holding-detail workflow. The initial research snapshot above predates that execution.

## Recommended product references

These are the best fits for this application's current problems, rather than a universal ranking of financial services. A reference product's paid data, research ratings and formulas are not acquired by reproducing its interaction patterns.

| Priority | Reference | Behavior worth investigating/mirroring | AI Infra Watch destination |
| --- | --- | --- | --- |
| 1 | [Ghostfolio demo](https://ghostfol.io/en/demo), [public source](https://github.com/ghostfolio/ghostfolio) | Focused portfolio views, mobile-first holdings navigation, opening one holding's details while keeping list context | My Holdings and the selected-company review flow |
| 2 | [Stock Analysis](https://stockanalysis.com/), [financial-data/source guidance](https://stockanalysis.com/help/data-and-downloads/about-our-data/) | Readable financial tables and visible source/provider selection | Sourced financial context with fiscal periods, units and explicit missing data |
| 3 | [Simply Wall St stock research](https://simplywall.st/features/stock-research), [financial-health explanation](https://support.simplywall.st/hc/en-us/articles/9812782597135-Understanding-The-Financial-Health-Section) | Sectioned company research, explanatory health/debt/cash-flow context and drilldown into the underlying facts | Company dossier: business, reported growth, financial health, valuation inputs, risks and sources |
| 4 | [Koyfin portfolio documentation](https://www.koyfin.com/help/my-portfolios/), [watchlist/portfolio workflow](https://www.koyfin.com/help/mastering-portfolio-tracking-with-koyfin/) | Reusable watchlist/table views and portfolio-linked earnings context | Watchlist presets and links into the existing catalyst calendar |
| 5 | [Finviz screener](https://finviz.com/screener), [screener help](https://finviz.com/help/screener) | Grouped descriptive/fundamental/technical filters with visible result counts | Opportunity filters over the bounded loaded universe; unavailable metrics remain unavailable |
| Later | [Snowball Analytics overview](https://snowball-analytics.com/overview) | Portfolio summary, cash-flow/income breakdown and dividend-oriented organization | Optional performance/income navigation; lower priority for the current AI infrastructure focus |

Evidence status: public docs establish advertised features. Ghostfolio's public `home-page.routes.ts` separates Overview, Holdings, Summary, Markets and Watchlist. Its `home-holdings.component.ts` changes `dataSource`, `symbol` and `holdingDetailDialog` query parameters when a holding is selected. This supports choosing its focused drilldown as the first investigation. It is source inspection, not a completed REA/runtime parity assessment.

## First mirroring brief: Ghostfolio-style holdings drilldown

Goal: find one position, inspect its company context, and return to the same list without losing the user's place. Keep Daily Review, My Holdings, Performance and Evidence as the primary workspaces already implemented.

REA investigation inputs: official demo/public source and this single flow. Capture the trigger, detail presentation, close/back behavior, URL state, keyboard behavior, mobile layout, and loading/empty/error handling. Record what was observed, inferred, or unavailable.

AI Infra Watch acceptance proposal:

1. My Holdings exposes one clear search/filter/list entry point; selecting a holding opens a focused read-only detail view.
2. Closing details or using browser Back preserves the search, group, sort, selected symbol and list position. Focus returns to the originating holding control. Direct links work.
3. Details prioritize company/position identity and data freshness, then show explicit links to financial context and Evidence. Advanced panels remain collapsed or in secondary sections. Avoid adding all reference-product widgets to one page.
4. Keyboard, Escape and browser history work at 360/768/1440px; controls remain labelled and the page has no document overflow.
5. Loading, missing/partial/conflicting data and unsupported metrics are distinct. Missing values never become fabricated zeroes, fair values or success states.
6. Existing accounting, return formulas, quote gates and holding classifications remain authoritative. Ghostfolio's advertised ROAI metric does not replace the application's existing performance contract.
7. Navigation itself does not send alerts or write holdings/configuration. Any newly required data read must be explicit, bounded and tested separately.

Implement using the existing React components after the interaction evidence is captured. Ghostfolio's source declares AGPL v3 and uses Angular/NestJS; the plan is an original behavior implementation, not importing its application code or installing its database/Redis stack. Any future source-code reuse needs its actual license obligations reviewed.

Second proposed increment: combine Stock Analysis's period/source clarity with Simply Wall St's sectioned company-research presentation. Populate only supported, normalized observations; source access is separate work. Mirror presentation/interaction rather than importing opaque scores or manufacturing valuation results.

## Correct NVIDIA endpoint and model ID

The user supplied `https://integrate.api.nvidia.com/v1` and `openai/gpt-oss-20b:free`. NVIDIA's [official 20B inference reference](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-20b-infer) specifies:

```text
Base URL: https://integrate.api.nvidia.com/v1
Request: POST /chat/completions
Model: openai/gpt-oss-20b
```

Do not send the `:free` suffix to NVIDIA. That spelling is used in [OpenRouter's free variant](https://openrouter.ai/openai/gpt-oss-20b:free); it is a different provider route and credential system. The NVIDIA endpoint and NVIDIA development key stay paired. No automatic cross-provider fallback is proposed.

## Model candidates to evaluate

| Model ID at NVIDIA | Proposed job | Decision |
| --- | --- | --- |
| `openai/gpt-oss-20b` | Routine evidence-grounded summaries, explanations and compact feature specifications | Start here; matches the user's selected model after correcting the provider-specific suffix |
| `openai/gpt-oss-120b` | Challenger for more involved source comparisons and longer feature/research specifications | Evaluate against 20B before routing additional requests to it |
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | Candidate for screenshot/document-image analysis during feature mirroring | Optional vision track; requires a separate image-capable adapter and account-access verification |

Official endpoint references: [20B](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-20b-infer), [120B](https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b-infer), [Nemotron VL inference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer), [Nemotron VL model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b).

This is a task-based shortlist, not measured quality/latency rankings. Published endpoint existence does not establish access for this account. NVIDIA's [Developer Program FAQ](https://docs.api.nvidia.com/nim/docs/product) describes free hosted API access for prototyping. Treat that as limited development/evaluation access, not a promise of unlimited free production service. No account quota, entitlement or live latency has been checked.

## Cloud configuration proposal and first evaluation

Existing Python transport already supports the supplied OpenAI-compatible base URL. Proposed nonsecret settings, not applied:

```text
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_MODEL=openai/gpt-oss-20b
LLM_FINAL_PROVIDER=openai
LLM_FINAL_MODEL=openai/gpt-oss-20b
LLM_FINAL_REASONING_EFFORT=low
```

The existing transport reads its provider credential from server-side `OPENAI_API_KEY`; in this configuration that value must be a NVIDIA development key, entered only through Cloud environment settings and scoped to `integrate.api.nvidia.com`. Permit that host in the Cloud network policy. Do not retrieve production credentials or put a key in chat/source/browser storage. Retain stub mode for normal tests.

The official GPT-OSS inference references list `low`, `medium`, `high` reasoning effort. Use a small output budget and an explicit request timeout/attempt limit for the first live trial; review the client's existing retries, cache namespace and model overrides before broader use. The current client sends text prompts; a vision model's catalog listing does not make image inputs work automatically. No configuration or application code was changed in this research task.

After secure configuration is ready, start with one public/fictional metadata call, then compare 20B and the 120B challenger on the same small fixed cases. Assess source attribution, numeric/unit fidelity, missing/conflicting evidence handling, instruction adherence, latency, reported tokens, rate-limit handling and cached-repeat behavior. Keep financial math and eligibility deterministic. Require evidence before calling one model the best for this application.

REA inspects reference-feature behavior; Codex implements and tests the resulting feature; NVIDIA can summarize supplied evidence/specifications and, with a tested vision adapter, analyze screenshots; JEV supplies bounded typed triage. No direct NVIDIA-to-REA agent registration has been demonstrated.
