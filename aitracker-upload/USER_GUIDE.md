# ai-infra-watch — Start & User Guide

A local multi-agent stock/AI-infrastructure research dashboard. Runs fully
offline in **stub mode** (no API keys, deterministic demo data). Optional live
mode adds real market data (Finnhub) and a real LLM (Anthropic/OpenAI).

---

## 1. Prerequisites

- **Python 3.10+** on PATH (`python --version`)
- Two free ports: **8000** (backend API) and **5500** (static site)
- Windows shell: examples use Git Bash. cmd/PowerShell equivalents noted where they differ.

---

## 2. One-time setup

From the project root
`C:\Users\haris\OneDrive\Documents\US Stock Tracker\aitracker\aitracker`:

```bash
# (optional but recommended) create a virtual env
python -m venv .venv
source .venv/Scripts/activate      # Git Bash
# .venv\Scripts\activate.bat        # cmd
# .venv\Scripts\Activate.ps1        # PowerShell

# core backend deps (light: FastAPI + uvicorn + pydantic + httpx + pytest)
pip install -r requirements.txt

# RAG / embeddings / MCP extras — only if you want live filings or real embeddings
pip install -r requirements-rag.txt
```

Stub mode needs nothing else. Without the RAG extras, semantic similarity and
hallucination checks fall back to deterministic lexical scoring (std-lib only).

---

## 3. Start (stub mode — the demo path)

Open **two terminals**, both at the project root.

**Terminal 1 — backend API:**
```bash
python -m uvicorn app.main:app --port 8000
```
Confirm it's up:
```bash
curl http://localhost:8000/api/health
# {"status":"ok","provider":"stub",...,"api_key_configured":false}
```

**Terminal 2 — static frontend:**
```bash
python -m http.server 5500
```

Then open **http://localhost:5500/index.html** in a browser.

> Default provider is already `stub` — no `.env` or keys required. To be explicit
> you can set `CI_USE_STUB_LLM=true` before launching uvicorn.

### Stop the servers
`Ctrl+C` in each terminal. Or by port:
```bash
# Git Bash on Windows
netstat -ano | grep ':8000 .*LISTENING'   # find the PID, then:
taskkill //PID <pid> //F
```

---

## 4. Using the dashboard

Left-nav sections (all served at `http://localhost:5500/...`):

| # | Page | What it shows |
|---|------|---------------|
| 01 | Overview (`index.html`) | Interactive AI supply-chain flow map |
| 02 | Contracts | Contract / deal tracking |
| 03 | Progress Tracker (`pages/tracker.html`) | Positions + **Earnings** (past, upcoming, price reaction) |
| 04 | Congress Trades | Congressional trade signals |
| 05 | Macro & Politics | Macro backdrop |
| 06 | Buy/Sell Watchlist | Watchlist with alert rules |
| 07 | **Ask the Analyst** (`pages/ask.html`) | Free-text question → multi-agent answer |
| ⚙ | Settings | Backend URL, Finnhub key, watchlist, theme |

### Ask the Analyst (the headline feature)
1. Go to section **07 Ask the Analyst**.
2. Type a question, or click a **sample** button:
   - **market** → "How did NVDA move today?"
   - **filings** → "What did the latest 10-K disclose about data center revenue growth?"
   - **both** → "How did the stock move and what did the filing say about revenue?"
3. The answer comes back with:
   - the **route** the supervisor chose (market / filings / both),
   - the **trajectory** (`retrieve → generate → finalize`) so you see *how* it answered,
   - a **groundedness** line per branch (e.g. "groundedness: 100% — grounded"),
   - an amber **"ungrounded"** badge only if a claim isn't supported by sources.

> **Stub-mode note:** answers are deterministic fixtures. Only the *canonical*
> sample questions have fixtures — free-form filings questions may come back
> empty until you switch to live LLM mode (below). The value on this page is the
> **routing + groundedness transparency**, not the prose.

### Settings
- **Backend URL** defaults to `http://localhost:8000` (change if you moved the port).
- **Finnhub key** lights up the live ticker + live quotes (see live mode).
- Everything is stored in your browser's `localStorage` — nothing leaves your machine.

---

