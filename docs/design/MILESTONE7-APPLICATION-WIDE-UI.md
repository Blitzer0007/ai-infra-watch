# Milestone 7 — Application-wide UI/UX refresh

Date: 19 November 2026. Status: draft PR candidate, not production. Baseline main: `3bae7b12b567f669c93c859f68fae5d5a5c84cca`.

## Scope and traceability

This is a global interface pass for **all 17 existing top-level destinations**, extending the evidence-first Milestone 6 Portfolio design through shared infrastructure rather than copying another product's assets. [REA / Reverse Engineer Anything](https://github.com/morluto/rea) supplied an observation-and-behavior methodology only; its CLI/MCP was **not executed** in this work, and no private third-party UI was extracted or copied. The source audit examined the actual `src/App.tsx`, `src/index.css`, `src/components/UniversalSearch.tsx`, representative view components and existing Playwright contracts.

**The work changes presentation, hierarchy, discoverability, accessibility and route transitions. It does not reimplement the business logic of each independently owned view.** Domain-specific chart/table/instrument workflows retain their existing components and tests. Follow-up user studies can prioritize further view-specific refinements.

## User tasks and complete route inventory

| Primary area | Routes (existing paths preserved) | Intended workflow |
| --- | --- | --- |
| Today | `/overview`, `/opportunities`, `/calendar`, `/alerts` | Review daily changes and action queues |
| Portfolio | `/portfolio`, `/watchlist`, `/jev-lab`, `/outlook` | Review exposures, paper scenarios and forecasts |
| Research | `/contracts`, `/tracker`, `/congress`, `/macro`, `/research` | Investigate original evidence and uncertainty |
| Operations | `/quality`, `/health`, `/guide`, `/settings` | Understand source health, quality and system controls |

The application previously displayed 17 equally weighted links in one long list and duplicated the entire nav markup for desktop/mobile. It also showed two auto-moving market ticker copies, published a green `ACTIVE FEED` even when there was no confirmed successful source response, and offered only 14 of 17 destinations in Universal Search.

## Implemented interaction changes

1. **Shared, predictable wayfinding:** `src/utils/workspaceNavigation.ts` provides a 17-route single-source metadata registry with group, label, explanation and reviewed next destinations. `WorkspaceNavigation` renders exactly those 17 groups for desktop and mobile while preserving `nav-<id>` desktop test IDs, `/path` routes, query parameters and browser Back. Mobile has a dismissible, keyboard-Escape menu and background scroll lock. No destinations are hidden behind a new account state or default-collapsed disclosure.
2. **Every view has context:** `WorkspaceHeader` displays the active task category, its plain-English purpose and quick next destinations. This header uses a paragraph rather than a duplicate `h1`, preserving existing page-heading tests and assistive semantics. Controls are real navigation actions, not inert visual decoration.
3. **Observations are not trading signals:** `FeedStatusBar` distinguishes loading, failed response, recorded response and unknown, and labels quote counts `not marked stale` rather than guaranteed current. It keeps the exact `REFRESH FEED` accessible action and existing handler without new API calls, scheduled polling or optimistic health claims. Failed inputs retain error text.
4. **Accessible quote strip:** replaces the constantly animated duplicate ticker with a one-pass, keyboard-scrollable source-observation strip. Quote placeholders remain unknown when missing. Existing `FreshnessBadge` is reused for admitted observations.
5. **Search and focus:** Universal Search discovers all 17 pages and saved tickers, retains Cmd/Ctrl+K, Escape, Enter and ticker shortcuts. App-wide visible focus rings and a skip-to-main keyboard link are added. Mobile hit targets, high-contrast text and reduced-motion behavior are retained.
6. **Consistent visuals:** shared navy/cyan design tokens, grouped sidebar surfaces, responsive route headers, status panels, table boundaries, headings and search dialog. Existing Portfolio tiles remain distinctive, preserving the Milestone 6 design. CSS changes are scoped under `.aiw-application` and `.aiw-view-stage`, with no rewrite of view component logic.

## Fail-closed, regression-safe acceptance

- Unit: exactly 17 unique registered views, four recognized categories, every related route valid and distinct, and invalid URL metadata defaults to the existing Overview route.
- Browser: at desktop 1440px all 17 desktop nav controls are visible, route and Back semantics remain; at 360px and 768px mobile groups, Escape, and click-to-navigate work without horizontal overflow. Every tested route has the shared header, unknown-aware feed status, functioning manual refresh, and an accessible quote strip. Existing deep-link, holding dialog, editor-draft preservation, evidence/source and no-implicit-writes suites must still pass unchanged.
- Run exact-PR-head Frontend CI (including unit/TypeScript/build), Security audit, and UI/API/DB Validation (full mocked Chromium and disposable Postgres migration replay). Repair real failures before releasing.
- Merge using reviewed regular two-parent commit only after CI; verify new exact-main results and GitHub protected-environment/staged Vercel checks before assigning the live alias. Keep current Milestone 6 production `dpl_J45FmeRcw2oHAUCNwzRt4U9ew6nV` READY for rollback.
- No production Supabase schema/data changes, secrets, trades, Telegram sends, private provider refreshes, or new cron scheduling. Browser route checks use fictional mocked endpoints.

## Outside this release

Custom graph/chart redesign and detailed bespoke onboarding for every research view are not rewritten in this shell change; they can be iterated independently without destabilizing valuation and evidence gates. The shared shell itself affects every screen and must be judged on real responsive screenshots and accessibility alongside automated assertions. A broad redesign is **not** evidence that market coverage, forecast accuracy, or financial P&L is independently verified.
