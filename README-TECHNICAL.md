# AI Infra Watch - Technical Documentation & Architecture

This document provides a comprehensive technical overview of the **AI Infra Watch** application, detailing its architecture, project structure, integration of Gemini AI, external API feeds, and robust rate-limiting safeguards.

---

## 1. System Architecture

AI Infra Watch is a **full-stack (Express + React/Vite)** application. By utilizing a server-side proxy layer, the application ensures that sensitive API keys (such as the Gemini API key) are hidden from the client browser and are executed safely in a Node.js runtime.

```
+-----------------------------------+
|      Vite + React Frontend        |  <-- Interactive telemetry widgets, tables,
|   (Lucide, Recharts, Tailwind)    |      risk maps, and news streams
+-----------------+-----------------+
                  | (HTTP GET /api/live-data)
                  v
+-----------------+-----------------+
|      Express Node.js Server       |  <-- Live cache, circuit breaker,
|           (server.ts)             |      and data orchestration
+--------+-----------------+--------+
         |                 |
         |                 | (Live synthesis & structural parsing)
         v                 v
+--------+--------+  +-----+------------+
| External Feeds  |  |  Gemini 1.5 API  |  <-- Real-time intelligence processing
| GDELT, AV, etc. |  +------------------+
+-----------------+
```

---

## 2. Project Directory Structure

```
/
├── server.ts               # Custom Express server, routing, API aggregators, & Gemini logic
├── package.json            # Script definitions, server, and client package dependencies
├── vite.config.ts          # Vite asset bundling and dev proxy configuration
├── metadata.json           # Applet permissions, description, and metadata
├── src/                    # Client-side React source directory
│   ├── main.tsx            # React application entry point
│   ├── index.css           # Global Tailwind CSS styles and font importing
│   ├── App.tsx             # Primary dashboard viewport containing UI grids
│   ├── data.ts             # High-fidelity static fallback dataset for congressional/macro trades
│   └── components/         # Modular React UI components
│       └── ...             # Visual tiles, news tick bars, and trend charts
└── public/                 # Static visual assets and icons
```

---

## 3. Environment Variable Configuration

To fully run the live-data pipeline, create a `.env` file in the root directory. Documented templates are maintained in `.env.example`:

```env
# Server-side Gemini API credentials (NEVER exposed to the browser)
GEMINI_API_KEY=your_gemini_api_key_here

# External Financial News Feeds (Optional fallback sources)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
MARKETAUX_API_KEY=your_marketaux_key
```

---

## 4. Live Data Synthesis API (`/api/live-data`)

The primary backend engine resides in `server.ts` under the `/api/live-data` endpoint. This endpoint consolidates four critical layers of data:

1. **Market Quotes**: Live evaluation of high-performance semiconductor, hosting, and energy stocks.
2. **Datacenter Contracts**: Real-time lease structures and physical compute allocations.
3. **Congressional Insider Trading**: Registered trades of high-impact equities by government officials.
4. **Geopolitical Macro Risks**: Structural maps of supply-chain vulnerabilities, embargoes, and regulatory caps.

---

## 5. Gemini AI Integration & Prompt Engineering

The **Gemini 1.5** model acts as an **Intelligence Orchestration Engine** inside `server.ts`. 

### The AI Pipeline:
1. **Feed Aggregation**: The server aggregates raw news articles from GDELT and Alpha Vantage.
2. **Contextual Ingestion**: The aggregated articles are structured into a clean JSON text stream and injected into a tailored Gemini prompt.
3. **Structured Translation**: Gemini is instructed to ingest these news vectors and synthesize them into high-fidelity, structured JSON conforming to a strict typescript interface:
   - Evaluates the immediate supply chain **impact rating** of current geopolitical events.
   - Extracts real-time stock price shifts and sentiment summaries.
   - Summarizes complex trade agreements into simple, impact-oriented breakdowns (e.g., explaining how Meta leasing NBIS infrastructure cements cloud reliance).
4. **Output Enforcement**: By specifying `responseMimeType: "application/json"` and passing a strict JSON Schema, Gemini guarantees valid data structures.

---

## 6. API Exhaustion, Timeouts & Circuit Breaker Safeguards

To survive high traffic, API rate limits, and network errors, the backend incorporates triple-redundant defensive engineering:

### A. Defensive Fetch Timeouts
External network calls (such as GDELT RSS feeds or Alpha Vantage endpoints) are wrapped in modern **AbortControllers** with a strict **1.5-second timeout**:
```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 1500);
const response = await fetch(gdeltUrl, { signal: controller.signal });
clearTimeout(timeoutId);
```
*Impact*: If GDELT or third-party servers undergo outages or high latency, the application aborts the request immediately instead of leaving client browsers in a permanently stuck "Loading" state.

### B. Durable Cache Layer
Successful live syntheses are cached in memory for **5 minutes**. Manual client-side refreshes bypass this cache, but standard browsing routes utilize cached data to reduce API key expenditure.

### C. Active Circuit Breaker (Quota Mitigation)
If a live query fails due to a **429 (Too Many Requests / RESOURCE_EXHAUSTED)** error or if the Gemini API key is missing:
1. The backend triggers an internal **Circuit Breaker** that temporarily disables outbound Gemini requests.
2. The cooldown period is locked for **30 minutes** to prevent continuous quota exhaustion loops.
3. During this cooldown, requests to `/api/live-data` bypass Gemini and instantly serve a beautifully pre-synthesized high-fidelity dataset:
```json
{
  "stockPrices": { ... },
  "contracts": [ ... ],
  "congressTrades": [ ... ],
  "macroRisks": [ ... ],
  "fallback": true,
  "info": "API in cooldown, serving pre-synthesized feed."
}
```
This ensures zero downtime for the user experience, maintaining fluid data delivery even when API keys are unconfigured or exhausted.
