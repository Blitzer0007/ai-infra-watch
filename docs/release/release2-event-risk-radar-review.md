# Event Risk Radar — offline implementation review

14 November 2026 · Codex Cloud · `feature/release2-opportunity-research` · draft #168 on draft #167.

## Delivered scope

Implements the initial offline handoff from [the user specification](release2-event-risk-radar-aravind.md), after reading the [remaining-work register](release2-remaining-work.md). The branch was clean at `9d7f2ed`; remote docs-only commits `2103e7b` and `ef3282c` were inspected and fast-forwarded before editing. Existing rule, forecast and council work is preserved. PR #167 remained at `4c008237`; #168 was at `ef3282c` at this baseline. Both were open drafts. No rebase, merge commit, PR merge or production action was performed.

| Package | Initial offline status | Boundary |
| --- | --- | --- |
| RADAR-0 baseline | Complete; existing safety blockers retained | Current heads and financial/alert paths reviewed below |
| RADAR-1 contracts / fixtures | Complete for fictional replay | Explicit clocks, exact issuer scope, claim-specific groups, synthetic reference checks, copy lineage, priority profile |
| RADAR-2 presentation | Complete for offline prototype | Portfolio Research tools → Event Risk Radar; holding shortcut; manual load; keyboard/mobile source details |
| RADAR-3 replay | Initial deterministic harness complete | Seven invented cases, cutoff replay, separate labels, news/official/price-alert time baselines; no real-history evaluation |
| RADAR-4 provider proposal | Documented only | Prerequisites below; no provider integration added |
| RADAR-5 scheduling / delivery | Pending, separately authorized | No scheduler, sender, queue, database or alert-engine integration |

## Files and behavior

- `src/utils/eventRiskRadar.ts`: pure bounded **fictional-only** evaluation, not a live acquisition/admission API. Reuses strict calendar-instant validation. Non-fictional packets are rejected; inputs are not mutated and the cutoff is explicit. Caps: 200 observations, 100 selected symbols, 100 supplied sessions and 100 replay labels.
- `src/fixtures/eventRiskRadar.fictional.ts`: 15 invented observations / seven declared cases dated June 2024. NVDA/AMD are example issuer scopes, not actual company events or real statements by an account. References use `https://example.com/fictional/...`, not fabricated real X post URLs. No raw social content or personal profile data is retained.
- `src/components/portfolio/EventRiskRadar.tsx`: manual in-memory timeline. Loaded holdings provide symbol scope; NVDA is an explicitly labelled reference demo when not held. Unsupported holdings get no fictional scenario and no inference of real coverage. Symbol/cutoff changes clear the loaded result. No mount effect, transport, timer, storage, notification or provider/model import.
- `PortfolioNavigation.tsx` / `PortfolioIntelligence.tsx`: Research tool and holding shortcut. Radar does not mount the existing SEC event-study component. The surrounding app retains existing reads, intercepted in tests; the isolated panel has zero requests.
- `src/utils/eventRiskRadar.test.ts` / `qa/test_event_risk_radar.py`: deterministic tests, isolated real-Chromium execution and intercepted full-app checks. The existing offline QA workflow includes the new browser checks/screenshots.

`X · @aravind · third-party/unverified` has high discovery priority and **no factual-confidence boost**. Real account identity remains unknown. Original publication, reporting, first observation, retrieval and fictional reference-check times remain separate. Observation is never backfilled to publication; future rows cannot enter an earlier replay. A syntactically valid public original-post URL can be checked manually without fetching or retaining its content.

Synthetic receipts must bind reference, issuer, publisher and check time. This validates **fictional reference integrity**, not real source authenticity. Missing receipts, deleted/missing posts and uncertain times retain limits. Only primary references for the **same proposition** promote a fictional event: a board change does not confirm its alleged cause. Denials/retractions retain history. Copies never add independent corroboration. Distinct original reporting and distinct newsrooms are required separately from evidence-row counts.

Price impact is always withheld: no quote/adjustment/return adapter is connected. Session alignment uses only the supplied known fictional calendar, without guessing holidays or an immediate close. Every event has false decision and source-authenticity authority. No decision state, portfolio weight, council input or BUY/SELL signal changes.

## Financial Trust & Alert Safety baseline

Follow-up: [browser quote-alert admission](release2-browser-quote-alert-admission.md) now addresses the browser detection part of the first concern with offline evidence. The table records the original Radar baseline; server alert paths and the remaining concerns still require review/fixes before live acceptance.

Source inspection only. These existing paths are **not repaired or activated** by this increment.

| Concern | Current evidence | Required before related live activation |
| --- | --- | --- |
| Stale/simulated quote alerts | `alertEngine.ts:evaluateQuoteAlerts` accepts finite price/change without freshness/simulation admission. `App.tsx` filters finite scalars before calling it and may relay events. Development/QA Telegram guard remains. | Shared strict quote admission for every alert consumer; independently test sender boundaries. Radar imports none of this. |
| False zero P&L | `portfolioPositions.ts:buildPositionAnalyses` retains numeric zero P&L / return when valuation is unavailable. Some displays hide this, but the DTO carries zero. | Preserve unavailability through all consumers and rendering/calculations. Strict Command Center cards do not resolve every old path. |
| Cost substituted for value / weight | `PortfolioIntelligence.tsx` retains `currentValue ?? investedValue` in raw weight, sorting and some holding displays. | Separate supported valuation from cost and coverage before current-value/weight claims. |
| Inconsistent valuation gates | `decisionEligibility.ts` has strict identity/currency/session/source gates; older position/peer paths use narrower finite/stale checks. | Complete consumer parity/missing-input acceptance. This source review is not complete financial-formula certification. |
| Header-derived proxy origin | `api/agent-ask.js:backendUrl` falls back to host / forwarded-proto headers; the handler can attach a backend token. `api/live-data.js` also builds a Congress-proxy origin from headers. | Restrict fixed destinations and verify credential forwarding before exposing related routes. No endpoint or credential was accessed. |

