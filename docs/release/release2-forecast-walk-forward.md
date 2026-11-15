# Purged offline forecast evaluation

Follow-up: the [deterministic reference runner](release2-forecast-model-runner.md)
now generates and pins empirical forecasts, verifies their replay and composes
with this evaluator. The original precomputed interface remains available.
Independent historical issuance/source authentication and predictive validation
remain open.

Protocol: `purged-expanding-origin-v1-experimental`. Implemented in Codex Cloud on 9 November 2026 on top of the [retained archive adapter](release2-forecast-archive-binding.md). This evaluates supplied forecasts and constructs logical fit receipts. It does not fit or select a model, authenticate when a forecast was issued, execute a strategy or change legacy tracking.

## Protocol and cohorts

`server/utils/forecastWalkForward.js:evaluateWalkForwardForecasts` accepts an explicit protocol version, assessment instant, configuration and at most 32 identified archive windows. It invokes the actual pin/parser/content/preflight path for each assessed window. Arbitrary precomputed assessment/actual-return objects are not accepted in place of archives.

Configuration records ordered training start, validation start, holdout start/end, model-freeze instant, fixed model ID, minimum training rows, minimum historical feature sessions and a nonnegative `gapMs`. All partition intervals are half-open. Freeze must be within validation and strictly before holdout starts. Gap is explicit **calendar-time milliseconds**, not a claimed exchange-session count; it is bounded to 31 days. These are experimental evaluation inputs, not changes to legacy business/promotion thresholds.

- Each validation origin uses only training-partition labels from the same symbol, venue, currency and horizon. Its logical fit cutoff is that origin's decision instant. Earlier training labels become available as the origin advances; validation labels never train another validation origin.
- Holdout uses training plus validation labels available by the one pre-holdout freeze instant. No held-out observation can train or retune a later holdout forecast, even after its outcome matures.
- A label's target close plus the configured gap must be **strictly before** the fit cutoff. Boundary-touching/overlapping labels are purged. Its retained outcome vintage must also have been published by cutoff, with full microsecond ordering. Availability comes from pinned archive content, not a parallel caller claim.
- Training receipts show eligible, purged and unavailable IDs, fit cutoff and minimum count. They describe permitted inputs, not proof that a model actually used them. A supplied prediction's training-ID set must exactly match the permitted set; duplicate IDs or inclusion of held-out/future/purged rows withholds that forecast.
- Feature-session minimums apply to both training contexts and scored windows. Unknown metadata, missing labels and failed archives remain visible. Duplicate IDs and duplicate instrument/horizon/decision origins invalidate the batch. Input order does not affect chronological cohorts.

The method allows overlapping historical feature lookbacks and does not claim statistical independence of different forecasts. A training label crossing an earlier validation origin may become available at a later validation origin; the purge is applied at each expanding origin. It is not a shuffled or future-training cross-validation scheme. Time/market-cluster inference remains open.

## Predictions and scoring

A scored forecast names the fixed model ID, issuance instant, training IDs and ordered p10/p25/median/p75/p90 values. Validation issuance is at its logical decision/fit cutoff; holdout issuance must be between freeze and its decision cutoff. Return quantiles must be finite, nondecreasing and at least −100% for this positive-close return convention. Unknown/private fields, nonfinite/boolean values, time violations and mismatched receipts are withheld.

Issuance times, model IDs and fit receipts are still declarations. Every result retains **`sourceVerified:false`, `predictionProvenanceVerified:false`, `modelFitVerified:false`, `productionEligible:false` and `predictiveValidityEstablished:false`**. This cannot certify backdating resistance, an authentic frozen holdout, raw-vendor provenance or model effectiveness.

Metrics are reported separately for validation/holdout and 5/20-session horizons. Training cohorts are within instrument; summaries pool supplied instruments within each partition/horizon and explicitly report that dependence adjustment is absent. Every model and baseline aggregate uses the same paired rows; pending/missing forecasts are never quietly removed from the supplied coverage denominator.

