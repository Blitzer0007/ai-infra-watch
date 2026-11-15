# Milestone 2 — reviewed holding accounting and historical abstention

15 November 2026. Feature-branch implementation for draft PR #168; not deployed. [Continuation draft](CODEX-CONTINUATION.md).

Holding rows and hypothetical sale scenarios previously rebuilt cost from saved holding averages even when the aggregate trading summary used original ledger inputs. Those views can disagree after fees, partial sales, missing transactions or an old snapshot. Portfolio now projects remaining cost from the same strict original loaded ledger before calculating rows, allocation context and scenarios. Raw holdings, trade DTOs and saved rules are not changed.

## Calculation boundary

- `reviewLoadedPositionAccounting` internally reviews original holding/trade receipts, binds the complete displayed symbol/quantity set to those holdings, and uses the reviewed remaining weighted-average cost. It accepts no caller-supplied accounting approval receipt.
- Cost, P&L, average cost and scenario profit remain unavailable when fees, currency, execution order, quantity, dates or original records fail review. A forged display cost cannot rescue unsupported ledger inputs. Missing snapshot cost/currency can be replaced only by independently supported original trade cost; a missing original holding quantity cannot.
- Current valuation still requires an admitted quote and quantity. A ledger failure does not replace a valid quote with cost or discard independently admitted values. Missing quotes retain reviewed cost but withhold current P&L; partial value coverage never creates weights from the observed subset.
- The projection carries exact conditional remaining cost into sale scenarios rather than rebuilding it from a divided/rounded average. Finite bounded arithmetic, observed zero, losses, fractional quantities and tiny nonzero money remain distinct from unavailable values. Tiny costs/scenarios use scientific notation rather than false zeros.
- Conditional arithmetic never grants source authenticity, full-history/corporate-action coverage or decision eligibility. Add/recovery states stay withheld. Ordinary holding/rule editors continue using original records and their existing write boundaries.

## History boundary

Portfolio return charts, reconstructed pressure trends, portfolio-versus-benchmark returns, peer opportunity-cost results and historical high exit targets are withheld with visible reasons. There is no supported full-history/source contract to enable them. Their legacy financial consumers and additional maximum-history requests were removed from this UI rather than treating matched loaded records as complete history.

The selected holding's descriptive price chart, current quote values, daily moves and descriptive price correlations remain separate. An explicit MAX chart selection may still request that symbol's descriptive history. These displays do not establish historical accounting returns, authenticated source coverage or a causal relationship.

## Verification

Cloud validation: **1,784 Node tests passed**, including 21 new per-position cases. After the final explicit-null guard cleanup, all 60 focused original-input accounting cases passed. TypeScript, production build, tracked-source security, unchanged 32-file migration manifest and whitespace checks passed.

**102 distinct focused browser cases passed** across reviewed positions, valuation, accounting summaries, holding dialog, Portfolio navigation, company research and shared UI/exploratory flows. Initial failures exposed a wrong sortable-column selector and microsecond timestamps in the shared positive quote mock. The selector and fixture were corrected to the supported millisecond contract; admission rules were preserved. The nine-case new suite and affected shared UI/exploratory flows were rerun successfully. Fixtures cover snapshot/ledger disagreement, fee/currency/quantity/missing-record failures, retained valuation/weights, tiny cost/scenarios, historical abstention, avoided maximum-history reads, Back navigation and existing editing/mobile flows. Saved-head CI evidence is recorded in draft PR #168; check that exact SHA separately.

The first full CI run on implementation `7c5bc59509a87b7475e37fa62dd9ff8689b1ac42` passed six workflows but found seven legacy fixture-coupling failures in the UI job. Complete quote declarations are now an explicit positive-test opt-in; existing source-gap/council-feed tests retain their incomplete-quote default. Missing-data valuation tests supply original fictional quantity/trade receipts. The follow-up passed **29 cases**, with one non-QA production-build council check skipped locally because its separate preview URL was not supplied. CI supplies that preview and reruns the complete suite; inspect the exact saved-head result on PR #168. No runtime gate was relaxed to repair these fixtures.

Tests use invented receipts and intercepted transports only. The existing main bundle warning remains (about 1,760 kB minified, with the dossier still split into its own chunk).

## Remaining work

Milestone 2 still requires integrated calendar/inbox/company research context, retained reading/filter state, source/conflict explanations, loading/error cases and keyboard/mobile acceptance. Authoritative ledger history, broker semantics, corporate actions, issuer/source acquisition, FX/history consumers elsewhere and live provider acceptance remain open. No production changes, polling, messages or second release are implied. Production releases remain **1/5**.
