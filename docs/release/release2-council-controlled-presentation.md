# Controlled council presentation

Implemented 14 November 2026 in Codex Cloud on the Release 2 draft branch. This
addresses the three accepted-prose counterexamples from the
[offline grounding evaluation](release2-council-grounding-evaluation.md).

## Resulting behavior

Bull and Bear still independently choose loaded-data tools and return bounded
claim references, support/challenge interpretations and a proposed summary.
Python validates their existing output contract, then withholds all model-written
summaries and limitations. The returned summary states whether that role cited
inspected observations. Empty claim sets explicitly say that no evidence claims
were accepted. Limitations are fixed statements about source authenticity,
interpretation and unknown future outcomes.

Judge receives these controlled side summaries and validated claim references;
the side models' original prose never enters Judge context. Its displayed summary
records only the validated preference or abstention and states that future
outcomes remain unknown. Existing direct-inspection requirements, evidence gates,
quality-driven abstention, provider budgets and false authority flags remain.

The UI labels the summary as research and distinguishes supplied fact values from
model support/challenge interpretations. Numeric cards reuse the evidence bound
to each accepted reference. Values, units, provenance, original inputs and
financial formulas are unchanged. A preference remains conditional; this does
not validate its causal interpretation or make it an investment decision.

## Contract and privacy

All council results now require
`presentation_version: council-evidence-summary-v1`, including partial and
unconfigured responses. Existing v1/v2 evidence/admission versions retain their
meaning. The shared relay/client validator independently requires the exact
controlled text, fixed limitations, matching metric/implication, sequential and
unique claim references, and cited directional Judge preferences. A missing or
unknown presentation profile or substituted prose fails closed before display.

This tightens the development protocol. Old receipts without the new presentation
marker are rejected; restart/reload the matching private backend and frontend.
There is no persisted council history or database migration. Actual Python demo
and admission response fixtures were regenerated; their request bytes and source
observations are unchanged.

Raw model prose is not copied into returned results, traces, error messages or
Judge context. Existing malformed-output rejection is retained, including the
digit/URL/private-token text restrictions. No model output gains a filesystem,
provider, scheduler, ledger, allocation or messaging capability.

## Frozen comparison

The original `council-grounding-v1.json` proposals and labels remain unchanged.
Its exact original admission fixture is retained as
`data/eval/council-admission-v1-reference.json`; it retains the original SHA-256.
The evaluator defaults to `council-grounding-v2.json`, which reuses all fourteen
original proposal objects, input edits, support labels and proposal hashes.
V2 adds separately frozen expected controlled summaries and limitations.

| Measurement | Original behavior | Controlled presentation |
| --- | --- | --- |
| Known unsupported narrative proposals | 4 | Same 4 |
| Unsupported narratives echoed into results | 3 | 0 |
| Accepted roles with those proposals replaced by controlled text | 0 | 3 |
| Numeral-containing unsupported proposal rejected | 1 | Same 1 |
| Accepted / proposed reference precision | 24/24; 25/26 | Unchanged |
| Required effective abstention | 9/9 | Unchanged |
| Judge proposal policy agreement | 5/12, two missing | Unchanged |
| Provider / JEV requests | 0 / 0 | 0 / 0 |

The evaluator flags a new accepted rendering without a frozen label as unknown;
it cannot silently claim that arbitrary rewritten prose is safe. Running the
original v1 output labels against the new renderer yields regression disagreement,
as expected. That original record is historical, not the current CI baseline.
`semantic_grounding_established` and live-model/source/forecast authority remain
false. This is a measured presentation constraint on fictional replays, not an
automatic semantic evaluator or a live model benchmark.

## Verification and remaining work

Python covers withholding before Judge context, all preferences, empty claim
sets, partial failures and retained inputs. Node covers altered summary/limitations,
unknown/missing profiles, incorrect implications, duplicate/out-of-order citations
and uncited/duplicate Judge preferences. Browser QA injects the three bad prose
examples through the real private JS/Python route and verifies safe display,
response tampering rejection, keyboard/responsive behavior and absent production UI.

Local Cloud checks pass: 953 Node tests, 820 offline Python agent/MCP/API/evaluation
checks, eleven council browser scenarios and 25 CI-safety checks. The existing
fully mocked LLM transport test passes separately without its global stub override.
TypeScript, production build, source security, workflow syntax and whitespace pass.
The existing large-bundle warning remains outside this presentation increment.

No provider credentials/configuration, live NVIDIA/TypeSafe calls, hosted database
access, messages, deployment or new dependency is included. The council remains
manual and development-only, with the existing six-call/three-tool limits.

Next: independently reviewed model-output usefulness, source acquisition/coverage,
cost and failure measurements remain separate development acceptance. Broader core
work remains forecast provenance, authoritative accounting/source contracts,
financial adapters/company dossier, alert/job-health coverage and integrated release
acceptance. Release 2 engineering remains approximately 55% under the current core
plan; only the isolated glossary/help release is live.
