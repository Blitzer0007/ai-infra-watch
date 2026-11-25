# Research-role priority comparison — 24 November 2026

The bounded role runner can complete its protocol while omitting important review questions. This increment adds an offline comparison for Company/Catalyst/Daily Review selections, separate from the older Bull/Bear/Judge numeric-sign comparison. It changes no application UI, API, model adapter, production setting or source acquisition.

## What is measured

Eight bundled fictional FICT cases reuse the existing frozen source declarations. A separate priority-label file binds every case to its exact request SHA-256. Labels remain outside model prompts and the deterministic selector. Each role has up to three authored priority targets. These are calibration targets authored during implementation, **not independently reviewed financial truth or held-out validation**; the report explicitly retains both acceptance flags as false.

- `bounded-role-priorities-v1` is a model-free control using the same output cap of three questions/four citations per role. It directly reads conditionally admitted loaded inputs. It prioritizes missing financial/risk coverage, cash-flow context, growth/leverage context, event confirmation and unresolved daily coverage; it never reads the label file.
- The protocol fixture runs the actual bounded agent with a fictional model. Its first-three-allowed-code strategy is deliberately not presented as a useful financial model.
- The scorer checks request identity, false authority, bounded counters, role scope/eligibility, actual inspected citations and matching fact support for numeric/event context. It counts matched/missing authored priorities; an invalid or missing role is unscored. A zero denominator is unknown, never 100%.
- A partial/failed run cannot pass the complete case, even if an earlier role matched its targets. Completion and priority acceptance are separate fields. An otherwise completed live trial that misses a target reports `candidate-priorities-not-met` and exits unsuccessfully.
- Reports export controlled codes, counts and the existing allowlisted provider metadata. They do not export prompts, source filing inputs, model prose, credentials or provider error bodies. Missing reported cost stays unknown and is not a verified bill.

The controls compare output coverage under the same selection cap, not runtime architecture: deterministic code reads admitted inputs directly; agents make bounded loaded-data inspection choices. The authored target choices and fixed baseline share implementation assumptions. Matching these calibration targets cannot establish financial usefulness or justify production activation.

## Observed offline result

All eight deterministic-control cases cover their authored priorities. All eight protocol-fixture cases complete but fail at least one priority target: six omit leverage context, and the two unusable-filing cases omit the Daily Review risk-coverage question. These are fictional-model results, **not NVIDIA results**. They demonstrate that protocol completion alone does not establish coverage.

No live provider request has run. Independent reviewers, authentic source/outcome cases and separate holdouts are still needed before a meaningful financial comparison.

## Cloud-only commands

From the repository root with the existing Python dependencies:

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/research_role_benchmark.py --format markdown
```

Default JSON or `--format markdown` runs eight offline controls, reads no provider configuration and makes zero provider requests. `--case` limits it to one bundled case; no arbitrary input path, provider host, model or credential argument is accepted. CI runs this default and uploads `research-role-priority-comparison` alongside the existing comparison and probe artifacts. Offline exit zero means the report was generated; it does not mark the fictional model accepted.

After dedicated Cloud development setup and explicit live opt-ins from [MULTI-MODEL-COUNCIL.md](MULTI-MODEL-COUNCIL.md), one selected fictional trial can reuse the existing role probe:

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/research_role_benchmark.py --live --case growth-with-cash-burn --format markdown
```

Live requires one explicit bundled case, with at most six provider attempts in total. It reuses the dedicated factory, production/Vercel rejection, fixed endpoints, time/token limits and no-retry behavior. There is no automatic live dataset sweep or second candidate call. The dedicated NVIDIA development key remains absent by name-only check; no availability, quota, latency, cost or usefulness result is claimed. Never paste keys in chat or use production/shared credentials.

## Files and acceptance still pending

`app/eval/research_role_benchmark.py` defines the bounded control, strict hash-bound label loader, scorer and report. `data/research/research-role-priorities.fictional.json` contains authored targets; `scripts/research_role_benchmark.py` is the offline-first CLI. Evaluation tests cover source gaps, cash-flow signs/zero, invalid/uninspected citations, wrong metric support, changed digest/scope/authority, incomplete runs, unknown denominators, strict label files, six mocked attempts, outage/no retry, production disable, report redaction and CLI behavior.

Next: configure a dedicated development account; run one explicitly selected fictional live trial; independently review grounding/priorities and authentic source cases; create separate holdouts; compare accepted cases with deterministic baselines and observed costs. Independent source/document inspection and portfolio-wide Daily Review remain separate work. Forecast validity and decision eligibility remain false throughout this calibration tool.

Continue draft PR #189. Production stays PR #188; no merge/deploy, production database change, live polling or Telegram send is included.
