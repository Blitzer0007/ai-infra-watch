# UI/UX audit and first improvement pass

Draft Release 2 PR: [#168](https://github.com/Blitzer0007/ai-infra-watch/pull/168). Base: `feature/release1-portfolio-command-center` (Release 1 is still unmerged).

## Scope and method

Audited all 15 application routes in Cloud Chromium using intercepted API fixtures. Recorded before screenshots and DOM inventories at 360 × 800 and 1440 × 1000. Verified the improved routes at 360, 768, and 1440 pixels and reviewed their viewport screenshots. Checked the private-access screen separately at 320, 768, and 1440 pixels against a static build with `VITE_QA_MODE=false`; its rejection response comes from an intercepted, fictional authentication request.

The inventory checks the visible DOM throughout each route, while screenshots capture the initial viewport. Existing functional regressions cover additional interactions, tabs, filters, disclosures, unavailable-data states, and fixture-only form operations. This is an engineering audit and first improvement pass, not a complete screen-reader, contrast, device, or WCAG certification.

No production endpoint, database, deployment, Telegram delivery, or production secret was used. This pass changes frontend presentation and fixture-only CI coverage. It does not change investment classifications, data-quality thresholds, authentication enforcement, or production deployment controls.

## Findings and changes

- **Navigation and keyboard access:** the mobile drawer previously lacked modal behavior. It now uses a native dialog, traps Tab/Shift+Tab, supports Escape, restores trigger focus, blocks background interaction, and closes when the desktop breakpoint is reached. Desktop and mobile navigation expose the current page. Universal search now has the same modal focus behavior; Enter prevents accidental reactivation of its trigger. Route transitions focus the destination heading and update the document title, including browser Back. Same-route hash navigation preserves skip-link focus.
- **Content hierarchy:** added the missing Portfolio and Evidence Availability H1s and moved the Portfolio/Guide titles before subordinate content. Mobile page headers no longer occupy a sticky block over the content. A compact, expandable feed panel replaces the large repeated banner while keeping Refresh Feed immediately available. A ticker pause/resume control and reduced-motion CSS make continuous movement controllable.
- **Readability:** legacy 7–11px utility classes now render at 12px minimum; page descriptions use 14px. Raised common muted text colors, made keyboard focus conspicuous, and set ordinary buttons and form controls to 44px minimum height. System fonts remove the external Google Fonts dependency. Table columns retain their natural widths in focusable scroll regions rather than relying on blanket viewport clipping.
- **Forms and tables:** fixed 11 unnamed controls across the route inventories plus the access-token input found during source review. Shared filters show persistent labels, with existing Congress filter titles retained. Sort state belongs to table headers, with meaningful button names. Clickable DataTable rows support Enter/Space and avoid double activation from nested controls. The access screen announces authentication errors and identifies the invalid field without changing token validation.
- **CSS maintenance:** removed overlapping viewport-lock rules and the malformed escaped utility selector that produced a build warning.

## Page-by-page record

Every row below also received the shared shell, focus, typography, and responsive-layout changes. Counts are observations in the fixed baseline fixtures, not unique issues across all possible page states.

| Route | Unnamed controls before | Text leaves below 12px before (desktop / phone) | Page-specific outcome |
| --- | ---: | ---: | --- |
| `/overview` | 0 | 54 / 55 | Compact feed controls; readable summary metadata; consistent heading treatment. |
| `/contracts` | 3 | 18 / 19 | Connected company/status/search labels; clearer filter typography. |
| `/tracker` | 1 | 21 / 22 | Persistent, associated ticker label; readable ticker and milestone controls. |
| `/congress` | 0 | 34 / 32 | Preserved existing visible filter titles; keyboard-scrollable table and correct sorting semantics. |
| `/macro` | 0 | 91 / 92 | Readable evidence/status chips; visible table scroll and sort instructions. |
| `/portfolio` | 0 | 66 / 66 | Added H1 before Command Center; consistent header; persistent holdings filter labels. |
| `/opportunities` | 0 | 7 / 7 | Plain-language snapshot/data limitations; readable primary scan action. |
| `/watchlist` | 0 | 94 / 95 | Readable alert/status metadata and larger primary interaction targets. |
| `/research` | 1 | 14 / 15 | Persistent research-question label; readable backend status and controls. |
| `/jev-lab` | 0 | 9 / 9 | Readable research disclaimers and setup metadata; larger setup controls. |
| `/quality` | 3 | 39 / 40 | Three persistent evaluator labels; readable status chips; accessible table sorting. |
| `/outlook` | 1 | 110 / 111 | Associated ticker label; readable forecast metadata and table controls. |
| `/health` | 0 | 14 / 14 | Added H1; readable evidence/status metadata and refresh controls. |
| `/guide` | 1 | 19 / 21 | Moved title before glossary; associated concept-search label; readable help text. |
| `/settings` | 1 | 28 / 29 | Associated optional Finnhub-key label; readable settings metadata and controls. |
| Private access | 1 (source review) | Not captured before | Persistent token label, field/error association, announced rejection, administrator help text. |

## Verification and evidence

- All 15 routes at all three widths: one H1 appearing before subordinate headings, no unnamed visible form controls/buttons, no measured text leaves below 12px, no page-wide horizontal overflow, no uncaught page errors. Baseline route inventories had two missing H1s, 11 unnamed controls, and 618 / 627 text leaves below 12px on desktop / phone respectively.
- Offscreen table columns remain intentionally available in horizontal scroll regions. Keyboard interaction checks confirm horizontal scrolling and sort direction changes. The audit distinguishes these from controls clipped outside a scroll region.
- New interaction coverage: mobile modal behavior at 320/768px, focus loops, Escape, desktop resizing, search navigation and Back, skip link, ticker pause, feed disclosure, and keyboard table scrolling/sorting. The access-gate checks cover disabled empty submission, a rejected fictional token, associated error text, and recovery at three widths.
- Existing regression suites: 78 passed. New UI/access/audit checks: 11 passed (89 browser/workflow checks total). Unit tests: 379 passed. TypeScript, security audit, local migration-manifest integrity, and production build pass.
- Reproduce the new checks with `QA_BASE_URL=http://127.0.0.1:3000 QA_UI_MOCKS=true` against the QA-mode Vite server; add `QA_LOGIN_BASE_URL=http://127.0.0.1:3001` pointing to a static preview built with `VITE_QA_MODE=false`, then run `python -m pytest -q qa/test_uiux.py qa/test_uiux_audit.py qa/test_access_gate.py`.
- Cloud evidence: `/workspace/artifacts/uiux-audit/before/` and `after/` contain JSON inventories and route screenshots. CI runs the same new suites without production credentials and uploads fixture-only evidence as the `uiux-audit` artifact (7-day retention). Local artifacts are intentionally outside Git.

## Remaining work

The existing single JavaScript bundle remains about 1.6 MB uncompressed and still produces Vite's size warning. A separate route-loading/performance pass should measure and split it. Native dialog support was checked in Chromium; touch devices, Firefox/WebKit, screen readers, high zoom, and a dedicated color-contrast audit remain follow-ups. Dense historical/forecast pages still warrant user feedback after a safe preview is explicitly authorized. No preview deployment was created here.

Release 2's live enrichment and further product features remain governed by the existing engineering plan; the Opportunities page still operates only on already-loaded snapshots.
