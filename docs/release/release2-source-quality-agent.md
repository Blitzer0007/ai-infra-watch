# Source Quality Agent — loaded quote inspection

Implemented 9 November 2026, Asia/Kolkata, on the Release 2 feature branch. Scope: an explicit **read-only Cloud development runner over loaded quote metadata**. The original role baseline added no UI, HTTP route, MCP registration, scheduler, hosted storage or live provider/model connection. The subsequent [manual development UI integration](release2-source-quality-ui.md) now supplies reviewed loaded-quote mapping and private loopback transport; production and live providers remain disabled.

## Behavior and authority

`SourceQualityAgent` validates a bounded request, inspects each selected symbol and chooses a comparison step only when at least two distinct declared providers have observations that pass the per-record metadata checks. It returns typed findings, coverage, an effective policy, tool usage and a termination reason. These are deterministic checks; an LLM is neither needed nor used for checking a missing timestamp or comparing compatible prices. Company research and model-written explanations remain separate work.

The role owns exactly two trusted, in-process tools:

| Tool | Input | Behavior |
| --- | --- | --- |
| `source_quality.inspect_quote` | One requested symbol | Inspect the loaded records; report missing/invalid/unsupported metadata and retain eligible-for-comparison record IDs |
| `source_quality.compare_quotes` | One already-inspected requested symbol | Compare compatible records from different declared providers; report disagreements and incompatibilities |

There is no remote delegate or capability discovery. Bare aliases, unknown tools, unrequested symbols, extra arguments and comparisons before inspection are denied. The workflow never calls a generic research agent to repair missing data, discover another tool or expand the universe. Its model, JEV and provider request counts are always zero.

**Metadata coverage is not source verification or decision eligibility.** Provider/source-mode labels and returned symbols are supplied by the caller. A returned symbol match does not prove issuer identity, entitlement, licensing or data truth. Different provider labels do not prove independent underlying sources. Every result explicitly sets `verifies_provider_identity=false` and `grants_decision_eligibility=false`.

## Contract

Implementation: `aitracker-upload/app/agents/source_quality.py`. Lazy exports from `app.agents`: `SourceQualityAgent`, `QualityRequest` and `QualityResult`. Imports do not initialize model clients or credential settings.

| Request part | Fields / limits |
| --- | --- |
| Run identity | `run_id` with bounded identifier characters; `assessed_at` with an explicit time and timezone |
| Universe | One to five unique uppercase symbols; never silently truncated |
| Observations | Zero to fifteen records, at most three per symbol; unique evidence IDs; no records outside the selected universe |
| Each observation | `evidence_id`, `symbol`, optional `returned_symbol`; declared `provider` and `source_mode`; nullable finite numeric `price`/`change_pct`; nullable currency, observation/retrieval instants, date-only market date, adjustment basis and session flag; explicit stale hint |
| Policy | Maximum age/alignment difference, discrepancy threshold, optional expected currency, tool and elapsed-time bounds |
| Raw input | UTF-8 JSON, at most 65,536 bytes. Duplicate keys, non-finite constants, invalid encodings, extra fields and malformed shapes fail closed |

Accepted providers: `yahoo`, `finnhub`, `alpha-vantage`, `fixture`, `unknown`. Source modes: `live`, `simulated`, `unknown`. `live` is a declaration, not an assertion that the agent contacted a provider. Unknown providers are reported as unknown; unrecognized provider IDs fail schema validation rather than impersonating a supported vendor.

Instants require an explicit time and timezone and normalize to UTC. A date-only record has `market_time=null`, `time_precision="date-only"` and a valid `market_date`; no midnight observation is invented. The v1 contract keeps `market_date` exclusive to date-only records. Currency case is preserved: `GBp` is not converted into `GBP`. There is no FX conversion.

Optional metadata stays optional; zero movement is a real number and never a substitute for missing movement. Boolean/string/non-finite numeric fields fail request validation. Negative/zero finite current prices yield an explicit unavailable-price finding. Notes, private portfolio quantities/costs, URLs, keys, raw documents and instructions are not accepted request fields.

Result fields include:

- Fixed `source-quality-v1` contract version, run identity, assessment instant and the effective policy.
- `status`: `complete`, `partial`, `needs-data` or `failed`; `inspection_complete` and a separate termination reason.
- Expected/inspected/uninspected symbols, pending comparisons and provided/inspected/per-record metadata-covered observation counts. These are coverage of the supplied packet, not provider-universe coverage.
- Per-symbol `metadata-covered`, `needs-data` or `review`, fixed finding codes with evidence IDs, comparison status and any comparable-price discrepancy.
- A bounded execution trace, attempts/executed calls and zero provider/model/JEV requests. Results contain no raw exception or rejected payload.

`complete` means all selected symbols' supplied observations pass the configured metadata checks and the inspection completed. A single source can have covered metadata with `comparison_status="not-assessed"`; that is not corroboration. An explicitly simulated or unsuitable packet can have `inspection_complete=true` and `status="needs-data"`. Budget interruption cannot look complete: uninspected symbols and pending comparisons remain visible.

## Checks, comparisons and budgets

Per-record blockers include unavailable current price or daily move, simulated/unknown source mode, unknown provider or returned symbol, symbol mismatch, unknown/unsupported currency, unknown adjustment basis or session, stale source hint, missing/date-only/future observation time, excessive age and impossible observation/retrieval ordering. Missing retrieval time is a separate attention finding; retrieval never replaces observation time. A good quote cannot hide another supplied record's blockers.

