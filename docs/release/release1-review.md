# Release 1 review candidate

Branch: `feature/release1-portfolio-command-center`. Development only; no release is authorized.
The user's original requirements are in `release1-engineering-spec.md`.

## Changes

- Adds a portfolio Command Center, prioritized review queue, expandable decision evidence and links into existing position, evidence, forecast and journal views.
- Adapts the existing portfolioPositions engine without changing its thresholds. Eligibility failures suppress both the new cards and the existing portfolio state displays. Accounting methods and transaction reconciliation remain unchanged.
- Adds a bundled 20-term glossary to the guide and contextual explanations in the Command Center. Native modal dialogs support keyboard activation, Escape, focus containment and focus restoration.
- Adds deterministic USD numeric, provenance, session, timestamp, simulation and independent-provider comparison gates. Closed-session prices require explicit last-close provenance. A 96-hour close-age ceiling accommodates ordinary weekends; it is not an exchange holiday calendar.
- Exposes only additive quote metadata and existing decision-center rule explanations. Currency, market time and session information are never invented for providers that omit them. Provider fallback for existing display consumers remains unchanged.
- Adds no new runtime library, provider polling loop, database query, persistent service or schema change. All new implementation and glossary text are original; no Ghostfolio, OpenBB or REA source was incorporated.
- Development/QA config synchronization, scorecard submission and Telegram relay are disabled. Previous Cloud CI isolation changes are carried forward intact.

## Validation and evidence

- Locked npm installation completed with lifecycle scripts disabled, using the Cloud-owned npm cache. The default home cache was unwritable; retrying with `/workspace/.npm-cache` resolved this.
- Validation passed in Cloud: TypeScript, 338 unit tests, mocked browser and workflow safety suites, source security audit, migration manifest verification and production bundle build. The final three Release 1 browser tests also pass with document-level 360px overflow and keyboard focus checks. No production credentials were used.
- Unit coverage includes malformed/absent/nonpositive prices, future times, missing provenance, stale fallback, explicit last close, unsupported currencies, simulated data, accounting/evidence failures, conflicting provider prices, adjustment mismatch, withheld totals and leveraged thresholds.
- Browser coverage uses Vite without backend routes, mocked APIs, and the existing external-network guards. It checks the queue, expandable evidence, navigation, 20 static definitions, Enter/Escape, focus restoration and a 360px Command Center/dialog.
- Screenshots are generated under `/workspace/artifacts/release1-*.png` in this Cloud session. Test artifact paths are configurable for other CI runners.
- Existing accounting and freshness tests remain part of the unit suite; existing mocked UI and workflow safety suites are also run. Live production checks and linked PostgreSQL replay are intentionally not run here.

## Review limits and remaining risks

- Strict gates will withhold many current assessments until upstream sources supply currency/session/market-time metadata and all group/peer observations validate. This is intentional; retrieval time cannot substitute for market time.
- Confirmed catalyst dates display only when an existing feed supplies an explicit confirmation, symbol, date and source. Missing or estimated dates remain unavailable. No additional calendar polling was introduced.
- Independent-provider comparison only applies when independent observations already exist; this release does not obtain additional quotes to manufacture consensus.
- Legacy forecast performance remains in existing screens. Ungated engine output is labelled separately and must not be represented as a stored, historically validated signal.
- Existing CSS optimization and bundle-size warnings remain. The new Command Center and dialog are checked at 360px; other legacy screens retain their existing layout.
- Workflow configuration has not been pushed or run on GitHub. Remote branch protections and protected environments require a separate authorized administration task.

## Release and rollback

Review the complete diff, including the earlier CI-isolation changes, before authorizing a commit/push or PR. Require the offline CI checks on that exact commit. Keep Vercel Git deployment disabled and the existing production approval workflow unchanged.

No Vercel deployment, production Supabase operation, production secret retrieval, Telegram message, GitHub write or main-branch commit occurred during this work. Development completion does not authorize deployment.

After a separately approved release, roll back application changes by reverting the feature commits and redeploying the previously approved application through the existing manual gate. This release requires no database rollback. Do not reset or discard unrelated work.
