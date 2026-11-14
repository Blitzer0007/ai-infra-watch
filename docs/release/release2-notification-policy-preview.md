# Release 2 — fictional notification-policy preview

Status: preview implementation on `feature/release2-opportunity-research`, stacked draft PR #168. No notification activation or production access is included.

## User behavior

Open Alert Inbox, then expand **Explore notification policy · fictional preview**. Choose one of 18 fictional scenarios. Optionally propose a 1-hour or 24-hour cooldown or digest batching for informational/medium-priority reviews. Read the proposed disposition and expand the decision trace when needed. The tool is collapsed by default to keep the inbox focused on records.

The scenarios use FICT, a fixed 9 November 2026 15:00 UTC clock, fictional opaque references and assumed gate values. They do not consume inbox records, holdings, preferences, live configuration, quotes or actual recipient identifiers. No assumptions are copied back into settings. State exists only in component memory and resets on reload. There is no send, retry, activation, save or scheduling control, API endpoint, timer or persistence path.

The preview may propose immediate review or a digest item, suppress, defer, withhold a proposal, or require reconciliation. None of these outputs authorizes delivery or establishes investment suitability, provider acceptance or a read receipt. There is no digest time, recipient selection, confidence score or exactly-once claim.

## Pure contract

`previewNotificationPolicy` in `src/utils/notificationPolicyPreview.ts` accepts explicitly supplied event/context/ledger/proposal inputs and a clock. It returns a fixed version, `previewOnly: true`, `action: 'none'`, disposition, changed-condition state, safe episode reference, proposed channel, cooldown remaining, reconciliation flag and static explanation trace. Unknown/private input fields are not copied to output.

The proposed version is `reentry-policy-preview-v1`. It covers the existing qualifying review states: EXIT_REVIEW for a holding; WATCH_ENTRY, REENTRY_CANDIDATE and EVIDENCE_REVIEW_REQUIRED for a sold position. It does not calculate those signals, validate raw quotes, verify a market calendar, infer ownership or claim production parity. Upstream evidence eligibility, monitoring/opt-in, release approval, scheduled authorization, regular-session bounds and current-session quote validity must be supplied explicitly. Unknown values fail closed. A sold-position thesis must be explicitly valid.

| Input condition | Proposed result |
| --- | --- |
| Malformed input, missing scope/episode or mismatched scope/symbol/episode | Withheld; never infer correlation from symbol/date |
| Matching accepted claim with a positive safe message ID | Suppress duplicate; preserve incomplete reconciliation if present |
| Accepted without usable ID, pending/uncertain/unknown claim or conflicting ID/state | Reconciliation needed; never automatically retry |
| Existing rejected claim | Suppress this episode; no automatic retry or new key |
| No claim, but unavailable/stale/partial temporal coverage | Reconciliation needed; never interpret unavailable as empty |
| Ineligible/simulated/conflicting/future/stale evidence or incompatible ownership | Withheld |
| Disabled monitoring/opt-in/release approval, invalidated sold thesis or unchanged condition | Suppressed |
| Unknown previous condition/permission/session evidence | Withheld |
| No scheduled authorization, closed session, non-current-session quote, or remaining proposed cooldown | Deferred; retain condition/episode |
| All gates pass | Proposed immediate Telegram review; info/medium can instead be proposed for a digest when that draft option is selected |

Delivery proof reuses the inbox's pure `deliveryEvidence` helper. A matching accepted ID continues to prevent duplicates even when aggregate history coverage is incomplete. A rejected/pending/uncertain claim is never cleared by elapsed cooldown or digest preference.

For a no-claim proposal, the caller must assert complete scoped episode coverage and supply an `asOfMs` no more than one minute old, plus `coverageFromMs` covering the entire proposed cooldown interval. The evaluator checks those time bounds; it cannot establish the truth of a caller's coverage assertion. Known acceptance is evaluated before absence-based coverage gates. Additional proposed evidence freshness is five minutes; cooldown is bounded to seven days, defaults to zero, and never rotates an episode.

Episode and recipient-scope references are supplied opaque references; this tool does not generate a new production episode or include raw destinations. Polling the same input is deterministic. A genuinely new episode requires a separately reviewed transition rule and authoritative source. Do not construct one from the wall clock, poll count or a convenient new random key.

## Integration boundary and live behavior

The existing read-only inbox response has partial coverage and lacks original trigger/transition, ownership, opt-in and rule evidence. It is therefore deliberately **not** mapped into this evaluator. A future live adapter must prove recipient/entity/episode scope, full required coverage, evidence quality and authorization before use. Browser detections cannot supply delivery proof. Caller assertions and preview outputs are never trusted as sender authorization.

Existing `server/api/reentry-alerts.js`, its durable claim functions, release flags, market-session checks, schedules, recipients, state transitions and delivery-key construction are unchanged. The existing sender's key algorithm and this supplied-reference proposal contract remain distinct; this increment does not replace or silently strengthen that production algorithm.

Cooldown and digest choices are draft design options only. Any activation needs a separate reviewed delivery-policy change, authoritative adapter, scope/privacy review, concurrency and outbox tests, recipient/schedule approval and release decision. No Supabase query/migration, production configuration, provider call, Telegram message, deployment or new dependency is needed here.

## Verification

Codex Cloud validation passed: **451 unit tests and 122 mocked browser/workflow checks** (120 in the full browser/configured-safety run plus two weekly-review workflow checks). TypeScript, production build, source security audit, migration-manifest integrity and whitespace checks passed. The existing large JavaScript bundle warning remains.

Unit cases cover all 18 scenarios, immutable/deterministic evaluation, unknown/malformed inputs, disclosure redaction, stable references, scope mismatch, ownership/thesis restrictions, evidence freshness, no-claim temporal coverage, cooldown boundaries, digest priority and durable-claim reconciliation/duplicate protection. Module-boundary checks reject transport, storage, timer, runtime secret and server-handler dependencies.

Six browser cases cover all scenario outcomes, zero requests/storage changes while interacting, cooldown/digest gates, isolation from real inbox records, reload reset, keyboard disclosure controls, full trace and 360/768/1440px overflow/label checks. Fictional screenshots are stored outside Git and uploaded by existing offline CI. The full Release 2 browser/workflow regression and deterministic financial/unit suite remain required.

Exact-head CI results are recorded in draft PR #168. The previous head's Supabase CLI download HTTP 504 is an existing external setup failure; do not bypass that check or run live database jobs to compensate.

Rollback is an application-code revert; there is no database rollback, saved policy state or notification replay. Financial/provider enrichment and offline evaluation/journal extensions remain pending.