| Measurement | Definition |
| --- | --- |
| MAE, RMSE, signed error | Median forecast versus actual percentage-point return; signed error is actual minus forecast |
| Mean pinball loss | Proper quantile loss `max(q × error, (q − 1) × error)`, averaged over the fixed five quantiles, then paired windows |
| Central/wide coverage and width | Inclusive p25–p75 and p10–p90 hits and widths; descriptive proportions, without a calibration verdict |
| No-change baseline | Point and all quantiles at zero, on the exact same scored rows |
| Training-distribution baseline | Linear empirical quantiles of the permitted, available training-label set at that origin/freeze; no held-out returns |
| MAE differences | Model minus each baseline in percentage points; negative means lower observed MAE, not validated alpha |

Genuine zero forecasts/outcomes stay in the proper point/quantile metrics and all paired counts. No old heuristic-match formula or zero-exclusion policy is changed. Scale-normalized means and RMS avoid intermediate overflow for large finite errors. The offline preflight now computes return as `(targetAdjustedClose − entryAdjustedClose) / entryAdjustedClose × 100`, mathematically equivalent to its ratio formula but with less cancellation for tiny changes. A 2-unit change on 10^16 produces 2×10^-14%, and exact integer-return boundary examples no longer inherit ratio-subtraction error. This numerical correction affects the isolated offline evaluator only; stored outcomes and legacy writers are untouched.

## Missing data, limits and output

Reports preserve training-context, scored, pending, needs-data, excluded and unassessed counts. Future decision origins and outside-protocol windows do not inspect archive bytes. Pending targets do not inspect outcome bytes. Missing predictions, invalid archives or insufficient fits withhold both model and baseline scoring on that row. Empty metric cohorts return null, not an invented 0% error/performance result.

The engine conservatively reserves room for one bounded archive before assessment and caps inspected bytes at 32 MiB. Unassessed rows remain in coverage when budget is exhausted. There is no callback, model invocation, network, filesystem, ambient clock, mutable global run state or production authority. It accepts already-loaded bytes under the existing adapter contract, with at most 32 windows.

Output records the exact validated split configuration, assessment clock, scope/dependence limits, row receipts, paired summaries and inspected-byte usage. It has no model ranking, winner selection, promotion gate, portfolio P&L, SPY/QQQ benchmark, transaction cost or trading-return claim.

## Fictional Cloud demonstration and checks

```bash
node scripts/forecast-walk-forward-demo.mjs
```

The fixed demo accepts no external input/path or credentials. It constructs fictional archive bytes/pins and precomputed forecasts in memory; these are not vendor evidence or independently reviewed real-data pins. The actual adapter, evaluator, purge and scoring path reports nine supplied windows: three training contexts, four scored forecasts, one pending outcome and one missing prediction. Validation MAE is 7.5 pp and pinball loss 2.45 pp; holdout MAE is 2.5 pp with a genuine zero outcome included. Those are numerical goldens for fictional data, not market results. Retained receipt: `/workspace/artifacts/forecast-walk-forward.json`.

**41 new cases** verify independent numerical goldens, expanding/frozen cohorts, purging and boundary/gap behavior, microsecond publication, no held-out training, same-instrument/horizon scope, zero-case denominators, matching baseline samples, invalid/late/mismatched forecasts, missing/tampered archives, future/outside origins, lookback/batch/byte limits, overflow-safe metrics, small-return precision and the no-clock/no-network credential-free CLI. Full local suite: **873 Node tests**, typecheck, build, security, migration-manifest integrity and **25 workflow-safety cases** pass. Existing bundle-size warning remains. CI path filters include the exact fixture/runner; no live/deploy/scheduled-job controls change. Exact-head CI is recorded in draft PR #168.

## Still required

Implement/version an actual deterministic model runner and pin prediction/configuration artifacts before issuance; authenticate source/availability evidence; acquire real supported history/calendars; define higher medium-term horizon/legacy compatibility; validate real held-out forecasts; and add cluster-aware uncertainty and investable benchmark/cost assumptions where appropriate. Do not infer those completions from this descriptive protocol or passing fictional tests. See the [complete remaining-work register](release2-remaining-work.md).

No existing forecast, writer, model-selection rule, database schema, schedule or delivery control changes. No live financial-data/SEC/NVIDIA/JEV call, production secret, hosted database operation, real message, merge or deployment is involved.
