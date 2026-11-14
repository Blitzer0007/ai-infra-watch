# Offline forecast model generation and replay

Implemented 14 November 2026 in Codex Cloud. Builds on the retained archive and
purged evaluation paths with an actual deterministic **reference model**. It does
not change the production forecast model, writer, horizon identities or outcomes.

## Model and interfaces

`server/utils/forecastModelRunner.js` exports:

- `generateForecastRun({protocolVersion, assessedAt, config, windows})` accepts
  `forecast-model-run-v1-experimental`, the existing split configuration with fixed
  model ID `empirical-return-quantiles-v1`, and bounded `{id, archive}` windows.
  Caller predictions, callbacks and arbitrary model names are rejected.
- `evaluateGeneratedForecastRun({input, runBytes, expectedRunSha256})` requires a
  separately selected digest, copies and checks the bounded bytes, regenerates
  the run, requires byte-for-byte reproduction, then passes only those generated
  predictions into the existing matched evaluator.

The first model fits the empirical distribution of eligible training returns and
computes linearly interpolated p10/p25/median/p75/p90 quantiles. It is intentionally
the same reference estimator as the existing training-distribution baseline.
It does not use price momentum or other predictive features, select models,
retune hyperparameters or claim an advantage. Feature history is checked for
identity, basis, chronology and required coverage before admitting a window.

## Cutoffs and data flow

Split validation, instrument scope and chronological training selection are
shared with the existing evaluator. Validation fits expand over training-partition
labels only. Holdout fits use training/validation labels available at the fixed
pre-holdout freeze and are reused within symbol/venue/currency/horizon scope.
Held-out labels never enter a fit, including after maturity.

Each forecast origin checks only its pinned calendar/features at its decision
instant. Its own outcomes are not retrieved, hashed or parsed. Training origins
first perform that same feature-only check. A target close plus the explicit
calendar-time gap must be strictly earlier than fit cutoff; overlapping labels
are purged without retrieving their outcome bytes. Eligible labels then load
through the archive adapter at fit cutoff. Late snapshots, missing labels and
invalid features withhold training evidence rather than borrowing later data.

The runner can generate a forecast for a pending target. Scoring subsequently
preserves that target as pending, with no numerical outcome. Failed or resource-
limited rows remain visible in supplied coverage. Empty training cohorts cannot
invent a neutral model or zero performance metric.

## Artifacts, pins and authority

Fit artifacts record exact training IDs, return values, target/publication times,
inspected calendar/feature/outcome digests, scope, logical fit cutoff, configuration
digest and calculated quantiles. Model-function, training-policy-function and
generation-function source hashes identify those executed functions. These are
scoped implementation identifiers, not a full build attestation.

The generated-run artifact binds fits, per-origin feature receipts, predictions,
coverage and resource usage. Serialization recursively sorts object keys and uses
compact UTF-8 JSON plus newline. The archive export's existing encoding is
unchanged. The byte adapter now returns a digest only for each artifact actually
inspected; pending outcome digests remain null.

The selected run digest must come from outside the supplied artifact. A matching
self-reported digest cannot authorize changed content. The fixed demo uses a
reviewed literal pin. Exact replay also prevents substituting a rehashed altered
forecast or fitting receipt under the same input configuration.

**This is retrospective reconstruction at declared clocks.** `issuedAt` is the
logical decision origin, not proof of historical issuance. A caller who controls
input archives/configuration and pin selection can reconstruct a different run.
An independently retained pre-issuance record, source authentication and model-
selection governance remain required for stronger provenance claims.

All results retain `sourceVerified:false`, `predictionProvenanceVerified:false`,
`modelFitVerified:false`, `productionEligible:false` and
`predictiveValidityEstablished:false`. `computationReproduced:true` means only that
the selected bytes match this deterministic replay; it grants no source,
prediction, investment or deployment authority.

## Resources and demonstration

Each generation/replay is capped at 32 windows, 256 archive assessments and 32 MiB
of inspected bytes, reserving capacity for one worst-case bundle before a read.
Fit and archive caches are local to that run. The canonical run is capped at 1 MiB.
Verification plus scoring reports separate usage with a combined inspected-byte
ceiling of 64 MiB; a preceding generation is a separate bounded operation.
No network, file loader, credentials, ambient clock, worker/account service,
endpoint, database or sender is added.

```sh
node scripts/forecast-model-runner-demo.mjs > /tmp/forecast-model-runner.json
```

The fixed fictional CLI accepts no input/path arguments. It fits three model
artifacts, generates six forecasts, and pairs five with available outcomes while
one remains pending. Validation MAE is 12.5 pp; holdout MAE is 20/3 pp. Model-minus-
training-baseline MAE is zero by construction. These are fictional numerical
goldens, not market performance. Genuine zero labels and zero-width distributions
remain supported.

Twenty-nine new cases cover independent quantile goldens, actual composition,
expanding/frozen cohorts, no held-out/purged byte reads, boundary/microsecond/gap
rules, missing inputs, cross-instrument/horizon separation, deterministic pins,
forgery/replay mismatch, output isolation, invalid/shared byte storage, resource
limits and the credential-free CLI. The original 97 archive/walk-forward cases
remain passing after the shared-selection extraction.

Local Cloud verification passes 982 Node tests, TypeScript, production build,
25 CI-safety cases, workflow syntax and whitespace. The full mocked-browser CI
suite remains an integration regression check; this increment adds no UI flow.
The existing large JavaScript bundle warning remains open.

## Remaining work and progress

Authentic calendar/history acquisition, original availability evidence, independent
pre-issuance retention, feature-based candidate models, real held-out/cluster-aware
evaluation, medium-term/legacy compatibility and final evaluation UI remain open.
There is no predictive-validation or production rollout completion in this change.

This completes the initial deterministic runner portion of the core evaluation
track, moving its engineering estimate from 30% to 40%. The unchanged milestone
weights move the overall estimate from 56.25% to 57.75%, rounded to **about 60%
complete / 40% pending** under the existing five-point convention. This is effort-
based planning, not a percentage of financial truth or production acceptance.

Development stays on draft PR #168. No production secrets, live provider/model
calls, hosted database operation, real message, merge or deployment is included.
