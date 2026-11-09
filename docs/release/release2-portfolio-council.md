# Portfolio Lab Bull / Bear / Judge council

Implemented in Codex Cloud on the Release 2 feature branch, 9 November 2026. Development/QA preview only. This resumes the linked multi-agent design: NVIDIA handles bounded research roles; official TypeSafe JEV optionally checks typed coverage. Neither provider was contacted during implementation or verification.

## User story and boundaries

Open **JEV Portfolio Lab → Bull · Bear · Judge research council**, select one company and a 3/6/12-calendar-month research horizon, then explicitly run either the fictional demo or loaded-evidence analysis. The horizon labels research context; they neither create forecasts nor reinterpret the existing 5/20-session forecast rows.

Bull and Bear receive independent openings with the same metric catalog. Each chooses one local `inspect` or `coverage` tool and then returns a structured conclusion. Judge sees their validated conclusions, chooses a local inspection/coverage action, then compares the evidence or abstains. Directional preferences must cite a known claim whose original fact Judge directly inspected. These are bounded model-selected actions within a fixed role sequence, not an always-running autonomous researcher. There is no opponent rebuttal round in this first version.

The UI separates **Judge preference** from the deterministic **Evidence result**. A model cannot override missing, stale, simulated, conflicting or incomplete inputs. A complete run may still return insufficient evidence. Even a provisional result leaves source-authenticity verification, forecast validity and decision eligibility false. Numeric fact cards echo loaded observations; model prose is explicitly labelled interpretation. Allowed metric/implication checks verify references, not the economic truth or causal direction of every sentence. Shared-model errors and judge bias remain possible.

No council capability reads holdings from storage, discovers global tools, retrieves providers/SEC/web pages, writes a ledger, changes weights, places orders, schedules monitoring or sends messages. The existing parent Lab still has its earlier separate research/save actions; the council does not call them. Tests intercept all other parent-page APIs.

## Flow and contracts

`JevCouncilPanel.tsx` → authenticated `POST /api/agent-ask?task=council` → explicit private loopback relay → existing FastAPI task middleware → `PortfolioCouncil` → validated receipt/citations → three role cards.

- `shared/portfolioCouncilContract.js` validates minimized requests and correlated responses on the relay and client. Requests use compact `JSON.stringify` form; development middleware rejects non-round-tripping JSON and duplicate keys. Python independently rejects duplicate keys, invalid UTF-8/nonfinite literals and oversized packets.
- `src/utils/portfolioCouncil.ts` maps only actual loaded public price/move and verified-status financial observations. Exact requested/returned quote identity is required. Genuine zero survives. Quantities, costs, theses, notes, credentials, raw source prose and URLs are excluded. Missing publication/retrieval/reporting-basis/period-start information stays unknown.
- Python owns evidence gates, snapshot hash, role orchestration, citation matching and fixed usage/termination receipts. A hash identifies normalized packet content; it does not authenticate a publisher or prove historical availability.
- Loaded facts are capped at eight for one company. Supported families are market, financial, catalyst and risk. The current UI only maps available market and selected financial metrics; complete catalyst/risk provenance adapters remain pending. Consequently current loaded packets normally abstain. The demo uses the distinct symbol FICT and simulated facts and always abstains.
- Time metadata requires explicit instants. Configured publication-age ceilings are fifteen minutes for market, five hundred fifty days for financial/risk and thirty days for catalyst, plus ordering/financial-period checks. These are conservative metadata rules, not account/provider verification or a validated financial-quality score.

## Budgets and failure behavior

| Boundary | Enforced limit |
| --- | --- |
| Request | 32 KiB, one symbol, eight observations, exact schema |
| Council | six model calls; three local tool actions; two steps per role |
| Prompt/output | 60,000 aggregate prompt characters; 600 requested output tokens/call; 8 KiB content/call |
| NVIDIA transport | one attempt/call, no retry/redirect, fixed NVIDIA endpoint, 32 KiB body limit, capped six-second timeouts and elapsed checks |
| Council time | forty-second cooperative budget; late outputs withheld |
| Concurrency | one council or JEV task per Python process |
| Private relay | loopback HTTP only, configured backend token, no Host-derived destination; 45-second timeout, 64 KiB response |
| UI | one request in flight, five attempts shared across manual council/JEV actions per mounted panel, 47-second abort, no automatic retry |
| Existing access | authentication before task/body work; shared JS twelve-per-minute process/IP limit |

Timeouts are cooperative plus per-I/O transport timeouts; they are not a hard process kill or cross-worker/account-wide spending ceiling. Provider request counts are attempts, not exact billed tokens or dollars. No retry, cache or persistent checkpoint is added. Successful results remain frozen in memory until a new review; selection/horizon changes abort and invalidate old responses, and attempts do not reset with those changes.

Unconfigured providers return unavailable. Malformed model output never falls back to free-form advice. A partial/failed run retains validated earlier roles and fixed safe termination categories; raw upstream errors/bodies are not exposed. Summary text cannot introduce digits, currency symbols, URLs or HTML; this reduces unsupported numerical claims and does not prove prose accuracy.

## Optional official TypeSafe check

