# Opportunities financial-input review — 22 November 2026

This increment adds a compact financial-evidence review to the existing manual Opportunities scan. It reuses the authenticated SEC connection from [SEC-DOSSIER-CONNECTION.md](SEC-DOSSIER-CONNECTION.md). It remains part of draft PR #188, unmerged and undeployed.

## Behavior

After scanning loaded holdings/watchlist data, open **Company financial inputs · optional SEC read**, select one scanned company, and explicitly choose **Load SEC financial inputs**. Opening the page, running a scan, opening the disclosure and changing the company make no financial-source request. The load uses the existing private session and the same bounded directory/submissions/companyfacts action as company dossiers.

Choose an annual period to inspect admitted revenue, operating income, net income, operating cash flow and property/plant/equipment payment declarations in one table. Each row keeps its own form, filing day, period, units and constructed filing reference. Missing groups are named and do not become zero. Different revenue definitions stay separate; negative income is preserved. The supported groups are not complete financial statements.

The financial review does not alter the frozen research candidates, JEV summary, research eligibility, quote data or portfolio accounting. It does not derive growth, free-cash-flow totals, forecasts, multiples or trading instructions from statements whose context/aggregation authority remains unverified. Authentic asset/listing evidence and compatible financial/market observations remain prerequisites for research classification.

One selected company's packet stays only in view memory. Closing/reopening the disclosure does not repeat acquisition. Switching company or navigating unmounts/aborts browser work and discards the previous scope; late replies cannot populate the new company. Rescanning clears the review without fetching again. Scan generations use a counter as well as capture time so even two scans with the same clock value get different scopes.

## Shared controls and changes

- `useManualSecDossier` now owns the existing dossier/Opportunities authentication, bounded response admission, explicit-attempt cap, successful-load guard, cancellation, fixed error messages and no-retry behavior. The server's contact, source, size, cache and process-local budget controls are unchanged.
- `opportunityFinancialReview` reuses the original-input/receipt admission and dossier cross-source checks before projecting supported rows. Mismatched scopes, forged receipts or promoted source/eligibility claims are withheld. A review never grants aggregation or research/trading eligibility.
- Error-code lookup now requires an own allowlisted key. Unknown codes, including prototype property names, yield only the fixed generic message.
- The financial panel starts collapsed. Source limitations live in a separate disclosure rather than being repeated on every candidate card. Existing light/dark themes and research navigation are preserved.
- No dependencies, API routes, credentials, production configuration, financial acceptance rules or deployment controls were added/changed by this increment.

## Verification

All source documents are fictional and all browser/provider transport is intercepted; no live SEC/model request or production credential inspection occurred.

- 1,149 Node tests passed, including original receipt admission, source-row preservation, missing/conflicting fields, independent revenue definitions, scope/eligibility rejection and fixed error vocabulary.
- TypeScript, security scan and whitespace checks passed.
- Twelve targeted browser cases passed: both themes/mobile-desktop layouts, explicit authenticated reads, frozen-scan eligibility, rescan clearing at a fixed clock, issuer change, delayed reply cancellation and the existing dossier/attempt-limit/failure regressions.
- Broader Opportunities/navigation/source-quality suites passed 41 cases with one production-only case skipped in the QA build. That case then passed separately against the local non-QA production bundle. The production build and all-workspace no-passive-persistence smoke also passed.
- Final production smoke/build outcomes and exact-head CI are recorded in PR #188 and the Cloud release-evidence handoff. Previous 11b596c CI covers the earlier dossier increment only.

## Remaining work

Live SEC access/contact and actual source coverage are unverified. Securities-master/listing evidence, retained original filing context, compatible reported research observations, distributed provider quotas and adjusted histories remain open. Original broker precision/timezone/full-account evidence remains a separate accounting prerequisite. Agent Reach remains uninstalled. Production, polling, AI activation and Telegram delivery are unchanged.
