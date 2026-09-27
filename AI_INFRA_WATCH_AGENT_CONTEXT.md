# AI Infra Watch — Canonical Project Context

Last updated: 2026-09-27

## Product
AI Infra Watch monitors a 10-stock portfolio plus a 27-stock watchlist for AI infrastructure, contracts, earnings, geopolitics, peer relationships, event reactions, and observed relative-strength/rotation signals.

Repository: Blitzer0007/ai-infra-watch
Production URL: https://ai-infra-watch.vercel.app
Frontend: React 19 + Vite + Tailwind
Backend: existing Express server.ts plus Vercel serverless api/live-data.js
Deployment: Vercel Git integration from main

## Portfolio
DGXX, DRAM, SOXL, NVDA, MSFT, NBIS, VIVO, META, NOW, PHVS

## Watchlist
000660.KS (SK Hynix), SNDK (SanDisk), MU, TEAM, SOFI, CRM, AMZN, GOOGL, PLTR, CBRS, RUM, QCOM, INTC, SOXX, IREN, TSM, AMD, TSLA, AAPL, ONDS, CIFR, IONQ, NOK, TRT, AMPG, DELL, IBM

## Current production state
- Portfolio Intelligence UI exists at a new sidebar view.
- Dynamic intelligence engine exists at src/utils/intelligence.ts.
- Live Vercel endpoint exists at api/live-data.js.
- api/live-data.js pulls current quotes from Yahoo Finance chart data and AI/semiconductor news from GDELT.
- Daily change is calculated from the latest two valid trading closes, so weekends do not force 0%.
- Rotation UI now calculates group scores from current daily returns, breadth, and universe-relative performance.
- Event Study UI is a scaffold; verified historical event-price data is not implemented yet.
- Existing server.ts still contains the older monolithic Gemini synthesis flow and stale fallback data; do not treat its fallback values as current market facts.
- Do not use or store any GitHub PAT. Previously exposed token was revoked.

## Target agent architecture
Supervisor → Market Agent → Risk Agent → Synthesis Agent

Planned future expansion:
Supervisor → Market / Contract / Policy / Risk specialists → Relationship/Event Study → Synthesis/Rotation

## Agent responsibilities
Supervisor:
- classify incoming request/event
- determine which specialists to call
- manage shared state and termination
- enforce guardrails and source requirements

Market Agent:
- retrieve prices/volume/earnings/peer data
- calculate daily and multi-window returns
- calculate peer spreads and group breadth
- return structured market evidence with timestamps/source metadata

Risk Agent:
- retrieve geopolitical/macro/trade-policy facts
- map risk event → affected region/supply chain → portfolio/watchlist exposure
- return structured risk evidence and uncertainty

Synthesis Agent:
- combine market + risk evidence
- separate facts from inference
- summarize company/peer implications
- produce observed rotation signals, never claim literal capital flows
- cite source metadata

## LangGraph design
Shared typed state should include:
- user_query / trigger
- requested_symbols
- market_evidence
- risk_evidence
- synthesis
- sources
- errors
- trace / visited_nodes
- started_at / completed_at

Core graph:
START → supervisor → market_agent → risk_agent → synthesis_agent → END

Conditional routing can be added later so Supervisor can skip unnecessary agents or call specialists in parallel.

## AI QA requirements from roadmap
Trajectory testing:
- assert expected nodes/tool calls
Behavioral testing:
- financial questions require source-backed retrieval
Tool validation:
- arguments and empty/error results
State validation:
- expected state at each node
Adversarial testing:
- prompt injection, unsafe tool requests, unsupported certainty
Loop protection:
- max iterations / deterministic termination

## MCP roadmap
Planned custom servers:
- mcp-server-stocks
- mcp-server-congress
- mcp-server-contracts
- mcp-server-risks

## Important guardrails
- No investment advice.
- No fabricated current prices/events/contracts.
- Label computed rotation as a signal/model output.
- Keep source and timestamp metadata with factual evidence.
- Distinguish verified facts, model inference, and uncertainty.
- Never commit API keys, tokens, or other credentials.

## Immediate next milestone
Build the first real LangGraph implementation:
Supervisor → Market Agent → Risk Agent → Synthesis Agent

Preferred implementation:
- Python
- LangGraph
- Pydantic typed state
- provider-agnostic tool interfaces
- pytest tests for graph routing and state transitions
- expose a callable service/API later for the React/Vercel frontend
