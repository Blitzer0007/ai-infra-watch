# Multi-model council and NVIDIA-first trial — 22 November 2026

The owner requested free-API discovery, different models per role, and a production repair release. The owner selected **NVIDIA first** for the development trial. This increment adds configurable role routing and a safe probe; it does not activate production agents.

## Provider discovery and candidates

Inspected [jtig37/free-llm-api-resources](https://github.com/jtig37/free-llm-api-resources/tree/d7f1c86c8d59d04117fdc248a321444dc7f5de44) at pinned commit d7f1c86c8d59d04117fdc248a321444dc7f5de44. It is a discovery catalog; its older model/quota rows are not current availability or pricing evidence. No third-party code was installed or executed.

The NVIDIA-first-v1 candidate profile has three distinct model IDs documented by NVIDIA:

| Role | Candidate model | Official reference |
| --- | --- | --- |
| Bull | openai/gpt-oss-20b | https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-20b-infer |
| Bear | qwen/qwen3-next-80b-a3b-instruct | https://docs.api.nvidia.com/nim/reference/qwen-qwen3-next-80b-a3b-instruct-infer |
| Judge | meta/llama-3.3-70b-instruct | https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct-infer |

These are candidates for measurement, not proven best financial models. Documentation presence does not establish account access, remaining free quota, latency within the six-second budget, grounding or useful predictions. NVIDIA IDs do not use OpenRouter's :free suffix.

OpenRouter remains an optional separately configured adapter. Its [official free collection](https://openrouter.ai/collections/free-models) and [models metadata](https://openrouter.ai/api/v1/models) were reviewed, including current explicit free models. The [free router](https://openrouter.ai/docs/guides/routing/routers/free-router) selects models dynamically, so this implementation rejects it for distinct, reproducible role assignments. Account [quotas](https://openrouter.ai/docs/api_reference/limits) are shared and may change. The [provider routing contract](https://openrouter.ai/docs/guides/routing/provider-selection) documents the zero-price and data-policy filters used here. Public catalog access from the Cloud shell returned a proxy tunnel 403; web metadata remained accessible. This is not evidence of a provider outage.

## Implemented controls

- One server-selected model for each Bull/Bear/Judge role, three distinct explicit IDs, at most two attempts per role and six HTTP attempts total. Existing six-second/request, 600-output-token, 32 KiB request/response and total council/tool budgets remain intact.
- Fixed HTTPS provider endpoints only. No caller-selected host, model, key, arbitrary provider, redirect, automatic retry, random router or fallback to another model.
- NVIDIA uses its documented integration endpoint. A supplied returned-model mismatch is rejected; absent usage/identity metadata stays unknown.
- Optional OpenRouter requires explicit :free IDs, zero prompt/completion/request price ceilings, provider fallback disabled and data_collection=deny. Unsupported routing/privacy constraints fail rather than relax. A reported nonzero charge or unexpected model identity rejects the response; this does not undo an already incurred vendor charge or certify external billing.
- Role routing is configured only from dedicated server-side development variables. Partial/ambiguous profiles and duplicate IDs fail closed. No production secret lookup, browser key input or environment modification was performed.
- Production/Vercel guards are checked before configuration and again before requests. The council UI remains absent from the normal production build.
- Strict browser/Python/JEV wire contracts accept the bounded multi-model mode. Evidence admission, independent openings, citation checks, controlled prose, abstention and all false action/source/predictive-authority flags remain unchanged. TypeSafe remains a separate manual counts-only assessment.
- Probe receipts contain role/provider, requested/returned model, latency and reported token/cost metadata. They contain no keys, prompts, source text or raw provider bodies. Missing cost is unknown, not zero.

## Dedicated Cloud development setup

No key value belongs in chat, source control, screenshots or logs. Configure COUNCIL_NVIDIA_API_KEY through a dedicated Cloud environment's secret settings. It was absent by name-only presence check during this implementation; no general or production key was inspected.

For the NVIDIA-first profile, the development process requires COUNCIL_DEV_ENABLED=true, COUNCIL_LIVE_DEV_ENABLED=true, COUNCIL_MULTI_MODEL_DEV_ENABLED=true and COUNCIL_MODEL_PROFILE=nvidia-first-v1. Live remains disabled unless all required opt-ins and the key exist. Do not set these in production. Profile selection cannot be combined with partial per-role overrides.

An alternative explicit configuration requires all three COUNCIL_BULL/BEAR/JUDGE_PROVIDER and _MODEL variables, with provider nvidia or openrouter-free. It uses dedicated COUNCIL_NVIDIA_API_KEY or COUNCIL_OPENROUTER_API_KEY as appropriate. There is no silent fallback to the shared legacy model when multi-model configuration fails.

Run only in Codex Cloud with the project's Python dependencies and PYTHONPATH=aitracker-upload:

- python aitracker-upload/scripts/council_model_probe.py — offline fictional protocol baseline; no network or credential reads.
- The same command with --live — explicit fictional-evidence development probe, at most six inference calls, only after the dedicated key and permitted network access exist.

The probe is not a financial benchmark. Its deterministic protocol fixture and simulated evidence cannot establish source truth, model usefulness, alpha or forecast accuracy. Real usefulness comparison still requires independently labelled cases and deterministic decision/forecast baselines; Company/Catalyst Research and Daily Review role expansion remain pending.

## Verification

Local checks: 1,151 Node tests; 105 Python council/admission/routing cases; 33 offline CI/deployment safety checks; TypeScript, security scan, whitespace and production build passed. The existing council/navigation browser run passed 33 cases with its production-only case skipped in the QA build; that case then passed against the production build. Both legacy and multi-model browser/relay/TypeSafe flows passed the targeted two-case check. The production-mode all-workspace no-passive-write smoke also passed.

Only fake provider transports were used. The offline probe returned offline-only with no receipts or credentials accessed. Actual NVIDIA access, quotas, cost, latency and grounding remain unmeasured because the dedicated development key is not configured. Exact-head CI is recorded in PR #188 and the Cloud handoff.
