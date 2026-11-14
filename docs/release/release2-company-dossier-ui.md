# Release 2 — sectioned read-only company dossier

Implemented in Codex Cloud on `feature/release2-opportunity-research`, 14 November 2026. This increment adds a read-only view over the [financial-observation contract](release2-company-financial-observations.md), a development-only fictional preview and an unconnected-data view for actual holdings. It does not add real financial acquisition, a provider/model call, a database change or a decision signal.

## Navigation and presentation

- Holding details has a closed **Company dossier** disclosure. Opening it loads the view's static code and shows the selected holding's identity with financial sources **not connected**. No CIK, business description, statement, source receipt or financial zero is invented for that holding. Existing history/chart/analyst reads and holding navigation are unchanged.
- Seven local section buttons show one panel at a time: Overview, Growth, Financial health, Valuation, Catalysts, Risks and Sources. Native buttons support Tab/Enter, have pressed state and reference the labelled active panel. The two-column phone layout wraps to four columns on wider screens; no horizontal tab strip or compressed statement table is introduced.
- The overview explains coverage and missing business information. Growth groups period-labelled revenue/growth/margin observations; Financial health groups cash-flow and balance observations without assigning a health score. Values, units and periods remain visible; original inputs, source retrieval and unknown fiscal/adjustment metadata are expandable.
- Valuation explicitly withholds P/E and EV/EBITDA; missing cash, interest-bearing debt, shares, EPS, EBITDA and compatible price inputs cannot become zeros or cheapness conclusions. Catalysts states unknown event coverage. Risks describes the absence of an evidence-backed company assessment and the source/data gaps; it cannot imply a low-risk result.
- Sources retains source status, declared issuer/retrieval and assessment, original filing day/precision, amendments versus unknown restatement status, constructed accession-index references and conservative publication-window bounds. The bounds are labelled as uncertainty bounds rather than known publication timestamps. Projection-only zero usage does not claim that acquisition was free or absent.
- Closing the disclosure/dialog resets local dossier section state. Static-code loading/failure is contained in the disclosure, and an unmounted holding ignores late code results. Existing holdings filters, drafts, detail deep links, scroll and return focus remain under their existing contracts. Section selection is not written to a URL or persistent storage.

## Fictional development preview

Portfolio Research includes a manual **Open fictional dossier** action only under Vite's development mode. It always uses the invented FICT issuer and bundled fixture, not a selected holding. The generated receipt matches the existing SEC adapter's output for the frozen fictional companyfacts input; no alternative formula is embedded in the UI.

The preview opens with an explicit fictional-data notice, labels every populated metric as fictional and leaves unsupported company/profile/valuation/event/risk inputs unavailable. It demonstrates eleven supported financial observations, including negative cash flow and distinct annual-duration versus instant balances. It does not relabel these records as NVDA or another real holding. Invented filing URLs remain text-only demonstration references.

The production build excludes the fictional-preview action, company name and fixture module. The actual-holding disclosure remains available with its unconnected source state. This is feature-branch implementation, not a deployment or approval for production use.

## Input boundary and activity

`companyDossier.ts` binds the displayed ticker to the request and reuses `buildCompanyFinancialObservations`; wrong issuer, malformed receipts, bad chronology and explicit source failures cannot supply displayed financials. It preserves reported zero, negative values, tiny nonzero amounts, money/percent/ratio units and the contract's false source/issuer/decision authority. The UI adds no ranking, forecast, score, accounting receipt or allocation change. Total liabilities/equity is not renamed debt/equity.

The view has no data fetch, storage access, polling, notification or model hook. The holding disclosure lazily downloads static view code on first opening; this is an application asset, not a financial/provider API request. In the captured build the deferred dossier chunk is approximately 21.9 kB / 7.5 kB gzip, with about 2.5 kB added to the entry chunk. The existing large application-bundle warning remains unresolved. The development fixture is not included in production assets.

## Evidence

- 31 new unit cases exercise ticker/request binding, all six source failures, original fixture/adapter parity, section grouping and formatting of zero, negative, tiny, invalid and differently unit-labelled values. The full Node suite passes 1,327 tests.
- 17 new browser/build cases cover manual opening, section separation, original derivation inputs, negative cash flow, observed zero, missing/failed/invalid/mismatched source states, amendments/precision/uncertainty labels, withheld valuation/events/risk, contained code-load failure, actual-holding navigation/return focus and 360/768/1440px screenshots.
- The isolated React runtime forbids fetch, WebSocket, polling, storage reads/writes and notifications, with zero requests and no page errors. The full-app holding test permits static code assets while requiring zero new API requests/writes from the dossier. The preview interaction has zero requests after existing page reads settle.
- Production-asset checks require the fictional action/name to be absent. Existing holding-dialog/navigation regressions, TypeScript, production build, source security, local migration-file integrity, workflow syntax and whitespace checks accompany the draft PR update. Exact-head CI is recorded in PR #168.

Screenshots are Cloud artifacts named `company-dossier-{360,768,1440}.png`. All inputs/API responses in these checks are invented or intercepted. These tests establish the described UI/metadata behavior, not source authenticity, financial completeness, real model effectiveness or hosted acceptance.

## Pending stages

Dedicated statement adapters for cash, interest-bearing debt, shares, earnings/EBITDA and compatible valuation inputs; actual taxonomy/fiscal labels/reporting and adjustment definitions; original acquisition/source/issuer evidence; period/restatement coverage; permitted provider budgets and live acceptance remain pending. Actual holdings currently receive no loaded financial receipt, and Opportunities/scanner eligibility is unchanged. Company-specific business/catalyst/risk content requires its own evidence contract before connection.

The offline dossier UI is implemented; full financial/source integration and broader Release 1/2 acceptance remain open. No merge, deployment, production Supabase operation, live polling or Telegram message is included. The rounded ~60% core estimate is unchanged by this partial integration stage.
