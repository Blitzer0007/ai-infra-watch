# Bounded Company/Catalyst/Daily role runner — 24 November 2026

This adds a tool-calling research-role protocol and dedicated-development NVIDIA hook after the deterministic role views. The runner is implemented and tested with fictional models and mocked provider transports. **No live NVIDIA trial has run. An authenticated manual development UI integration is implemented behind separate opt-ins; production activation remains disabled.**

## What the runner does

`ResearchRoleAgent.run(raw)` accepts the existing strict conditional source-admission request. It freezes the request digest, independently rechecks source declarations and derives the existing deterministic baseline's permitted review codes. Company and Catalyst receive separate scoped catalogs; Daily Review receives their validated selections. No free-form model prose enters subsequent roles or the report.

Each role chooses exactly one loaded-data action:

- `inspect`: inspect loaded observations within that role's families, with conditional eligibility and reason codes.
- `coverage`: inspect missing-family/conflict metadata for that role's allowed families. This does not inspect numeric facts.

It then selects one to three allowed review codes and at most four citations. Numeric/event context codes require a matching conditionally usable, inspected metric/family. Unusable observations may be inspected to understand gaps but cannot be cited as usable facts. New codes, invented citations, prose, additional tools and out-of-scope actions are rejected.

| Role | Scope | Existing provider configuration slot |
| --- | --- | --- |
| Company | Financial and risk observations | bull |
| Catalyst | Catalyst timing/confirmation | bear |
| Daily Review | This symbol's snapshot plus controlled Company/Catalyst selections | judge |

The slots are explicit configuration aliases, not trading instructions or a claim that a particular model is best for the role. NVIDIA-first uses the already documented three distinct candidate models. Complete dedicated per-role configuration can also use the existing optional free-only OpenRouter transport; no new provider, random router or paid fallback is introduced.

## Bounds and authority

- Two model calls and one loaded tool per role; six model/provider attempts and three tools total.
- Existing 600-output-token, six-second per-call, 40-second run and 60,000-prompt-character budgets.
- Single-use runner and fresh single-use adapter; a reused provider router cannot recycle an earlier run's receipts as a new trial.
- Fixed provider endpoints, no redirects, retries, model switching or legacy/shared credential fallback.
- Dedicated factory rejects production/Vercel before credential lookup; underlying adapter rechecks the disable condition before each call.
- Structured results contain controlled selections, citations, fixed status/stop reasons and a bounded trace. Provider errors and raw model output are not exported. Telemetry contains only allowlisted model/role/usage/latency/cost metadata; missing cost remains unknown.
- Protocol completion is distinct from `input_status`. Selections are explicitly non-exhaustive. Source authenticity, forecast validity, decision eligibility, allocation changes and message authority remain false.

The runner has no web/source discovery, document-fetch, filesystem, database, settings, scheduler, broker/order or message tools. It cannot independently authenticate or inspect original source documents. It is bounded agent orchestration, not an unattended financial decision system.

## Cloud probe

Default fictional probe, no provider configuration read or HTTP call:

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/research_role_probe.py --format markdown
```

JSON is the default format. `--case` selects one of the eight bundled FICT calibration cases. CI generates and uploads the default offline Markdown as `research-role-agent-probe` without a live flag or credentials.

After configuring only a dedicated Cloud development secret and the existing explicit flags/profile from [MULTI-MODEL-COUNCIL.md](MULTI-MODEL-COUNCIL.md), an explicitly selected single-case trial is available:

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/research_role_probe.py --live --case growth-with-cash-burn --format markdown
```

Live requires one explicit bundled case and at most six provider attempts for the entire command. There is no automatic dataset sweep. Do not paste keys in chat or copy production/shared credentials; the dedicated development key is currently absent. Model availability/free quota, real latency/cost, selection quality and financial usefulness remain unmeasured.

## Priority evaluation

[Research-role priority comparison](RESEARCH-ROLE-EVALUATION.md) adds hash-bound authored fictional targets, an output-bounded no-model baseline, actual protocol-fixture controls and a one-case live evaluation hook reusing this probe. Offline fixtures demonstrate omissions despite protocol completion; these are not actual NVIDIA outcomes or independent financial acceptance.

## Integration and pending acceptance

The deterministic read-only tabs from [RESEARCH-ROLE-REVIEW.md](RESEARCH-ROLE-REVIEW.md) remain the model-free baseline. A separate **Run model-selected research roles** action now uses `research-v2` through the existing private council relay. It requires loaded source inspection and explicit conditional validation first. The action reuses the frozen source packet; a feed refresh does not silently replace it. Changing the symbol/horizon or starting a new review clears results, and late replies are discarded. One in-flight action, the existing five-attempt session cap and no automatic retries remain enforced.

Additional opt-ins, empty/off by default:

- Build: `VITE_RESEARCH_ROLE_DEV_ENABLED=true`, inside the already development/QA-only council parent. Local fictional QA builds explicitly use `VITE_QA_MODE=true`; do not publish QA builds.
- Both private Node relay and Python backend: `RESEARCH_ROLE_HTTP_DEV_ENABLED=true`, in addition to existing nonproduction council and private authentication configuration.
- Actual inference still requires the existing dedicated live/multi-model flags, candidate profile and dedicated development secret. The UI/server switches alone cannot configure a provider. Production/Vercel remains rejected.

The flat request `{mode: "research-v2", packet, sources}` preserves original bytes for the Python SHA-256 digest. The response is a strict `research-role-response-v1` containing rechecked admission and a bounded `research-role-agent-v1` result. Both Node and browser verify request identity/digest, exact policy/false-authority flags, role order, selected codes, scoped eligible citations, actual inspection trace and counters. Extra prose, uninspected citations, unknown fields and forged complete states are rejected. Trace inspection IDs/families are now explicit; the contract is still only in this undeployed draft.

The separate results panel shows fixed review questions, original cited values, workflow completion versus input readiness, missing roles, and bounded counters. Incomplete runs never appear complete. Simulated runs are labeled and show zero provider requests. UI token usage/cost is unreported; CLI probe receipts concern separate trials. The regular production build continues to omit the entire council/role preview.

QA exercises browser → actual authenticated Node relay → actual Python runner with a fictional model factory and isolated fake access tokens. It makes no live inference, acquires no new source and reads no real provider configuration. Cross-language fixtures cover eight complete cases plus failed, partial and unconfigured responses. HTTP tests cover access, opt-ins, production, body limits, shared concurrency and byte-preserving request binding.

Pending: dedicated NVIDIA development setup; real one-case protocol trial; independently reviewed selection/grounding labels, holdouts and deterministic-baseline comparison; independent source/document inspection; real-provider acceptance of the opt-in UI integration; portfolio-wide daily summaries; separate future production review. An offline fixture completing the protocol does not establish model usefulness or future-winner correctness.

This extends draft PR #189, not the deployed release. Production remains PR #188 at79fddf79a452c2a385b596fced604397781316eb. No production DB, polling, agent activation or Telegram send is part of this work.
