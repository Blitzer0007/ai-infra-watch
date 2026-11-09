# Autonomous agents — reference review and implementation priorities

Assessed **9 November 2026, Asia/Kolkata**, in Codex Cloud. User direction: use autonomous agents where they benefit AI Infra Watch, use REA to examine other implementations, and keep REA primarily for feature mirroring. This is a representative review of three financial projects, our existing agents and public orchestration/evaluation documentation. It is not an exhaustive internet survey or a verified ranking of investment performance.

## Recommendation and current status

Reuse the existing Python/LangGraph/MCP stack. Prioritize **source-quality inspection → sourced company/catalyst research → compact daily decision explanation**, with a bounded challenger only when the evidence warrants one. Keep accounting, eligibility, risk limits and historical evaluation deterministic. More personas and debate rounds are not evidence of better answers.

The repository already implements an `AutonomousMCPAgent`, tool discovery/routing, evidence checks, optional JEV routing, Market/Filings specialists, a supervisor, debate and trajectory/evaluation helpers. The autonomous loop defaults to six steps on Vercel or eight elsewhere, with up to two additional steps for its JEV evidence path. Those limits do not establish account-wide cost control, permission isolation or durable background execution. Current Cloud configuration has no credential bindings or custom provider hosts; tests use fictional sources and stub models. **No live autonomous investigation, always-on job or new notification policy was activated.**

This increment improves the existing agents' reliability and their input contracts. The specialized workflow/role contracts below are the next implementation plan, not already-enabled jobs.

## What other projects implement