These unresolved concerns block live/production acceptance. No production URL, `.env` file, credential or hosted Supabase API was opened. Existing decision-center GET handling can persist rule state and was not used as a read-only probe.

## Replay interpretation

At `2024-06-12T21:00:00Z`: seven declared developer-authored cases, five scorable; one early lead, two false leads, one missed event and one post-event comment. Two cases remain unscorable. This is not exhaustive real coverage or an estimate of real-account accuracy.

The fictional export-policy lead precedes original independent news by 60 minutes and a separately supplied fictional price-alert observation by 120 minutes. No official baseline exists for it. The late comment is 30 minutes after its fictional official baseline. Copies are excluded from news baselines. Metrics use observation/check availability, not backdated publication. Classification separately checks original announcement chronology: delayed official collection cannot turn commentary published after an announcement into a pre-event warning. Outcomes enter only scoring after window/label availability, and cannot alter discovery. Missing identity, deleted/uncertain sources and unknown outcomes withhold scoring/lead-time metrics.

Verdict: **Insufficient historical evidence to measure predictive accuracy.** Real study requires original public IDs, authenticated mapping, independently supported pre-event captures and a defensible sampling frame including false/missing/deleted/no-event cases. Compare matched official/news/price-alert baselines, avoid outcome-selected examples and use supported adjusted prices/session calendars. A supplied timestamp/hash proves neither historical availability nor causal influence.

## Future acquisition proposal — not enabled

Reviewed existing source paths: `server/api/company-scale.js` (`PROJECT_SOURCE_PROFILES`, direct recent X search, web discovery), `api/live-data.js` (GDELT/RSS/news fallbacks), `API_KEYS.md` optional X configuration. Existing project/construction queries are not a complete governance/controversy collector. No REA install, runtime agent or model is required for this deterministic stage.

Before Phase 2, separately authorize/review:

1. **Permissions:** licensed public X recent-search access, account-ID/handle verification, original IDs, edit/deletion/retention terms, pagination and actual historical-window limits. No login scraping, gate bypass, private messages or sensitive personal inference. Confirm news/issuer/SEC permissions and attribution separately. Indexing or an official-looking domain does not authenticate a publisher.
2. **Development isolation:** securely configured server-only development credentials, explicit outbound-host allowlists and fixed backend origins. No browser secrets, production credentials, hosted writes or scheduler changes. Design a distinct authenticated adapter; live data must not enter the fictional-only builder.
3. **Manual limits proposal:** five symbols; one priority-account query plus one portfolio-topic query per manual run; at most two pages per query / 100 metadata rows total; one concurrent request; ten-second timeout and 256 KiB decoded-body cap. At most one permitted transient retry within the run cap; stop on 429 / honor Retry-After. These are proposed safety caps, **not vendor entitlements**; actual limits and account-wide retry/fallback coordination require review.
4. **Cache/coverage:** proposed 15-minute in-memory provider/query/account/symbol cache, no background refresh. Preserve first observation on cache hits. Report query window, pagination/caps, cache age, rate limits, authorization and retrieval failures. Distinguish `not-configured`, `rate-limited`, `partial`, `unavailable`. Even a successful empty query is scoped, never an all-clear. Agree on licensing-compliant retention/deletion before persistence.
5. **Source/event admission:** verified issuer aliases/disambiguation, original reporting lineage, independence, time precision, contradiction/retraction and claim-specific primary confirmation. Related-sector/policy leads remain exposure hypotheses until linked to issuers. Establish authentic provenance independently of metadata or model summaries.
6. **Acceptance:** measure permitted real quota/cost/latency/failures in development and independently label real-history cases against baselines. Free-plan suitability is not assumed. No NVIDIA/JEV model call is needed for this offline stage.

Phase 3 requires a further separate decision: cadence/recipient/policy, materiality and uncertainty thresholds, source-copy deduplication, cooldown, cancellation/retraction updates, uncertain-delivery receipts and mocked sender tests. Uncorroborated posts remain dashboard watch items. No scheduling or Telegram activation is included.

## Verification and resources

Validation passed: **1,037 Node tests** (30 new Radar cases), **seven Radar Chromium checks**, **25 CI-safety checks**, TypeScript, production build, security audit, local migration-manifest integrity (32 files), workflow YAML and whitespace checks. Commands: `npm run test:unit`, `npm run lint`, `npm run build`, `npm run security:audit`, `npm run migration:verify`, and the offline Chromium / CI-safety suites. Browser coverage includes 360/768/1440px overflow, labelled controls, keyboard/manual actions, source links, counter-evidence, early cutoff, selection reset, syntax-only URLs, holding navigation and zero panel request/write/send behavior. Exact-head GitHub CI remains a separate check.

React checklist: event-driven state; native labelled form/select/button/details controls; stable evidence keys; no effects/listeners, unsafe HTML or server imports; fixed cutoff and UTC presentation; no new dependencies. Wider accessibility/cross-browser acceptance remains open.

Zero new endpoints/functions/schema/cron/LLM calls. Replay is bounded in memory; fictional fixtures are bundled with the UI. Final main build asset: 1,742.05 kB minified / 483.62 kB gzip. The existing large-bundle warning remains. Screenshots are retained by the offline QA job. Added Radar scope is tracked separately; the older ~60% core engineering estimate is unchanged.

No merge, deployment, production modification, live polling, credential change or Telegram message was performed.