## 5. API endpoints (for direct/programmatic use)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Service + config summary |
| POST/GET | `/api/ask` | Route a question through the supervisor (`?q=...` for GET) |
| POST/GET | `/api/eval` | Run the golden eval suite (`?case=golden-001` for one case) |
| POST/GET | `/api/earnings` | Past + upcoming earnings w/ price reaction (`?symbols=NBIS,DGXX`) |
| GET | `/docs` | Interactive OpenAPI docs |

Example:
```bash
curl -X POST http://localhost:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"How much did NVIDIA data center revenue grow?"}'
```

---

## 6. Optional: live mode

Live mode swaps canned data/LLM for real ones. Set env vars **before** launching uvicorn.

### 6a. Real LLM (better free-form answers)
```bash
export LLM_PROVIDER=anthropic          # or: openai
export ANTHROPIC_API_KEY=sk-ant-...    # or: OPENAI_API_KEY=sk-...
python -m uvicorn app.main:app --port 8000
```

### 6b. Real market data + earnings (Finnhub)
```bash
export STOCKS_MODE=live
export FINNHUB_API_KEY=<your-finnhub-key>
```
Also paste the Finnhub key into **Settings** so the frontend ticker/quotes go live.

> **What `STOCKS_MODE=live` actually affects** (verified against the code): the
> **`/api/earnings`** endpoint + the **Progress Tracker** page, and (via the
> Settings key) the browser ticker. It does **not** change the **Ask the Analyst**
> market answers — the in-process supervisor's market branch is hardwired to the
> fixture quote provider (`MarketAgent → StockService.from_env("fixture")`) so
> `/api/ask` stays deterministic. Live *prose* on the Ask page comes from
> `LLM_PROVIDER` (6a) and `FILINGS_MODE` (6c), not from `STOCKS_MODE`.

### 6c. Real filings (EDGAR) — two steps
Live filings need a corpus first (empty by default):
```bash
# 1) ingest filings into data/filings/ (fixture = offline sample; live = real EDGAR)
python scripts/ingest_filings.py                 # offline sample corpus
# python scripts/ingest_filings.py --mode live   # real EDGAR (needs EDGAR_USER_AGENT)

# 2) launch backend pointed at that corpus
export FILINGS_MODE=live
python -m uvicorn app.main:app --port 8000
```

### 6d. Optional: Corrective RAG on the filings branch
```bash
export FILINGS_CORRECTIVE=1     # retrieve → grade → re-query / honest fallback
```
Off by default (keeps `/api/ask` byte-identical to the hermetic demo).

> Windows cmd uses `set VAR=value`; PowerShell uses `$env:VAR="value"`.

---

## 6-WIN. Full live mode on Windows (step-by-step)

Everything below is verified against the code. Env vars set with `$env:` (PowerShell)
or `set` (cmd) last **only for that terminal window** — set them in the **same
window**, immediately before launching uvicorn.

### What you need first
- **Finnhub** free API key — https://finnhub.io (live quotes + earnings)
- **One LLM key** — Anthropic (`ANTHROPIC_API_KEY`) *or* OpenAI (`OPENAI_API_KEY`)
- **RAG extras installed** (required for live filings retrieval)

```powershell
cd C:\Users\haris\OneDrive\Documents\US Stock Tracker\aitracker\aitracker
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # if blocked: Set-ExecutionPolicy -Scope Process RemoteSigned
pip install -r requirements.txt
pip install -r requirements-rag.txt
```
(cmd activate: `.venv\Scripts\activate.bat`)

