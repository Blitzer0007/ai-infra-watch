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

## Next Milestone 3 increments

1. Integrate manual frozen-source quality review into a bounded development/QA user flow and its authenticated local transport, with fail-closed response validation and zero passive writes. Do not expose a live production research endpoint just to demonstrate it.
2. Port a minimal, dependency-closed Bull/Bear/Judge research council and deterministic source-admission contracts from PR #168; retain independent perspectives and Judge abstention; cap model/tool work; do not infer verified issuer truth.
3. Establish Company/Catalyst and Daily Review research role navigation, grounded citations and explicit no-data/loading/denied states.
4. Add browser, backend, privacy, budget, source-conflict and evaluation fixtures, and verify entire exact-current-SHA CI. Only then consider a separately reviewed Milestone 3 production release.

**Restrictions:** Cloud/GitHub CI only; do not run on the user's Windows PC. Do not merge/deploy, alter Supabase or private rows/secrets, activate schedulers, send Telegram, trade, or call paid/live model providers in this increment.
