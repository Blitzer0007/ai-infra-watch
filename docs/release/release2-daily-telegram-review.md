# Release 2 — daily Telegram decision brief

Scope: presentation and navigation for the existing daily portfolio digest. Development and tests run in Codex Cloud. This is draft application code; no message was sent, sender enabled, scheduler changed, production endpoint queried or hosted database modified.

## Result

Telegram receives a separate compact `telegramBrief`, retaining the existing detailed `text` for email/webhook/preview consumers. The brief is deterministic and uses the existing decision snapshot. It requires no LLM, JEV credit, new provider, dependency, table, endpoint or scheduled task.

Order: decision snapshot time → data warnings → review priorities → why and next check for each prompt → compact portfolio/risk context → next-seven-day earnings → evidence/journal counts. Internal ACT means **urgent review**, never an automatic trade instruction. Displayed reasons remain the existing rules' evidence; the formatter creates no buy/sell, holding-state, forecast or intrinsic-value classification. It has no prior snapshot and claims no day-over-day change detection.

The decision-center response adds versioned `actionSummary` counts over all ACT/WATCH prompts before its existing three-item response limit. Prompt selection, ordering, thresholds and existing response fields remain intact. The brief separates those full counts from the number shown. Legacy/inconsistent metadata explicitly means full totals unavailable. Missing rules, holdings, forecasts and queue fields never become verified zeroes or “all holdings have rules.” Unsupported prompts remain visible as a coverage warning.

Missing/partial/stale quotes, provisional/incomplete accounting, quantity mismatches and earnings failures appear before review prompts. Missing quote observation times are disclosed separately from decision snapshot generation time. Portfolio comparisons require compatible complete coverage/accounting; derived accounting remains provisional. Scenario stress requires finite, reconciling components and stays illustrative. Missing stress is unavailable, rather than a zero-risk estimate. Raw provider errors are omitted.

Provider-reported earnings dates are labelled as unverified confirmation. Missing calendar status is not a successful empty calendar. Malformed dates/days/symbols are excluded with an unavailable/unsupported state; an empty feed never guarantees no future event.

Text is capped at 3,600 UTF-16 code units, below Telegram's 4,096-character limit, with a retained review disclaimer and explicit omission notice when necessary. Input fields are bounded; control/bidirectional characters and multiline injection are normalized. Sending remains one message through the existing transport with unchanged timeout, acceptance-ID handling, recipient and schedules.

Review buttons now derive from displayed, validated symbols and open the existing holding dialog using `portfolio_detail`. The old button builder read a nonexistent `digest.decision.actionItems`, leaving symbol buttons absent; its “Journal” label also targeted Overview. The replacement provides accurate **Review SYMBOL**, **Open Daily Review** and **Open Watchlist** destinations. It adds no callback handler or sender route.

If the decision layer fails, Telegram gets a short unavailability warning with no review symbols. The verbose basic fallback remains available to existing detailed consumers. If the compact payload itself is absent/oversized, the Telegram payload builder fails closed to the same warning rather than sending an unbounded analytics report.

## Verification

Seventeen new checks cover complete/legacy/inconsistent queue counts, priority, missing/partial/stale data, accounting and quantities, scenario reconciliation, calendar failures, missing fields, malformed prompts, Unicode/length bounds, disclaimer retention, links and fallback behavior. Three of those exercise the existing handler in a child process with fictional credentials and fully intercepted transports: authenticated GET preview (zero writes), mocked Telegram POST/accepted message ID, and failed decision-layer preview. Unknown fetch URLs/methods throw; no external request is made. Non-scheduled return-alert evaluation remains disabled.

Local validation: 480 unit tests, TypeScript, production build, source security audit, local 32-file migration-manifest verification and whitespace checks passed. Exact-head CI results are recorded in draft PR #168. Existing bundle-size warnings remain. No production/mobile Telegram client rendering or actual delivery is claimed.

Fictional text preview: `/workspace/artifacts/daily-decision-brief-fictional.txt` (1,174 code units before the fixture label). No real portfolio, destination, credential or message ID appears in that artifact.

Rollback is an application-code revert. No message replay, database rollback or scheduler change is required. Deployment/activation remains a separate release decision.
