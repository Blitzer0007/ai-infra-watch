# Release 2 — read-only alert inbox and focused Portfolio Intelligence

Branch: `feature/release2-opportunity-research`. Stacked draft PR #168 still targets the Release 1 feature branch. No merge or deployment is included.

## Portfolio problem and resulting behavior

Portfolio navigation previously appeared below the Command Center, the holdings editor, common risk dashboards and seven metrics. Overview also repeated holdings, charts and advanced evidence from other tabs, especially when Detailed was selected. Several unrelated provider histories loaded before the user chose a task.

The new structure is one workspace at a time:

| Workspace | Main task |
| --- | --- |
| Daily Review | Existing Command Center and prioritized queue, with links to the next task. Simple/Detailed controls explanation depth, not a second set of workspaces. |
| My Holdings | Search/filter/select a position, open its chart, explicitly open management or deeper company/valuation/analyst detail. |
| Performance | Existing cash flows, risk pressure, portfolio metrics, benchmarks, historical charts and portfolio peer comparison. |
| Evidence | Existing coverage, decision context, decision-gate summary, scorecard, signal fusion and event evidence. |
| Research tools | Watchlist universe, Events, Money Flow, Connections and Portfolio Research remain available through the section selector and secondary desktop menu. |

A compact section selector stays reachable while scrolling on phone, tablet and desktop. Desktop shortcuts show the four primary tasks. Section changes focus the section heading and support browser Back/Forward. Existing `portfolio_tab`, holding, search and group deep-link keys remain supported. The selected holding is available directly in the detail workspaces.

Position/purchase management is only mounted after visiting My Holdings, then retained (hidden outside that workspace) so switching sections does not discard an unsaved editor draft. Management and advanced research start in disclosures, keeping the main holdings list readable. Quote-currency and totals-currency distinctions remain explicit.

Historical/analyst/peer requests are now deferred to the workspaces that use them. Daily Review still loads holdings/transactions and uses the original live-price/accounting decision adapter. It does not request chart history, analyst data or an unused FX rate. Existing caches and calculations are reused; no accounting, risk, classification, benchmark or allocation formula was changed. No valuation is fabricated when FX or quote data is missing.

## Inbox story and source boundaries

Open `/alerts` → inspect a snapshot of this browser's retained detection history → optionally request the server ledger → inspect delivery evidence → optionally acknowledge a record locally.

- Browser history uses the existing alert-event storage key through a data-only contract module. The adapter never imports a sender. Existing alert generation and notification opt-ins are unchanged.
- A browser detection has **unknown delivery**. Embedded/forged delivery-state, provider-ID or episode fields in localStorage cannot turn it into Telegram acceptance. No rule/episode link is guessed from symbol or time.
- Server coverage is intentionally limited to the existing configured recipient's `reentry_telegram_deliveries` table. Other alert classes are not covered. Server records are shown alongside browser detections, never merged with them based on date/symbol proximity.
- The ledger has no original trigger/message body or rule-evidence snapshot. The UI says these are unavailable rather than reconstructing a reason from today's settings.
- Scheduler monitoring remains in the existing Data Health view, reached through an explicit navigation action. The inbox does not claim healthy scheduling from an empty ledger.

Server history loads only when the user chooses **Load server delivery history** or a next page. There is no mounting fetch, polling, retry, scan, claim, send, resend, scheduler-enable or delivery-state-edit action. Window changes clear prior server pages and cancel/ignore stale requests. Search, filters, evidence disclosures and local acknowledgement make no server write.

## Endpoint, authorization and privacy

`GET /api/alert-inbox` is routed through the existing consolidated market handler; it adds no Vercel function or deployment trigger. All other methods are rejected. The existing private-access guard runs before configuration or data access. This preserves the application's current single-operator private-token model; it does not introduce multi-user authentication.

The server service performs one explicit-column GET/SELECT, always filtered by the server-configured Telegram recipient, within a 1–30-day first-recorded window (default 7 days). Client recipient/destination, refresh, scan or notify parameters are rejected. Missing configuration fails unavailable, with no unscoped fallback.

The response omits destination/chat IDs, service keys, auth headers, raw provider/database errors, message bodies, watchlist thesis text and original delivery keys. Record/episode references are HMAC-derived. Incoming local text omits links and obvious authorization strings; private raw response objects are never copied into UI DTOs. Errors returned to the browser are fixed, redacted messages.

