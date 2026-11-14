# Offline council grounding evaluation

Implemented 14 November 2026 in Codex Cloud. This adds a local evaluation harness
and 14 frozen, developer-authored fictional cases to the existing council. It
changes no application endpoint, financial rule, model configuration or sender.
It makes no NVIDIA, TypeSafe/JEV, SEC or other provider call.

## What runs

```sh
PYTHONPATH=aitracker-upload EVAL_STUB=true LLM_PROVIDER=stub EVAL_CACHE_ENABLED=false \
  python aitracker-upload/scripts/evaluate_council_grounding.py > /tmp/council-grounding-report.json
```

The runner reuses the retained admission fixture, applies bounded existing-field
edits, and runs the actual `PortfolioCouncil.run_admitted` path with a local
scripted model. Its internal `mode=nvidia` only exercises that existing branch;
the report explicitly identifies a scripted offline replay. No provider/model
factory, HTTP client, environment credential or external tool is constructed.
Virtual time tests protocol decisions; it does not measure real latency.

The suite pins the base fixture bytes. Each case binds its input edits and frozen
proposals to label hashes; reports also retain suite/request/case and implementation
hashes. These hashes support reproducibility, not source authentication. Input
files are size bounded, duplicate/nonfinite JSON is rejected, and unknown schema
fields or changed unreviewed proposals fail closed. Output omits source receipts
and proposal text. Invalid CLI input emits a fixed error without private paths.

## Labels and measurements

Labels were written for these fictional facts and scripted proposals, separately
from the council's returned result. **They are not independently collected human
labels or held-out model outputs.** The harness cannot automatically annotate
arbitrary new prose. A changed accepted narrative is reported as unlabelled and
fails the expected-behavior regression check.

The cases cover mixed growth/cash flow, genuine zero, conditional preferences,
stale/simulated/unknown market inputs, conflicting quotes, estimated catalysts,
missing risk coverage, unknown citations, absent direct Judge inspection,
invented percentages, reversed cash-flow signs and unsupported future certainty.

Measurements retain their own denominators:

- Proposed versus accepted reference precision counts evidence identity and
  direct inspection. Neither measures economic meaning or narrative truth.
- Effective abstention is checked against required input/contract rejection.
- Judge policy agreement measures the **executed frozen proposal**, including
  proposals rejected afterward. Missing Judge proposals are counted separately.
  Acceptable preferences are research-policy labels, never future-winner labels.
- Narrative support labels expose acceptance of known unsupported sentences;
  a passing contract check cannot erase them.
- Input-only baselines see the same cases and input-abstention labels. Always
  abstain, family-presence-only and admission-only policies report required
  abstention recall and abstention among conditionally reviewable inputs.
  They neither generate prose nor predict a return. Abstention on a reviewable
  input is not called an incorrect investment decision.

## Initial result and reproduced limits

| Measurement | Frozen replay result | Meaning |
| --- | --- | --- |
| Expected protocol behavior / admission-label agreement | 14/14 each | Includes documented adverse behavior; not a semantic-safety pass |
| Accepted / proposed reference precision | 24/24; 25/26 | Unknown reference rejected before acceptance |
| Effective required abstention | 9/9 | Six input-gate cases and three contract-rejection cases |
| Judge policy agreement | 5/12; two proposals missing | Scripted adversarial proposals, not a live-model quality estimate |
| Complete runs | 11/14 | Three contract rejections retained as failures |
| Labelled unsupported narrative proposals accepted | 3 of 4 | Current prose filtering does not establish semantic grounding |
| Live provider / JEV requests | 0 / 0 | No external model usefulness or credit usage established |

Three counterexamples are currently accepted: an invented percentage written as
words, positive-cash-flow prose contradicting the negative observation, and a
Judge's claim that the future winner is certain. The equivalent invented
percentage written as digits is rejected. The evaluator exposes this difference;
it does not add a word blacklist or pretend reference validity proves prose.
All decision, allocation, message, source-authenticity and forecast-authority
flags remain false in the real council results.

For the six **input** abstention cases, always-abstain and admission-only recall
are 6/6; family-presence-only is 1/6. On eight input-reviewable cases,
always-abstain withholds 8/8 while the other two withhold 0/8. This illustrates
the limitations of presence-only checks and the cost of blanket abstention;
it does not establish alpha or meaningful statistical confidence.

CI runs the evaluator and retains `council-grounding-fixture-report`. Exit zero
means the frozen expected behavior was reproduced, including the explicitly
reported semantic gaps. It grants no release, live-use or prediction approval.
Tests separately block sockets and HTTP sends and verify hashes, denominators,
zero-request operation, authority regressions, unlabelled rewrites and CLI redaction.

Cloud verification: 23 new evaluator checks pass within 812 passing offline
agent/MCP/API/evaluation checks, with live tests excluded. The existing transport
test passes separately with a fake HTTP client and the global stub override off.
Source security, workflow YAML and whitespace checks also pass.

## Next work and progress

Before live model evaluation, constrain displayed financial assertions to
evidence-backed typed facts or separately validate/withhold unsupported prose.
Keep qualitative interpretation distinct and avoid inferring a future winner.
Then collect independently reviewed, frozen provider outputs against matched
baselines using separately approved development access and measured costs/failures.
Authentic source acquisition and matured outcomes remain separate prerequisites.

Release 2 engineering stays **about 55% complete / 45% pending** under the existing
weighted core plan. This adds offline council evaluation coverage; it does not
finish source truth, accounting, financial adapters, dossier, wider alert coverage,
forecast provenance or integrated release acceptance. The glossary/help slice
shipped separately in PR #169 at `d59cb9191d2d33b4e698b7942f31bf5f7557da9c`.
The broader Release 1/2 work remains in draft PRs #167/#168.
