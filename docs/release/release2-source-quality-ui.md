# Manual loaded-quote source review

Implemented 9 November 2026 in Codex Cloud on the Release 2 feature branch, following the [Source Quality Agent contract](release2-source-quality-agent.md). This increment connects that deterministic role to a manual **development/QA-only** panel in Opportunities. It does not activate a production research service.

## User flow and coverage

Choose **Scan loaded snapshot**, open **Inspect loaded quote metadata · development review**, select one symbol and explicitly run its review. The browser freezes a minimized copy of the quotes at scan time. Refreshing the market feed cannot mutate the captured packet. A new scan produces a new identity even within the same millisecond. Holdings quantities, costs, notes, theses, URLs and credentials are excluded.

The adapter preserves provider-returned identity separately from the requested symbol. Yahoo and Alpha retain only their actual response identity; Finnhub's quote response has none and stays unknown. A requested symbol, capture/retrieval time or `asOf` never fills absent returned identity or observation time. Date-only precision and currency case such as `GBp` survive. Source mode must be explicitly declared; QA/simulated/fixture evidence remains simulated. Missing mode, basis, currency, session and timestamps stay unknown. Malformed/conflicting loaded fields or excessive observations are withheld with a fixed explanation rather than silently repaired or truncated.

The UI reviews one selected symbol at a time; the Python contract still supports five. It accepts already-loaded independent observations but fetches no corroborating source. The current quote pipeline usually supplies one provider, so an honest result can report covered metadata and **no distinct-provider comparison**. Declared provider labels do not prove independence, issuer identity or data truth.

Results show supplied/inspected/metadata-covered counts, gaps, pending work, compatible price discrepancies, assessment time, the fixed diagnostic policy and tool/provider/model/JEV usage. Metadata coverage never grants decision eligibility or changes existing research/holding decisions. The 15-minute diagnostic age policy is not an exchange calendar or a substitute for a separate latest-close policy.

## Request and trust boundaries

- No mount request, polling, automatic retries, provider refresh, scheduler, storage write or model/JEV invocation. Five manual attempts per mounted visit persist across scans; successful results are reused only for the same frozen snapshot/symbol. This UI limit is not an account quota.
- Event-time guards reject duplicate clicks. Abort and identity checks prevent interrupted or late responses being applied after a symbol/snapshot change or unmount. Browser timeout is ten seconds; the relay timeout is eight seconds.
- The existing authenticated `/api/agent-ask?task=source-quality` function handles the request. The actual Vite development middleware exposes this same handler locally, including Express middleware-mode development. No test-only gateway or new Vercel function is required.
- The relay authenticates before forwarding, retains its existing process-local rate limiter, accepts minimized primitive fields and at most 65,536 JSON bytes, and requires an explicitly configured HTTP loopback `AI_INFRA_AGENT_URL`. It never derives this task's backend from an incoming Host header. Redirects are rejected.
- Backend authorization uses the existing server token precedence, separately from browser access. Development requires configured private backend authentication. Use securely configured development credentials and the existing private browser session; no production environment pull is needed. Both Node and Python require `SOURCE_QUALITY_DEV_ENABLED=true`. Any `VERCEL` setting or a production Node/Vercel environment disables the role even if the flag is set. The UI is included only in DEV/QA builds and is absent from a normal production build.
- Python dispatches this task to the real `SourceQualityAgent`, with streamed byte limits, strict duplicate/extra-field validation and the fixed default v1 policy. Client policy overrides are denied. The existing typed general-question endpoint and OpenAPI request schema are preserved. The general planner/model stack is lazily imported and is not initialized by this path.
- Responses are no-store and bounded to 262,144 bytes in the streaming relay. The browser checks run identity, universe, coverage, finding/trace scope, fixed policy and zero provider/model/JEV usage; malformed, widened or authority-changing responses are rejected. Fixed errors do not echo raw input or upstream response bodies.

The existing general agent route and CLI custom-policy interface are separate. This role has only its two local inspection/comparison tools; it cannot discover or invoke providers, hosted databases, financial rule updates, messages or deployments.

## Implementation map

| Boundary | Files |
| --- | --- |
| Quote provenance | `server/services/quoteNormalization.js`, `src/utils/quoteSourceMetadata.ts`, `src/utils.ts`, `src/App.tsx` |
| Frozen adapter and response contract | `src/utils/sourceQualityReview.ts` |
| Manual interaction | `src/components/opportunities/SourceQualityReview.tsx`, `OpportunityScanner.tsx` |
| Development transport | `server/developmentSourceQuality.js`, `vite.config.ts` |
| Private relay and minimization | `api/agent-ask.js`, `server/services/sourceQualityInput.js` |
| Actual Python endpoint | `api/agent-python.py` |
| Cross-language fictional fixtures | `aitracker-upload/data/research/source-quality-ui-cases.json` |
| Browser verification | `qa/test_source_quality_ui.py`, `qa/source_quality_backend.py` |

The direct Finnhub timestamp adapter also rejects boolean/string/nonfinite epochs rather than coercing them into observation instants. No financial price/movement formula or existing decision threshold changes.

## Verification

Local Cloud checks: 585 Node tests, nine browser scenarios, TypeScript/production build, source security audit, migration-manifest integrity and 25 offline workflow-safety cases passed. The targeted real Python API selection passed 17 cases, including preserved legacy schema, auth, production-disable, private/policy/size rejection, Python/JavaScript fixture parity and absence of general model-stack imports. The final broad Python regression result and exact-head CI links are recorded in draft PR #168.

The browser story runs a real loopback Vite server, the actual JS middleware/relay and a real authenticated Python API/core. The general agent/tool discovery is replaced with a forbidden-call assertion; financial inputs and access tokens are fictional. Failure, altered-response and late-response cases deliberately intercept the relevant response. Coverage includes explicit activation, frozen inputs, five-attempt cap across scans, deduplication, rescan invalidation, wrong/late identity isolation, price conflict explanations, keyboard/mobile layout and the absent production panel. No live service is contacted by these cases.

Screenshots at 360/768/1440 pixels were inspected. Local Playwright used preinstalled `/usr/bin/chromium` because its expected bundled headless executable was absent; CI installs its matching browser. An intermediate run was interrupted by development hot reload during file edits, then rerun with the repository stable; all nine cases passed through the actual application transport. The existing large JavaScript bundle warning remains open. Broader cross-browser and screen-reader acceptance remains release-candidate work.

CI adds the real API test to offline agents and the browser story to the existing mocked UI job. That job installs existing Python function requirements plus QA-only uvicorn. No application dependency, deployment trigger or live-check opt-in changes. Hosted database and live production API/UI/model jobs remain separately gated.

## Next work and rollback

Carry source/coverage eligibility into remaining consumers, bound shared SEC/provider use, and establish financial period/currency/adjustment provenance before expanding the sectioned company dossier. Independent source packets and model effectiveness/resource acceptance remain open. REA remains for reference feature analysis, outside the application runtime; no REA execution or installation was needed for this integration.

Rollback is a reviewed code/test/workflow revert; the feature flag is disabled by default. No database, account configuration or message rollback is required. This increment includes no live provider/model call, secret access, hosted query/change, real notification, merge or deployment. Release 2 remains approximately 55% engineering complete; production rollout has not started.
