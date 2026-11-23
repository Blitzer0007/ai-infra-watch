# NVIDIA-first council comparison — 23 November 2026

This increment adds a development comparison tool after the successful PR #188 production release. It does not activate production agents or claim that a financial model is useful. The existing Python/httpx adapters and controlled council output contract remain unchanged.

## Implemented

- Eight frozen fictional FICT scenarios: growth with cash burn; profitable growth with a flat market; contraction with cash burn; zero cash flow; stale market observations; missing filing lineage; same-day filing uncertainty; unconfirmed catalyst.
- Explicit fixture labels, kept outside model prompts, for conditional admission, numeric-sign argument selections and required abstention. Assessment time is frozen at 9 November 2026; these are not current financial data.
- An independent no-LLM numeric-selection baseline and the existing protocol fixture control. The baseline does not read expected labels. The protocol control can complete the protocol while failing selection/abstention labels; this is reported as a failure, not model usefulness.
- Per-role conditional citation precision and labelled selection precision/recall; absent denominators are unscored. A valid citation with the wrong stance is distinguished from an unusable citation. A failed or partial run cannot pass required abstention simply because its default disposition is insufficient.
- Optional single-case live comparison through the previously implemented NVIDIA-first role router. Existing six-total/two-per-role attempts, fixed endpoints, no retries/fallback and production guards remain intact.
- JSON and Markdown reports. Live reports expose only role/model metadata, observed latency, token counts and provider-reported cost. Missing cost/usage remains unknown; reported cost is not an independently verified bill. No prompts, model prose, original filing inputs, keys or provider error bodies are exported.
- Python agent CI now includes the existing model-routing tests and evaluation/data trigger paths. It generates and uploads an offline `council-offline-comparison` Markdown artifact without provider credentials or live opt-in.

## Baseline and labels

`numeric-selection-v1` treats positive growth, operating margin and free cash flow as supporting the conditional bull argument; negative values challenge it. Liabilities/equity below one supports that argument and above one challenges it. Bear stances invert. Zero growth/margin/cash flow and exactly-one leverage receive no directional selection. Market price, daily change and catalyst countdown receive no directional sign rule. Missing admission families or conflicts require the baseline to abstain. It always withholds decision eligibility and makes no trade recommendation.

The fixtures use deliberately invented source declarations, including `simulated=false` inside those declarations to exercise conditional admission. The outer fixture/report is explicitly fictional-only, uses FICT exclusively and retains false source-authenticity/action/forecast flags. These declarations must never be imported as authentic financial data or fed into production research storage.

These are authored development/calibration labels, not independently reviewed human truth or a held-out benchmark. Perfect baseline results on them are not evidence of financial skill. Judge future-winner accuracy is deliberately unscored. Real usefulness comparison still requires independently reviewed cases, separate holdouts, authentic source/outcome evidence and comparison with deterministic decision/forecast baselines.

## Cloud-only use

With the repository's Python dependencies installed, run from its root:

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/council_model_benchmark.py --format markdown
```

This default runs all eight offline controls, reads no provider configuration and makes no HTTP calls. JSON is the default format. An optional `--case` selects one bundled scenario; no arbitrary input file, holding, model ID, host or credential can be supplied by CLI arguments.

Only after configuring a **dedicated development** `COUNCIL_NVIDIA_API_KEY` through Codex Cloud secret settings, with the existing explicit development flags/profile from [MULTI-MODEL-COUNCIL.md](MULTI-MODEL-COUNCIL.md):

```bash
PYTHONPATH=aitracker-upload python aitracker-upload/scripts/council_model_benchmark.py --live --case growth-with-cash-burn --format markdown
```

Live requires exactly one explicit case and at most six provider attempts for the entire command. It never sweeps the dataset automatically. Missing configuration, production/Vercel execution, provider errors or invalid output fail closed without retrying. A completed trial can still fail its labels; completion is not a selection-quality pass.

The dedicated key was absent by name-only check. No live provider trial has been run. Do not paste keys in chat, inspect/copy production/shared keys, enable these variables in production or describe the candidate models as tested/free entitlements.

## Verification and remaining work

Local council/evaluation and CI-safety checks are recorded in the current [continuation](CODEX-CONTINUATION.md); exact pushed-head workflow results belong in the draft PR and Cloud evidence. Production stays at PR #188 / `79fddf79a452c2a385b596fced604397781316eb`. No application routes, production flags, database schema or deployment configuration are changed.

Pending: dedicated NVIDIA development setup; live availability/quota/latency/cost measurements; independent grounding/usefulness labels and holdouts; bounded Company/Catalyst Research and Daily Review roles; later review of any production activation. The previous PR #188 release exception is consumed.
