# Manual SEC dossier connection — 22 November 2026

Follow-up: [the Opportunities financial-input review](OPPORTUNITIES-FINANCIAL-REVIEW.md) reuses this explicit SEC connection and shares its browser loader with the dossier. It adds a bounded evidence table, without changing research eligibility or the controls below.

This increment connects the existing company dossier to an explicit, authenticated SEC read action. Previously the holding/research wrapper always passed `request={null}`. The connection is part of draft PR #188; it is not a deployment or a live-source health certification.

## User flow

Open a company dossier, then choose **Load SEC financial declarations**. Opening the page or disclosure fetches no new financial documents. The action sends one authenticated GET to `company-scale?action=dossier&symbol=...`. It reads the official SEC ticker directory, issuer submissions and companyfacts, then renders supported declarations in Growth, Financial health, Valuation inputs and Sources. No model, private account record, database write, alert dispatch or background polling is involved.

The UI allows three explicit attempts per mounted view, retains a successful packet until leaving that company, cancels browser acquisition on scope change/unmount and never automatically retries. A successful packet does not refresh automatically. Switching issuer clears its visible source state. Private-access failures, source limits, unsupported responses and rate limits have bounded explanations; arbitrary upstream text is not displayed.

## Identity and financial boundaries

- Require exactly one exact ticker declaration in the SEC directory; its CIK must match issuer submissions and companyfacts. Submissions must declare the requested ticker exactly once. This is consistency between loaded declarations, not independent publisher/security-class authentication. Asset classification remains unknown.
- Server construction and browser admission share the same pure connector. Supplied figures are passed to the existing raw-source/receipt validators. Original rows, units and conflicting/newer records are retained for recognized concepts; no malformed row is removed to resurrect an older success.
- Up to two latest annual operating periods, one latest annual share/EPS period and two latest instant dates are selected from recognized declarations. Each observation keeps its own date/units/form/vintage; missing metrics remain missing. The annual UI still requires explicit period selection. This bounded selection is not a complete statement history.
- Existing date-only filing publication windows, amendment/vintage conflict handling, precision, form, period and unit requirements remain intact. Unsupported foreign-filer forms, issuer-specific extensions, context, full debt scope and share/price compatibility remain gaps.
- No business profile, growth forecast, EBITDA, valuation multiple, verified equity classification, portfolio accounting authority or trading eligibility is invented. Opportunities eligibility is unchanged; this increment connects the dossier only.
- Acquisition timestamps describe completion of the source bundle, not exact filing publication or quote time. The cache returns the original packet/times and does not relabel it freshly retrieved.

## Runtime controls

`server/api/company-dossier.js` requires existing private access before any source request, accepts GET only and returns `Cache-Control: private, no-store`. It is routed through the existing company-scale dispatcher without adding a public credential-bearing quote path.

The loader requires a configured `EDGAR_USER_AGENT` containing contact email; it uses no invented fallback contact. Values are never returned. Requests target three fixed SEC URLs, prohibit redirects, use six-second timeouts and stream limits of 16 MB per upstream document. Only recognized concept units/rows and minimal directory/submissions identity declarations are returned, with a 3 MB packet limit. Existing 500-row/concept and 2,000-total-row bounds apply to retained financial concepts.

One acquisition runs at a time per server process; same-symbol overlap shares that promise. At most six upstream attempts per minute are allowed per process. Successful packets cache for one hour, with at most 20 entries. These controls are process-local, not a distributed/account-wide SEC budget. A horizontally scaled deployment still needs shared quota coordination before broad acquisition/automation.

## Offline verification

- Fictional directory, submissions and companyfacts fixtures only; no real issuer data or account rows.
- Connector tests bind the real dossier consumer, preserve negative net income, withhold conflicting/newer or not-yet-available filing values, reject mismatched/duplicate issuer declarations, simulated/oversized sources and forged envelopes, and keep all eligibility flags false.
- Service tests exercise fixed URLs, missing contact, size/transport/rate-limit failures, no automatic retry, sequential issuer checks, concurrency/deduplication, cache isolation and original timestamps. The real company-scale dispatcher rejects anonymous/non-GET requests before acquisition.
- Browser cases cover mobile dark and desktop light, explicit single authenticated read, loaded declarations, unchanged valuation withholding, no opening/reopening fetch, per-view attempts, issuer changes and bounded failures.
- Local full suite: 1,144 Node tests passed; TypeScript and security scan passed. The dossier/navigation and related Milestone 3/4 suites passed 31 cases; all eight manual-connection cases then passed including the added attempt-limit case. Production-mode no-passive-persistence plus existing offline safety/deployment checks passed 34 cases. Final exact-head CI must be recorded in the PR and Cloud evidence; the previous bb9b96b checks are historical for this new increment.

## Before future live use

Review the draft and complete exact-head CI first. A separately authorized release is required. A valid SEC contact, working permitted SEC access and original filing/security-class review remain prerequisites for live usefulness. No production environment variables were inspected or changed and no live SEC request was made during this implementation. Supabase, Telegram, polling and AI activation are unchanged. Read-only live testing, if requested later, must inspect actual partial/failure coverage without treating it as financial decision authority.
