# Bounded Company/Catalyst/Daily role runner — 23 November 2026

This adds a tool-calling research-role protocol and dedicated-development NVIDIA hook after the deterministic role views. The runner is implemented and tested with fictional models and mocked provider transports. **No live NVIDIA trial has run; there is no production activation or UI model-analysis endpoint.**

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

## Integration and pending acceptance

The browser still uses the deterministic read-only tabs from [RESEARCH-ROLE-REVIEW.md](RESEARCH-ROLE-REVIEW.md). Model-selected results are CLI/development-probe only; no new API mode or UI live-model action is wired in. The regular production build continues to omit the council/role preview.

Pending: dedicated NVIDIA development setup; real one-case protocol trial; independently reviewed selection/grounding labels, holdouts and deterministic-baseline comparison; independent source/document inspection; authenticated manual UI integration after provider acceptance; portfolio-wide daily summaries; separate future production review. An offline fixture completing the protocol does not establish model usefulness or future-winner correctness.

This extends draft PR #189, not the deployed release. Production remains PR #188 at79fddf79a452c2a385b596fced604397781316eb. No production DB, polling, agent activation or Telegram send is part of this work.
