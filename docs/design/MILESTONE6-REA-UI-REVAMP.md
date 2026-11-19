# Milestone 6 — REA-informed UI/UX revamp for AI Infra Watch

**Status:** Draft candidate, 19 November 2026. **No production deploy, merge or data migration authorized by this document.**

## Source and method

REA is **Reverse Engineer Anything**, an MIT-licensed inspection/analysis toolkit, **not a finance dashboard theme**. Its official repository is https://github.com/morluto/rea; browser guidance: https://rea.tools/guides/browser/. The relevant method is to observe a reference UI, identify state transitions and data flows, record evidence, and then independently implement the interaction contract. **We have read its public documentation and inspected AI Infra Watch's repository, but have not installed or executed the REA CLI/MCP or captured third-party private UI sessions.** Do not claim that REA generated the redesign.

Do not copy proprietary layouts, logos, assets, paid templates or third-party source code. Reference features at the level of reusable interaction concepts. Before a later actual REA browser study, choose an accessible public demonstration, define the exact interactions to examine, and execute it in an authorized cloud development environment—never on the owner's Windows PC or against authenticated private financial content.

## Audited baseline on production main `6827cce1a323949e1b36c06a0a1dca030e63c127`

| Observed file | Existing user-facing behavior | Opportunity |
| --- | --- | --- |
| `src/App.tsx` | 17 equally weighted sidebar destinations and a busy market/status strip | Define primary goals, grouped navigation, and progressive disclosure while retaining stable routes and test IDs |
| `src/components/portfolio/PortfolioCommandCenter.tsx` | Dense text-only KPI grid, multiple evidence statements competing with review queue | Distinguish portfolio summary, quality eligibility, dated catalysts and next reviews visually |
| `src/components/portfolio/PortfolioNavigation.tsx` | Mobile select plus flat primary tabs and an always-expanded research tool list | Add accessible responsive workspace switching, current-section orientation, and expandable secondary tools |
| `src/index.css` | Existing dark palette, a complex mobile viewport compatibility layer, and reduced-motion handling | Introduce scoped, reusable cards, spacing and focus states without breaking existing viewport protections |

These observations are from source code and tests, **not a claimed visual session recording**. The current application is a React/Tailwind app deployed on Vercel; no new theme package, provider, or data source is required.

## First implemented slice in PR #179

**Portfolio review cockpit:**
- Four readable summary tiles: sourced value and coverage, holding count, review-risk count, and concentration. Null/unknown input renders **Unavailable**, never an invented $0 or zero concentration.
- Data-quality decision eligibility is visually distinct from available values, with existing "withheld" explanations preserved.
- Verified catalyst dates retain the existing source/timezone behavior, including date-only source semantics; no estimated catalyst is promoted as confirmed.
- Review queue retains the same `PortfolioReviewQueue` component, evidence actions and research-not-trade disclaimer.
- Responsive **Core** workspaces and secondary **Research** disclosure, with keyboard-accessible selector visible at all widths. Existing query-state navigation and browser Back preserved.

**Technical limits:** only presentational component and scoped stylesheet changes; no decision rules, alert processing, API, stored positions, secret configuration, live polling, scheduled job, Telegram action, or Supabase schema/data change.

## Follow-on design slices after review

1. **Application shell:** replace the current 17-link equal-weight sidebar with grouped destinations (Today, Portfolio, Research, Operations), a consistent page header, and keyboard-safe mobile navigation. Preserve all routes, deep links, data-testid selectors and existing feature accessibility.
2. **Information systems:** standardize source identity, "as of" dates, observed/unknown states, warnings, and next actions across Opportunity Scanner, Data Health, Forward Outlook, and JEV Bull/Bear/Judge. Distinguish mock estimates from independently verified observations.
3. **Detail experiences:** improve Holding Details, source comparison, onboarding/empty states, searchable tables and alert triage with responsive data density. Never auto-post scorecards or implicitly write portfolio state on navigation.

Do not merge all three slices in one unreviewed UI patch. Avoid new application dependencies or production deploys for purely visual work.

## Acceptance and proof

- Exact PR head: **Frontend CI**, **Security audit**, and **UI API DB Validation**, including full mocked browser suite and disposable Postgres replays, must all conclude success.
- Existing Portfolio routes, `portfolio-navigation` selector, Overview and Evidence return path, modal focus/scroll restoration at **360px, 768px, and 1440px**, and no background scorecard writes must remain unchanged.
- New browser contract verifies the redesigned Command Center and navigation at all three widths, accessible headings and timezone, zero container horizontal overflow, and browser Back to the current workspace.
- Color conveys state *in addition to text*. Focus states, semantic landmarks, touch targets and reduced-motion CSS remain available.
- Real production screenshots, qualitative UX testing and genuine REA browser findings are still needed before claiming a complete cross-app UI revamp.