For two otherwise usable records, require different declared providers, identical currency/adjustment basis/session flag and observation instants within the policy's alignment window. Incompatible pairs produce findings, without a fabricated agreement or price-conflict claim. A comparison uses:

```text
discrepancy percent = (maximum price / minimum price − 1) × 100
```

It matches the existing JavaScript comparison helper's denominator. Compare decimal input representations with an independent precision context, so an exact 2% difference is not classified above a 2% threshold by binary rounding or a caller's decimal context. Unsupported numeric scales are withheld. A discrepancy above the configured threshold produces `PRICE_DISCREPANCY` and review status; it does not choose the true price or average conflicting quotes.

Default development policy: 900-second observation age, 60-second alignment difference, 2% discrepancy, twenty maximum tool calls and a 1,000 ms elapsed-time budget. Allowed policy maxima are 86,400 seconds age, 3,600 seconds alignment, 100% discrepancy, twenty calls and 2,000 ms elapsed time. These are explicit diagnostic settings, not calibrated investment thresholds. Existing decision-card/rule thresholds are unchanged.

Age is an assessment-relative policy, not an exchange calendar. This role does not certify latest close, venue, extended-session compatibility or a point-in-time history. Closed-session evidence can exceed the diagnostic age policy even when a separate production last-close policy would accept it. Consumers must review those policies before connecting this result to investment decisions.

At most ten successful local calls are needed for the current five-symbol/two-stage workflow. Calls have no automatic retries. Cooperative monotonic time checks run before and after each bounded local calculation; late results are withheld. This is not hard cancellation of an arbitrary remote tool. Each run starts with fresh in-memory state and budgets; no resume/checkpoint or cross-run account quota is claimed.

## Run in Codex Cloud

From the repository root, using the existing Cloud virtual environment:

```bash
/workspace/venvs/ai-infra-watch/bin/python aitracker-upload/scripts/run_source_quality_agent.py --demo
```

The committed demo deliberately contains one simulated, undated observation and one missing symbol. Expected result: both symbols inspected, `status="needs-data"`, two inspect calls, zero comparisons/provider/model/JEV calls and no eligibility grant. It must never look like a successful live-data check.

To inspect a producer-supplied packet in the contract above:

```bash
/workspace/venvs/ai-infra-watch/bin/python aitracker-upload/scripts/run_source_quality_agent.py --input /workspace/artifacts/loaded-quote-metadata.json
```

The CLI requires an explicit input or demo choice, reads at most the byte limit plus one, writes JSON to stdout and exits 2 on a failed request/file read. File errors do not echo private paths. No input/output file is overwritten by the runner. The executable example is development-only; it does not export a private portfolio or fetch a provider.

Retained fictional result: `/workspace/artifacts/source-quality-agent-demo-result.json`. Request JSON schema is available through `QualityRequest.model_json_schema()`; the subsequent [reviewed adapter](release2-source-quality-ui.md) maps loaded quote DTOs and preserves missing identity/session/currency. Only an explicit development review submits the minimized packet.

## General autonomous planner repair found during this increment

The intended non-stub planner implementation in `AutonomousMCPAgent._plan` was held in a single comment containing literal `\\n` characters. Static AST inspection showed no executable `generate` call in that method; real planner mode could fall through without invoking its model. Restored the actual code and its intended symbol/tool filtering. Added fake-model tests for a valid structured action, filing-tool filtering, invalid JSON and model exceptions.

Planner exceptions now end with a fixed failed result, without raw provider bodies/URLs or another tool/model retry. This repairs a code path; it does **not** verify NVIDIA/TypeSafe availability or model quality. After a future deployment, configured non-stub planner mode can make its intended model call where that broken branch previously fell through. Review development cost/time budgets and live compatibility before production activation. No live model call occurred here.

The Source Quality Agent does not use that general planner, keyword fallback, debate, provider client or JEV route. Its tool authority remains the two local methods above.

## Verification and next work

Seventy-two source-role tests cover metadata/zero/precision/time/identity/source/currency/basis/session boundaries, exact comparison thresholds, incompatible pairs, unsupported scales, decimal-context independence, tool/argument denial, budget interruption, immutable/fresh run state, malformed/private inputs and CLI isolation. Four separate fake-model tests exercise the repaired planner branch without a provider call. The broad local agent/MCP/evaluation/API runtime selection passed **516 tests, with 13 live cases deselected**. TypeScript, source security, whitespace and 25 offline workflow-safety cases passed. CI includes both new files in the existing offline agent step; exact-head validation is recorded in draft PR #168.

Remaining work:

1. The [reviewed loaded-quote adapter and manual UI](release2-source-quality-ui.md) are now implemented with privacy/coverage tests. Next extend source provenance and eligibility into remaining consumers; provider/issuer truth is still unverified.
2. Remaining portfolio/decision consumer eligibility, shared SEC/provider quotas, filing-date semantics and adjusted/point-in-time history integrity.
3. Independent labeled source packets and model/JEV effectiveness comparisons. These deterministic regression cases are not an independently labeled financial benchmark or a claim of predictive accuracy.
4. Company/catalyst research and Daily Review roles, then optional bounded model-written explanations over accepted facts. Live development credentials/hosts, model compatibility and resource acceptance remain separate prerequisites.

No new framework, dependency, HTTP function, source provider, scheduler, hosted query/write, message, account configuration, merge or deployment is included. REA informed the preceding reference comparison; this increment uses original Python implementation and offline tests. Rollback is a reviewed code/test/workflow revert, with no database rollback or message replay.