Only after a complete loaded NVIDIA-mode run, a separate **Check coverage with TypeSafe** click submits bounded counts, missing-family names, conflicts and judge-abstention state. It sends no company facts, role narrative or private portfolio context. One System One evaluation asks two typed Choice questions: coverage and next research check. Invalid/unavailable answers fail closed. Missing/unusable observations or absent side claims force needs-data; conflicts force inspect-disagreement. The result cannot override council gates or authorize allocation.

The fictional demo cannot enable this button. A successful response is reused until a new council review. Availability errors are shown without automatic retry. Reported input tokens are not a credit-balance or exact cost estimate. The user's approximately $5 credits remain unspent by these tests.

## Development configuration and production guards

No credentials, host permissions or runtime flags were configured by this change. Both JS and Python require `COUNCIL_DEV_ENABLED=true` and always reject `VERCEL`, `NODE_ENV=production` or `VERCEL_ENV=production`, even if opted in. Ordinary production builds omit the component. Existing deployment/live-check controls are unchanged; no new endpoint/function or runtime dependency was added.

A future separately authorized Cloud development smoke test needs an explicit loopback backend URL, private session/backend access tokens, securely configured development credentials and allowed provider hosts. Do not paste keys in chat or use production secrets.

- NVIDIA additionally requires `COUNCIL_LIVE_DEV_ENABLED=true`; reuse server-only `OPENAI_API_KEY`, exact `OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1` and `COUNCIL_MODEL` or existing `LLM_MODEL`. The selected candidate is `openai/gpt-oss-20b`, without `:free`. Current model availability, account entitlement, licensing and free-tier limits still need actual account/catalog evidence. No guarantee of free production use is made.
- TypeSafe additionally requires `COUNCIL_JEV_DEV_ENABLED=true`, existing JEV enablement/key configuration and exact `https://api.typesafe.ai` base. Its helper uses a ten-second client timeout. Tests inject typed fake answers; they do not prove live System One schema/quality or billing.
- The QA-only `qa/council_backend.py` injects fake NVIDIA-mode and JEV drivers to exercise the real loaded/typed branches. It is never an application/deployment entrypoint. A mocked `mode=nvidia` test receipt is not live provider evidence.

## Actual REA feature-mirroring investigation

Reviewed [TauricResearch/TradingAgents at pinned commit 9fa1196fffbcfd9de5146d2dd2869df84ab99838](https://github.com/TauricResearch/TradingAgents/tree/9fa1196fffbcfd9de5146d2dd2869df84ab99838), Apache-2.0. Six selected public sources: bull researcher, bear researcher, research manager, conditional graph logic, graph setup and structured-output helper.

Compiled inert hash-based Python bytecode without importing/running the reference. **Actual isolated REA 6.8.0 `inspect-python-pyc --detail summary --format json` succeeded for all six**, retaining 34 code-object records. Source/pyc hashes and evidence IDs are in [the manifest](../../aitracker-upload/data/research/council-reference-review.json). Full public-source/REA artifacts are retained outside Git at `/workspace/references/council-review` and `/workspace/artifacts/council-rea-review`.

Manual source review identified bounded debate and a separate research manager as useful concepts. This original implementation adds isolated openings, direct citation inspection, strict output contracts and deterministic abstention. It does not copy trader plans, buy/sell outputs or free-text fallbacks. No reference source is copied into the product.

REA reads marshal/code-object metadata and retains bytecode lengths/hashes; it does not decompile, disassemble, recover source, execute the reference or establish semantic graphs, runtime/visual parity, financial correctness or performance. Financial behavior conclusions come from the selected manual source review, not bytecode metadata alone. REA remains an investigation tool outside the app runtime.

## Verification and remaining acceptance

- 44 new offline Python cases: actual orchestration, independent openings, judge context, direct inspection, unsupported/duplicate citations, quality/conflict gates, strict JSON, clock rollback/late results, mocked NVIDIA fixed-host/one-attempt/redaction/budget limits, typed JEV overrides and actual authenticated FastAPI endpoint/concurrency/production guards.
- 17 new Node/TS cases: actual Python wire fixture, DTO minimization and unknown preservation, private handler/proxy auth/limits/redaction/correlation and production guards. All 890 Node tests pass.
- Four browser scenarios through the actual Vite middleware → JS handler → loopback Python core. Keyboard activation, double-click suppression, zero mount calls, demo/loaded separation, explicit typed follow-up, zero moves, missing provenance, session limits, 360/768/1440 layouts and absent normal-production UI. Fictional screenshots retained at `/tmp/aiw-council/portfolio-council-{360,768,1440}.png`.
- Broader offline Python agent/API/evaluation/safety checks pass; the existing mocked LLM transport test is run separately with `EVAL_STUB=false` because its provider is already replaced by a fake client. No real provider is called by either invocation.
- TypeScript, production build, security scan, migration-manifest integrity and whitespace checks pass. Existing large-bundle and broader accessibility/cross-browser review remain open.

Next: fill authentic financial/catalyst/risk provenance, build independently labelled council cases against a deterministic baseline, then conduct an explicitly approved small development model test with actual usage/latency/failure receipts. Independent matured outcomes are required before any predictive-usefulness claim; council outputs do not enter the forecast archive yet. Cross-worker/account-wide budgets and evidence-backed checkpoints remain pending. No production rollout, schedule, message or hosted database work is included.
