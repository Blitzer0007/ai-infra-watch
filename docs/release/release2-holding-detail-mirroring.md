# Release 2 — first REA-assisted feature-mirroring increment

Branch: `feature/release2-opportunity-research`, stacked draft PR #168. Scope: Ghostfolio-inspired holdings → detail → return workflow in the existing React application. No production deployment, hosted database work, notification or live model call is included.

## Reference investigation and actual REA use

The user's request to start the selected feature-mirroring workflow is implemented with a bounded Cloud CLI investigation. REA **6.8.0** is installed at `/workspace/tools/rea-6.8.0`, outside the application. Acquisition used the official `rea-agents` npm package, pinned version/integrity, workspace-owned npm cache and disabled package lifecycle scripts. No global install, setup wizard, MCP registration, agent configuration change, native engine or application dependency was added. The repository's package and lock files are unchanged.

Reference: [Ghostfolio](https://github.com/ghostfolio/ghostfolio), commit `2823510bf4930c974a7681ba8eb45584c190e775`, in a separate sparse checkout. No Ghostfolio application, database or Redis stack was started. Its AGPL source was inspected as a reference; no application code was copied into AI Infra Watch.

REA parsed these four selected TypeScript sources as inert text:

- `apps/client/src/app/pages/home/home-page.routes.ts`
- `apps/client/src/app/components/home-holdings/home-holdings.component.ts`
- `apps/client/src/app/components/holding-detail-dialog/holding-detail-dialog.component.ts`
- `libs/ui/src/lib/holdings-table/holdings-table.component.ts`

The retained analysis has four parsed files, no parse failures, 4,247 visited AST nodes and 247 findings. Artifact digest: `be85fd0228cf34423dc66ec759de204a06d9e48cb130cc3c0976eefb5bec69e0`. Parent Evidence: `ev_b947b387006f5958c8b18ebaa179af0beeb7831856bd2f50fd1d4584f95ddfae`.

Coverage is explicitly **partial**: 42 inventoried files were not selected, and 1,117 semantic unknowns remain. A structural trace for `holdingDetailDialog` found no graph seed; the property semantic trace also had zero matches with partial coverage. These results do not prove absence of the feature and are not presented as successful end-to-end traces. REA's selected-source graph does not establish Angular runtime behavior, accessible focus handling or visual parity.

Direct inspection of the pinned public sources shows `onHoldingClicked` setting `dataSource`, `symbol` and `holdingDetailDialog` query parameters, the detail dialog's close handler, and closure on navigation. Those source findings inform this original React implementation. No browser session of Ghostfolio or screenshot-to-screenshot runtime parity is claimed.

Retained outside Git, under `/workspace/artifacts/`: `rea-ghostfolio-holdings.evidence.json` (complete bundle), `rea-ghostfolio-holdings.summary.json`, `rea-ghostfolio-manifest.json` (source hashes and package integrity), `rea-ghostfolio-feature-trace.json`, and `rea-ghostfolio-semantic-trace.json`. Reports retain the coverage limits; exhausting a summary view does not imply complete application analysis.

## Resulting application behavior

My Holdings now opens one read-only detail dialog from a holding card, a stock in the optional table, or **Open selected holding**. The list remains mounted underneath the native modal. Chart, company/valuation/analyst and peer context move into that detail flow; advanced company research remains in a disclosure.

The dialog has a named heading, a sticky **Back to holdings** button, Escape handling, keyboard focus containment, body scroll locking and explicit restoration of the originating control/list scroll position. Return works even when a workspace round trip recreated the original row; direct links fall back to an available holding control or section heading.

`portfolio_detail=SYMBOL` represents an explicitly open detail. `portfolio_status` and `portfolio_sort` preserve supported list choices alongside existing `portfolio_q`, `portfolio_group` and `portfolio_symbol`. No position values, costs, notes or editing drafts are serialized. Malformed detail symbols and unknown filter/sort values fail to safe list defaults. Detail is ignored outside My Holdings.

Opening from the list creates a history entry. Close/Escape uses Back for an entry opened in the current view. A directly loaded/reloaded detail closes by replacing its detail parameter, preserving the portfolio route rather than navigating away. Browser Back/Forward replays the detail identity. Opening Evidence or Performance closes the modal and supports returning to that same detail with Back.

Holdings loading, unavailable holdings, a requested symbol outside loaded holdings, and unavailable history are separate states. A missing symbol never silently shows the first available holding's detail or fetches that substitute's history/analyst data. Quote provenance remains visible, and the price-history header says snapshot/unavailable/needs-refresh rather than implying a verified live quote from retrieval alone.

Actual position management stays in the existing list workspace. Its unsaved form remains mounted while detail is open. The dialog exposes no holding mutation, sender, retry or model-review control. Financial formulas, thresholds, classifications, accounting and quote-eligibility rules are unchanged; the existing decision-card state remains authoritative.

## Requests and resource limits

Existing selected-history, chart, analyst and peer reads for My Holdings now require an explicitly open, matching loaded holding. Opening the list or changing its selected-holding picker does not start those reads. Evidence and Performance retain their existing request contracts. Current history caching/in-flight reuse is preserved; no extra endpoint, polling interval, provider, model call, migration or new application dependency is introduced.

The original local price/financial display calculations are reused, not replaced with Ghostfolio's ROAI or another reference product's ratings. Source observations and external financial coverage are not created by reproducing the UI workflow. The NVIDIA development credential/host configuration is still absent; JEV and NVIDIA were not called during this increment.

## Implementation and verification

- `HoldingDetailDialog.tsx`: portal/native dialog lifecycle, focus/scroll boundaries, keyboard controls and read-only content.
- `holdingDetailNavigation.ts`: validated detail/filter/sort URL contract, with six deterministic cases.
- `PortfolioIntelligence.tsx`: list/detail history, direct links, return context, explicit read gating and reuse of existing panels.
- `qa/test_holding_detail.py`: 12 fictional browser cases covering request deferral/zero writes, list context, Back/Forward/reload, unknown/failed/loading holdings, history failure, drafts, workspace round trips, keyboard and 360/768/1440px screenshots.
- Existing analyst/scenario/sorting UI cases retain their assertions and now enter through the new dialog.

Focused validation passed: 463 Node/TypeScript unit tests, the 12 new browser cases, existing portfolio navigation cases, targeted analyst/scenario regressions, TypeScript, production build, source security audit, local 32-file migration-manifest integrity and whitespace. The full local browser/workflow run passed 139 cases and exposed an immediate glossary-focus assertion race; its unchanged test passed in isolation. The glossary assertions now await the same required focus state instead of reading it immediately. A final combined glossary/holding-detail rerun passed all 20 cases after restarting an interrupted local Vite server. Exact-head CI results are recorded in draft PR #168. The existing bundle-size warning, broader browser/screen-reader coverage and hosted production verification remain open.

Fictional captures are `/workspace/artifacts/holding-detail-{360,768,1440}.png`; offline CI uploads those with the existing UI audit artifact. REA itself is not installed or executed by application CI.

Rollback is a reviewed application-code revert. The isolated Cloud tool can remain unused or be removed separately; no application/database rollback, agent configuration restoration or notification replay is needed. Next mirroring scope remains sourced company research based on Stock Analysis and Simply Wall St, with real financial-data integration separately tracked.
