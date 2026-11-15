# Release 2 — catalyst calendar increment

Branch: `feature/release2-opportunity-research`, stacked draft PR #168 against Release 1. The prior scanner and UI/UX commits are preserved. This increment implements the snapshot-backed calendar portion of R2.2; live financial enrichment and the rest of R2.2 remain pending.

## User story and data flow

Open Calendar → see unavailable until a feed has been loaded → explicitly open the existing Watchlist earnings feed → return to Calendar → review dates, certainty, source metadata and supplied revisions in 30/90/180-day views.

The existing Watchlist `EarningsAlerts` GET response is passed through a pure adapter into App memory. Calendar receives that snapshot by props. It introduces no endpoint, credential, cache service, provider, request, timer, notification sender, scheduler, or database change. Watchlist retains its existing GET, history loading, refresh interval and opt-in notification behavior. The new navigation button explicitly opens that existing screen; it is not a calendar refresh or new notification action.

Only the small normalized event DTO enters calendar state. Source and event timestamps remain separate from client receipt time. No authentication headers, chat IDs, raw errors, notification configuration or complete provider body is copied into the snapshot. Only the existing timezone preference is stored locally; event/filter data is not persisted in localStorage or URLs. Reloading loses the snapshot and returns to the unavailable state.

## Normalization and display contract

- Current earnings rows lack issuer confirmation/source publication evidence. They are **estimated**, even if an upstream date looks precise or has an `amc`/`bmo` code. No midnight or exact earnings time is inferred.
- The normalized contract supports `confirmed`, `estimated`, and `cancelled`. A confirmed row needs an explicitly supplied issuer/regulator confirmation basis, a public HTTPS event URL, publication time and an ordered retrieval time no later than receipt. This checks supplied metadata; it does not independently authenticate an issuer statement. The current server earnings handler is unchanged and does not supply this new confirmation contract. Confirmed/corrected/cancelled examples in tests are fictional.
- HTTPS URLs containing credentials, query strings or fragments are withheld. Some legitimate query-based source URLs will therefore remain unavailable pending a reviewed allowlist/normalizer. No source URL is fabricated from a provider's API documentation.
- A date-only string must be a real `YYYY-MM-DD` and retains its source calendar day in every review timezone. Exact timestamps require a valid explicit UTC offset, are displayed in the selected review timezone, and preserve the supplied source timezone separately. Invalid dates/naive timestamps are rejected.
- Ranges contain today plus the next N−1 calendar days in the selected timezone. DST does not change their number of days. Past exact instants are excluded; date-only entries are not assigned a time. Within one displayed day, date-only rows precede timed rows for presentation only, then exact instants are ordered chronologically and ties use stable source/ID keys.
- Requested 30/90/180-day views are separate from the feed's own requested lookahead. **Source-confirmed coverage always remains unknown** in this increment. An empty success is not complete coverage; a failed/malformed/oversized response is unavailable. An estimate or incomplete source metadata makes the snapshot partial. Snapshots older than 24 hours show a warning when the view renders; no timer refreshes data.
- Simulation markers on a feed or row are never treated as real confirmation evidence. Simulated/invalidly marked rows are withheld; if no usable records remain, the snapshot is unavailable rather than a healthy empty success.
- Event IDs are scoped by source. Exact duplicates deduplicate; contradictory versions of the same ID are all withheld, with rejected-row counts. Invalid symbols/dates/IDs are withheld. More than 500 input rows withholds the whole snapshot, avoiding truncation that could discard a later correction.
- Revisions require an explicit `supersedesId`, same source/symbol/kind, a later publication time, source link, and retrieval metadata. An unverified correction cannot replace a confirmed entry. No symbol/date proximity matching is performed. Competing corrections do not silently select a winner; unresolved versions remain visible with warnings. Strictly increasing publication timestamps prevent verified cycles.
- Confirmed cancellation records can replace the prior event; cancelled items remain visible as context, never as confirmed upcoming catalysts. Superseded records remain in evidence/history disclosures even when the replacement moves outside the selected date range. Only versions explicitly supplied together in the loaded snapshot can be linked; the legacy feed does not supply stable correction chains, and none are invented across refreshes.

## Verification

The feature's complete development flow uses intercepted fictional earnings responses in Cloud Chromium. No live service is contacted.

| Boundary | Evidence |
| --- | --- |
| Calendar route/navigation | Direct route, sidebar, universal-search entry; direct access stays unavailable and makes no earnings request |
| Existing feed → snapshot | Explicit Watchlist navigation loads its existing mocked GET; normalized rows survive return navigation |
| Snapshot → UI | Legacy estimates, confirmed fixture rows, cancellations, revision history, unknown coverage, failed/empty states and stale receipt warning |
| Controls | Date range, certainty, query, timezone persistence shared with Command Center, keyboard disclosures, zero request/write assertions |
| Resource/privacy | 500-row limit, conflicting-ID rejection, selected DTO fields, credential/query-bearing source URL rejection; no new dependency |
| Responsive/accessibility | Loaded cards/screenshots at 360/768/1440px; Calendar added to all-route heading/label/overflow/error inventory |

The deterministic unit suite covers date validity, offset requirements, DST ranges, receipt/publication ordering, deduplication, correction conflicts/chains/cycles, mixed-precision sorting, source URL/DTO redaction, invalid/oversized/simulated payloads and filters. Nine browser scenarios cover the full feature flow. Existing scanner, accounting/decision, timezone, navigation and workflow-safety regressions remain required.

Codex Cloud verification passed: 400 unit tests, 98 mocked browser/workflow checks, TypeScript, source security audit, local migration-manifest integrity, production build and whitespace checks. The final calendar interaction cases also passed after the confirmation-label, simulation-gate and mobile-filter refinements. The 16-route audit passed at 360/768/1440px (48 inventories), with no unnamed visible controls, page-wide overflow or browser errors. CI also runs `qa/test_catalyst_calendar.py` and uploads its fictional screenshots with the UI audit artifact. No real production acceptance check is authorized by this work.

## Review, remaining work and rollback

- A calendar does not establish investment merit or change holding/research classifications. No positive return inference is made from a catalyst date.
- Live issuer-confirmation/calendar ingestion, verified source coverage, financial enrichment, new alert policy, inbox queries and production integration remain separate work. No new provider access or notification activation is included.
- The existing JavaScript bundle size warning and cross-browser/screen-reader review remain open. No runtime dependency or third-party code was added.
- Revert this application's calendar commit to roll back. Existing earnings delivery, API handlers, ledger/history, schema and deployment controls are unchanged. No message replay or database rollback is needed.