This is a SELECT-only code change. No RLS, grants, migrations, tables, schedules, recipient settings, production variables or Supabase project resources were changed or queried during development.

### Pagination and resource contract

- At most 100 records per page, using a 101-row lookahead, six-second fetch timeout and descending `(created_at, id)` keyset order.
- Signed continuation cursors bind the recipient scope, selected day window, original listing cutoff, timestamp and row boundary; they expire after 30 minutes. Tampered, cross-recipient or changed-window cursors fail before a request.
- Cursor boundaries preserve PostgreSQL microseconds. Display timestamps may be normalized to milliseconds, but pagination never truncates the database boundary.
- Window bounds select record creation time; mutable delivery status is observed at read time. This is not a historical point-in-time outcome archive.
- At most 1,000 server records are retained by the current view. Browser detections use the existing 100-record retention bound, with partial/unavailable states for corrupt/conflicting/invalid history.
- Local read markers use a separate key and retain the latest 300 references; they never update browser alert history or server reconciliation. Storage failure leaves a temporary in-memory acknowledgement with an explicit message.
- No runtime dependency was added. Response/time limits do not establish an efficient hosted query plan: the committed schema does not establish a recipient/time composite index. An approved pre-release query-plan/index review is still required before enabling this reader against a large live ledger. No index was created here.

## Delivery meanings

| Evidence | Inbox result |
| --- | --- |
| Browser detection alone | Delivery unknown; no attempt or receipt inferred |
| Accepted ledger state with valid positive message ID | Provider accepted; never a person-read receipt |
| Accepted state without a usable message ID | Uncertain, requiring reconciliation |
| Uncertain state with a known accepted message ID | Provider accepted, with incomplete reconciliation; never auto-resend |
| Rejected state without a message ID | Rejected; no retry action |
| Sending state without a message ID | Pending; no automatic reclaim |
| Rejected/sending state contradicting a message ID, or unknown state | Delivery unknown, reconciliation required; a reference alone is not promoted to acceptance |
| Empty scoped query | No records in that queried window, with partial source coverage |
| Failed/malformed/unauthorized read | Unavailable, never a healthy empty ledger |

## Verification and release limits

Development uses Cloud Chromium, fictional storage/HTTP fixtures, and injected database-read responses. No production endpoint, secret value, Telegram message or hosted database mutation was used. Tests exercise the UI → mocked GET → normalized DTO → explanation flow and the real server reader's authorization/query/redaction/pagination contract separately. A real hosted read and query plan have not been verified and require a separately authorized release check.

Codex Cloud checks passed: 420 unit tests and 116 mocked browser/workflow cases. The refreshed all-route inventory covers 17 application routes at three widths (51 inventories), with no unnamed visible controls, page-wide overflow or uncaught page errors. Targeted heading/navigation checks are rerun after the final portfolio naming refinement.

Required checks: TypeScript; all deterministic unit/financial tests; mocked browser and workflow-safety suites; source security audit; local migration-manifest integrity; production build; whitespace; checks on the pushed head. The new tests cover local versus server delivery semantics, acknowledgement privacy, empty/unavailable data, pagination/cursor attacks and microsecond boundaries, all portfolio sections, Back navigation, selected holding, unsaved drafts, deferred requests, keyboard/touch and 360/768/1440px screenshots. Inbox is added as the seventeenth route in the all-page audit.

Review screenshots are fictional and outside Git; CI uploads the new inbox and focused-portfolio captures alongside the existing audit evidence. The existing large JavaScript bundle warning and broader cross-browser/screen-reader review remain open.

Notification-policy preview, further ledger classes, cross-device acknowledgement, financial enrichment and evaluation extensions remain pending. No production acceptance or sending-policy activation is implied. Rollback is a reviewed application-code revert; no database rollback or notification replay is required.

## Implementation references

- Existing ledger schema: `supabase/migrations/20261019160523_reentry_telegram_delivery_outbox_20261015.sql`.
- [Supabase Postgres roles and RLS boundary](https://supabase.com/docs/guides/database/postgres/roles).
- [Supabase select/filter/order/limit guidance](https://supabase.com/docs/guides/api/sql-to-api).
- [Supabase changelog](https://supabase.com/changelog), reviewed for relevant changes; no CLI or SDK upgrade was needed.