| Reference, pinned source | Useful implementation | Application to AI Infra Watch | Limits / treatment |
| --- | --- | --- | --- |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents/tree/9fa1196fffbcfd9de5146d2dd2869df84ab99838) | Analyst branches, bull/bear and risk review, explicit debate-round termination, typed manager output with a free-text fallback | Use specialist responsibilities and bounded challenge; preserve a structured evidence handoff and recorded termination reason | A manager's opinion cannot override a deterministic data/risk gate. Do not allow free-text fallback to become a valid financial decision. Selected static source/tests were inspected; no reference application or model was run |
| [AI Hedge Fund](https://github.com/virattt/ai-hedge-fund/tree/6640aca40ce78394762518a5b2f35d924fcd4a3a) | Pure risk caps outside analyst reasoning; portfolio validation checks eligible evidence, finite weights and contribution consistency; saved backtest receipts | Validate research outputs against deterministic constraints and retain versioned evaluation receipts. Separate research runs from a validated history | The reviewed README calls this a proof of concept. Paper/backtest facilities and available metrics do not prove repeatable real-world returns. Do not import its trading/execution paths |
| [OpenBB](https://github.com/openbq-org/OpenBB/tree/8c69d8d7632a965f765218162667b32074003fea) | MCP tool search/catalog, server-side tool pipelines and explicit result/artifact handling | Discover a small relevant tool set; keep large numeric processing on the server and pass bounded evidence to the model | Discovery is not authorization. Retain our own tool allowlist, call/time/token budgets and output contracts. Selected pipeline code validates references and forbids direct self-calls; it does not by itself establish every limit we need |

OpenBB's former `OpenBB-finance/OpenBB` URL returned a move. The canonical repository inspected here is `openbq-org/OpenBB`; GitHub repository ID **323048702** matches the redirect identity. Pinning avoids silently comparing changing default branches. Reviewed license files identify Apache-2.0 for TradingAgents/OpenBB and MIT for AI Hedge Fund. Reference files remain outside Git/application dependencies; no reference implementation was copied into the product.

Concrete source anchors:

- TradingAgents: `tradingagents/graph/setup.py`, `graph/conditional_logic.py`, `agents/structured.py` and `tests/test_risk_router_path_map.py`.
- AI Hedge Fund: `hedge_fund/risk/limits.py`, `portfolio/validation.py`, `backtesting/research.py` and `backtesting/test_research.py`.
- OpenBB: `openbb_platform/extensions/mcp_server/openbb_mcp_server/app/{pipeline,discovery}.py` and `tests/app/test_route_exposure.py`, plus its MCP README.

The [TradingAgents paper](https://arxiv.org/abs/2412.20138) reports research backtests; the current code/model/provider versions and our medium-term portfolio task differ. Those results are not our baseline or evidence of likely profit. [LangGraph's checkpoint reference](https://reference.langchain.com/python/langgraph.checkpoint) documents persistence/resume mechanisms. A durable checkpointer, retention design and resumable side-effect semantics would still need implementation and tests in our application; this review does not configure them.

## Actual REA work and its limits

Used the existing isolated **REA 6.8.0** CLI, without installing a framework or starting a reference project. Retained six selected files per external repository, including README/license/test material, under `/workspace/references/financial-agent-review`. Inspected four of our own files as a working-tree snapshot based on `e66802892b1e51c4c4e4382a8cb86b2def33e05d`.

These targets are Python. REA's JavaScript graph analyzer is not a Python call-graph analyzer. Instead, syntax-compiled selected Python text to CPython 3.12 checked-hash bytecode using `py_compile`, **without importing or executing the target source**, then used REA `inspect-python-pyc` on those inert files. No target dependency installation, broker connection, runtime model or source-provider call occurred.

- **22 retained files**, including documentation and our four sources.
- **15 successful pyc inspections**, covering **280 code objects**.
- Each selected pyc reports complete marshal inspection within its bounds. This is **not complete repository, semantic, runtime or behavioral coverage**.
- REA retains header/code-object metadata and bytecode digests. This workflow does **not** disassemble, decompile, recover source or prove data/control flow. Manual source review supports the architecture observations above; our offline regression tests support our fixes.
- The source/PYC hashes, pinned refs, canonical evidence IDs, coverage and limitations are in `/workspace/artifacts/financial-agent-rea-manifest.json`; individual summaries/evidence are under `/workspace/artifacts/financial-agent-rea/`. The trusted orchestration script is `/workspace/artifacts/run-financial-agent-rea-review.py`.

Our four selected files were `app/agents/{autonomous,router,mcp_pipeline}.py` and `mcp_servers/stocks/service.py` under `aitracker-upload`. The manifest records exact working-tree hashes; subsequent fixes are verified by tests rather than claimed to be in that earlier REA snapshot. REA does not assess vendor licensing, real data availability, model quality or investment suitability.

## Implemented in this increment

### Python source contracts

- Quotes require a finite positive current price. Missing change, range, previous close, volume and currency remain null; observed zero change/volume remains valid. Invalid/boolean/string/non-finite prices fail with structured `NO_DATA`.
- Finnhub `t` supplies observation time; the injected clock supplies retrieval time. Missing, malformed or materially future `t` stays unknown. No USD/session guess is added. A derived daily move requires a positive observed previous close.
- Fixtures are explicitly simulated. Only a fixture-declared observation time is retained; reading an undated fixture today cannot make it a fresh quote. Missing fixture metadata remains unknown.
- Batches expose requested/missing symbols and safe error codes. Their common observation time is the oldest observation only when all requested symbols and times are covered; a partial batch or unknown time cannot claim a complete as-of time.
- Feed message time is an event time, separate from nested quote time. Deduplication ignores retrieval-only changes but reacts to quality/source/currency changes. Corrected backoff to use the actual failure count; the old local counter never advanced. The batch interval is explicitly not an account-wide provider quota.
- Public transport failures omit credential-bearing request URLs. Model/agent text no longer invents dollars or a flat move when those fields are missing. Malformed/empty MCP snapshots are unavailable. Missing daily moves or undated non-simulated observations cannot enter the Market Agent's move synthesis.
- Synthesis input retains source, observation time, currency, simulation and adjustment metadata; retrieval-only changes do not invalidate a prompt cache key. The fictional response fixture is regenerated from the same converter with no live model call.

### Existing agent defects found and corrected

- Import the declared `GroundednessReport` type so Filings/supervisor models can validate and serialize instead of failing with an unresolved Pydantic type.
- Correct an escaped claim-splitting regex: distinct claims/newlines are now assessed separately, while decimal filing-item references remain intact. The grounding heuristic remains lexical and is **not** proof of factual correctness or numeric entailment.
- Preserve ticker mention order across aliases, dollar symbols and explicit stock phrases; a later alias no longer jumps before an earlier requested ticker.
- Generate the offline summary from its actual input rows, omitting absent tickers. Disable local response caching for the regression run to avoid an earlier canned response hiding the correction.
- Make the application-context test inject an explicitly fictional portfolio fixture rather than depend on a private/untracked snapshot. Correct its package import. Align an outdated candle-factory assertion with the existing Yahoo live default; no provider selection was changed.
- Add an offline CI step for quote provenance and Market/Filings/supervisor/grounding/routing regressions. No live step, sender, cron or production workflow is enabled.

These changes do not complete financial source eligibility. Application portfolio-context aggregation still needs strict currency/time/coverage gates; candle/history adjustment and point-in-time provenance, primary-source labeling, independent corroboration, shared provider quotas and model calibration remain open. No source-quality assertion grants permission to send, trade or alter stored settings.

The quote wire contract now includes nullable numeric/time/currency fields and separate retrieval metadata. In-repository consumers covered here are updated; external MCP clients and remaining legacy portfolio/decision consumers require compatibility review before deployment. Price availability is not a freshness or eligibility assertion.

## Which agents benefit us first

| Priority | Role | Concrete benefit | Output / authority |
| --- | --- | --- | --- |
| 1 | Source Quality Agent | Identifies missing/stale/conflicting/unsupported evidence before research; prevents repeated calls to an unavailable provider | Typed findings and coverage over a bounded snapshot; deterministic checks first. Cannot fabricate missing observations or upgrade eligibility |
| 2 | Company and Catalyst Research Agent | Collects a small set of issuer/SEC facts, tracks period/date/currency and surfaces changes relevant to a selected holding | Sectioned sourced research with evidence IDs and open questions. No valuation without supported inputs |
| 3 | Daily Review Agent | Explains changes and next checks using existing deterministic decision-card IDs and calendar facts | Draft compact daily brief. The existing authorized sender remains separate; no new schedule or message activation |
| 4 | Contradiction Reviewer | Checks whether a conclusion is contradicted by evidence or silently ignores missing inputs | One bounded challenge pass when needed. Independent evidence matters more than another agent restating the same source |
| 5 | Evaluation Agent | Compares new research output with the deterministic baseline and records failures/cost/latency | Offline evaluation receipt. Cannot rewrite the holdout, self-certify promotion or optimize rules against future outcomes |

Use deterministic code for calculations/limits, JEV for bounded typed evidence triage where it earns its cost, and an optional model for planning/explanation. NVIDIA baseline remains `openai/gpt-oss-20b` at `https://integrate.api.nvidia.com/v1`; availability, free entitlement, structured-output reliability, latency and quality have not been tested for this account. No paid model/provider migration is proposed. Secure development credentials and permitted hosts are prerequisites for any real model comparison.

## Next implementation contract: Source Quality Agent

Build this as an explicit **development-only, read-only research run** using the existing agent/tool stack, first over fictional/loaded snapshots. Suggested contract, still to implement:

```text
request: runId, taskKind, assessedAt, bounded selected symbols, input snapshot IDs
evidence: evidenceId, source, issuer/symbol, observed/published/retrieved times,
          precision, currency, adjustment basis, simulated status, coverage
finding: symbol, severity, fixed reason code, evidence IDs, missing fields,
         bounded explanation and next check
result: complete|partial|needs-data|failed, findings, observed/expected coverage,
        tool/model usage, termination reason, contract/model/prompt versions
```

Initial proposed limits: at most five symbols, twenty total allowlisted read calls, two model passes and two typed JEV assessments per run, with explicit token/time ceilings. These are proposed development limits, not measured optimal values or already-enforced account budgets. Cache verified facts by source identity/observation; deduplicate identical reads; never retry an unknown side effect. Reject oversized inputs rather than silently claiming complete coverage after truncation.

Use an explicit role allowlist covering only reviewed quote/issuer/filing/quality readers. Tool discovery must not widen it. Exclude notifications, claims/retries, transactions, settings, cron, database writes, arbitrary URL fetches, shell and code execution. Treat retrieved documents as evidence, never instructions. A provider failure remains a provider failure; an LLM cannot repair it with an estimated price. No new background behavior on page mount.

Persist resumable run state only after a separate scoped storage/retention design is reviewed. A local/disposable checkpoint comes before any hosted integration; resume must preserve input/source/model versions and spend already counted. Checkpointing does not authorize replaying a sender or executing trades. Keep production activation behind existing manual controls.

## How we will measure effectiveness

Use the **same frozen evidence packets** for deterministic-only, one model, JEV-assisted and bounded reviewer variants. Include missing fields, stale/future observations, conflicting sources, wrong issuers, split/currency mismatches, publication/retrieval differences, rate limits and injected document instructions. Start with at least fifty independently labeled cases as an engineering evaluation set; that count does not establish statistical validity or predictive performance.

Measure:

- Supported-claim/citation accuracy and numeric consistency against independently checked facts, not another agent's opinion alone.
- Correct abstention and missing/conflicting-data detection; no fabricated zeroes or quote freshness.
- Research usefulness: an identifiable new fact, clear contradiction or useful next check versus the existing deterministic brief.
- Tool calls, retries, tokens, reported credit usage, latency, cache hits, duplicate work and termination reasons.
- Permission-boundary violations, prompt-injection resistance, malformed-output handling and replay/resume correctness.

Freeze acceptance criteria before model comparison. Require zero unauthorized writes/sends, zero accepted invented financial numbers and full citation/numeric consistency for accepted facts in the frozen acceptance set; failed cases withhold output. Report denominators and coverage instead of an aggregate “AI accuracy” score. Promote a reviewer only if it materially improves the labeled result at an acceptable measured cost. Evaluate medium-term outcomes separately with adjusted/point-in-time data and matured horizons; do not infer investment effectiveness from a polished summary, stars, a fixture pass or a small backtest.

## Validation and safety

Final local broad offline run: **440 passed, 13 live cases deselected**, including the malformed/empty MCP snapshot cases. The new CI-equivalent selection passed **106 tests, 3 live cases deselected**; **25 offline workflow-safety cases** passed. Node/TypeScript suite: **539 passed**. TypeScript, source security and whitespace checks pass. Exact-head CI is recorded in draft PR #168. No assertion was removed to hide a failure. The initial broad run exposed missing test import/context and existing agent defects; the corrected suite exercises those paths with fictional inputs. The broad run uses the stub model with local response caching disabled; its explicit provider-client test uses a mocked HTTP transport.

No merge/deployment, production endpoint/secret, hosted database query/change, real message, live model call, account configuration or reference-app execution occurred. No new runtime dependency or provider was added. Rollback is an application/test/workflow code revert; no stored-data repair, schema rollback or message replay is required. Release 2 remains approximately **55% engineering complete / 45% pending**; agent evaluation and production activation are not complete.