### Step 1 — ingest real filings ONCE (before starting the backend)
The filings corpus is empty by default. If you skip this, live filings **silently
fall back to the fixture sample corpus** (health won't error). SEC blocks generic
user-agents, so set a descriptive `EDGAR_USER_AGENT` with a real contact.

```powershell
$env:EDGAR_USER_AGENT = "ai-infra-watch/0.1 (jammytammy.no@example.com)"
python scripts\ingest_filings.py --mode live
# subset: python scripts\ingest_filings.py --mode live --symbols NVDA MSFT
```
Check the printed report: **`fetched:` and `chunks:` must be > 0.**

### Step 2 — start the backend in full live mode (Terminal 1, PowerShell)
```powershell
$env:LLM_PROVIDER       = "anthropic"        # or "openai"
$env:ANTHROPIC_API_KEY  = "sk-ant-..."       # or: $env:OPENAI_API_KEY = "sk-..."
$env:STOCKS_MODE        = "live"
$env:FINNHUB_API_KEY    = "your-finnhub-key"
$env:FILINGS_MODE       = "live"
$env:FILINGS_CORRECTIVE = "1"                 # optional: Corrective RAG
python -m uvicorn app.main:app --port 8000
```
Verify: `curl.exe http://localhost:8000/api/health` →
expect `"provider":"anthropic"` (or openai) and `"api_key_configured":true`.

**cmd.exe equivalent:**
```cmd
set LLM_PROVIDER=anthropic
set ANTHROPIC_API_KEY=sk-ant-...
set STOCKS_MODE=live
set FINNHUB_API_KEY=your-finnhub-key
set FILINGS_MODE=live
set FILINGS_CORRECTIVE=1
python -m uvicorn app.main:app --port 8000
```

### Step 3 — start the frontend (Terminal 2)
```powershell
cd C:\Users\haris\OneDrive\Documents\US Stock Tracker\aitracker\aitracker
python -m http.server 5500
```
Open http://localhost:5500/index.html → **Settings** → paste the **same Finnhub
key** into the box (the browser ticker reads it separately from the backend) and
confirm **Backend URL** = `http://localhost:8000`.

### Env var reference (all verified against the code)
| Var | Purpose | Needed for |
|---|---|---|
| `LLM_PROVIDER` + `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` | Real model | Real answers on Ask page (both branches) |
| `STOCKS_MODE=live` + `FINNHUB_API_KEY` | Real quotes/earnings | `/api/earnings` + Tracker page — **not** the Ask market branch |
| `FILINGS_MODE=live` | Read `data\filings\` corpus | Real 10-K/10-Q answers |
| `EDGAR_USER_AGENT` | SEC-compliant UA | The ingest step (not the server) |
| `FILINGS_CORRECTIVE=1` | Retrieve→grade→re-query | Optional, filings branch |

> The **Ask the Analyst** market branch is deliberately fixture-backed (the
> in-process supervisor uses `StockService.from_env("fixture")`), so `/api/ask`
> is deterministic even in full live mode. `STOCKS_MODE=live` powers the
> **earnings** endpoint and the **Tracker** page; the browser ticker reads the
> Settings key directly.

### Two live-mode gotchas
1. **Empty corpus → silent fixture fallback.** Always run Step 1 and confirm
   `chunks: > 0`. `/api/health` will still say `ok`; it just serves sample data.
2. **Finnhub key lives in two places** — backend env `FINNHUB_API_KEY` *and* the
   frontend Settings box. They're independent; set both.

---

## 7. Run the tests

```bash
python -m pytest -m "not live"      # full hermetic suite (~444 tests, offline)
python -m pytest                    # includes @live tests (need real keys)
```

---

## 8. Troubleshooting

| Symptom | Fix |
|--------|-----|
| Ask page says "backend not reachable" | Start uvicorn; check Settings → Backend URL matches the port |
| Filings answer is empty in stub mode | Expected for non-canonical questions — use a sample, or switch to live LLM |
| Ticker/quotes blank | Add a Finnhub key in Settings (+ `STOCKS_MODE=live` for the backend) |
| `FINNHUB_API_KEY is not set` | You enabled live stocks without the key — set it or drop back to fixture mode |
| Port already in use | Pick another port and update Settings → Backend URL to match |
| Live filings answer looks like sample data | Corpus empty → ran backend before ingesting. Do Step 1, confirm `chunks: > 0`, restart backend |
| EDGAR ingest returns 403 / blank | Set a descriptive `EDGAR_USER_AGENT` with a real contact email before ingesting |
| `/api/health` shows `provider:stub` in live mode | Env vars were set in a different window — set them in the SAME terminal as uvicorn |
| Answers still canned though keys are set | `LLM_PROVIDER` still `stub`; set it to `anthropic`/`openai` and confirm `api_key_configured:true` |

---

## 9. Scope & disclaimer

This is a **portfolio/demo research tool**, not production and **not investment
advice**. In stub mode all data is fixture data. Live mode depends on your keys
and ingested corpus. There is currently no auth on the API and CORS is open
(`*`) — keep it local.
