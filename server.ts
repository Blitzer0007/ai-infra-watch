import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Cache for live-data to bypass rate limiting
interface Cache {
  data: any;
  timestamp: number;
}
let liveDataCache: Cache | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

// Circuit breaker state for API quota limits (429 / RESOURCE_EXHAUSTED)
let apiDisabledUntil = 0;
const COOLDOWN_DURATION_MS = 30 * 60 * 1000; // 30 minutes cooldown to avoid rate limit spamming

function getFallbackData() {
  return {
    stockPrices: {
      NVDA: { price: 192.53, changePct: 1.45 },
      NBIS: { price: 240.30, changePct: 3.12 },
      DGXX: { price: 4.50, changePct: -1.25 },
      MU: { price: 75.61, changePct: 0.82 },
      AMD: { price: 114.74, changePct: 1.15 },
      META: { price: 550.00, changePct: 2.30 },
      MSFT: { price: 371.50, changePct: -0.42 },
      GOOG: { price: 315.00, changePct: 0.95 },
      CERE: { price: 28.50, changePct: 4.10 },
      NOW: { price: 98.34, changePct: 0.22 },
      SUBQ: { price: 3.10, changePct: -2.10 },
      SNDK: { price: 2090.71, changePct: 1.65 },
      AMPG: { price: 6.55, changePct: -0.80 }
    },
    contracts: [
      {
        id: 'c1',
        company: 'NBIS',
        client: 'Meta Platforms Inc.',
        value: '$27.0B',
        duration: '5 Years',
        hardware: 'NVIDIA Blackwell & Vera Rubin Platforms',
        details: 'Dedicated AI computing and cluster services leased across multiple global data center hubs.',
        status: 'Active (Expanded from $3.0B on Mar 16, 2026)',
        statusLevel: 'high-verified',
        dateSigned: 'Mar 16, 2026',
        geminiImpactSummary: 'Ensures NBIS long-term high-margin revenue through 2031, cementing Meta reliance on custom cloud fabrics.'
      },
      {
        id: 'c2',
        company: 'NBIS',
        client: 'Microsoft Corporation',
        value: 'Up to $19.4B',
        duration: '5 Years',
        hardware: 'NVIDIA GPU datacenters',
        details: 'Dedicated high-density computing services hosted at the Vineland, New Jersey site for Azure.',
        status: 'Active',
        statusLevel: 'high-verified',
        dateSigned: 'Sep 2025',
        geminiImpactSummary: 'Sustains MSFT\'s global Azure dominance and diversifies their physical infrastructure supply pipelines.'
      },
      {
        id: 'c3',
        company: 'DGXX',
        client: 'Cerebras Systems Inc.',
        value: '$2.5B',
        duration: '10 Years',
        hardware: 'WSE-3 (Wafer-Scale Engine) Colocation',
        details: 'Anchor 40MW colocation contract signed for Columbiana, Alabama campus to build wafer-scale infrastructure.',
        status: 'Active',
        statusLevel: 'high-verified',
        dateSigned: 'May 5, 2026',
        geminiImpactSummary: 'Validates DGXX\'s strategic pivot towards specialized AI hosting; secures low-cost utility power access.'
      },
      {
        id: 'c4',
        company: 'DGXX',
        client: 'SubQ AI',
        value: '$19.6M',
        duration: '24 Months',
        hardware: 'Bare-metal Blackwell GPUs',
        details: 'Rental agreement to host high-performance database workloads on custom physical nodes.',
        status: 'Active',
        statusLevel: 'high-verified',
        dateSigned: 'Apr 20, 2026',
        geminiImpactSummary: 'Provides recurring operational cash-flow for DGXX while validating low-latency regional deployments.'
      }
    ],
    congressTrades: [
      {
        id: 'ct1',
        politician: 'Nancy Pelosi',
        chamber: 'House',
        stockSymbol: 'NVDA',
        transactionType: 'buy',
        amountRange: '$1,000,001 - $5,000,000',
        date: '2026-03-12',
        stockPrice: 151.20,
        geminiImpactSummary: 'Historically aligned with massive tech hardware momentum; further signals institutional policy tailwinds.'
      },
      {
        id: 'ct2',
        politician: 'Tommy Tuberville',
        chamber: 'Senate',
        stockSymbol: 'DGXX',
        transactionType: 'buy',
        amountRange: '$15,001 - $50,000',
        date: '2026-05-08',
        stockPrice: 3.90,
        geminiImpactSummary: 'Indicates high-level Senate interest in local physical energy grids and specialized datacenter plays.'
      },
      {
        id: 'ct3',
        politician: 'Ro Khanna',
        chamber: 'House',
        stockSymbol: 'MU',
        transactionType: 'buy',
        amountRange: '$50,001 - $100,000',
        date: '2026-03-24',
        stockPrice: 125.50,
        geminiImpactSummary: 'Shows domestic support for localized HBM memory manufacturers benefiting from the CHIPS Act.'
      }
    ],
    macroRisks: [
      {
        id: 'r1',
        category: 'Taiwan Geopolitics',
        title: 'Taiwan Strait Shipping Lane Control',
        impactRating: 'high',
        description: 'Any escalation around Taiwan directly impacts TSMC manufacturing facilities, potentially severing the entire high-performance silicon supply line for years.',
        dateUpdated: 'June 2026',
        geminiImpactSummary: 'Highest-threat risk; would severely drag NVDA, AMD, and MU hardware deliveries, favoring self-sufficient domestic hosts.'
      },
      {
        id: 'r2',
        category: 'Regulatory Actions',
        title: 'GPU Power & Emission Ceilings',
        impactRating: 'medium',
        description: 'Draft regional policies seeking to cap maximum single-site datacenters above 100MW based on local grids, affecting expansion models.',
        dateUpdated: 'May 2026',
        geminiImpactSummary: 'Incentivizes modular datacenter builds and drives interest in alternative nuclear/geothermal contracts.'
      },
      {
        id: 'r3',
        category: 'Chip Sanctions',
        title: 'Extended High-End Silicon Embargoes',
        impactRating: 'medium',
        description: 'US/EU expanding list of prohibited AI chips and accelerator models to extra jurisdictions, narrowing secondary market demand pipelines.',
        dateUpdated: 'June 2026',
        geminiImpactSummary: 'Restricts foreign monetization pathways but reinforces domestic hyperscaler supply priority.'
      }
    ],
    marketSentiment: 'Simulated AI Supply Chain Feed Active: High capital inflows amid localized utility power constraints.'
  };
}

// Helper to fetch live news from external feeds with protective timeouts to prevent blocks or timeout errors
async function fetchNewsFeeds(): Promise<any[]> {
  const articles: any[] = [];

  // 1. Fetch from GDELT DOC API (no key required!) with a defensive 1.5s timeout
  try {
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=(AI+infrastructure+OR+semiconductors+OR+GPUs+OR+microchips)&mode=ArtList&format=json&maxresults=10`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    
    const response = await fetch(gdeltUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.articles) {
        data.articles.forEach((art: any) => {
          articles.push({
            title: art.title,
            source: art.source || "GDELT",
            url: art.url,
            date: art.seendate,
            type: "gdelt"
          });
        });
      }
    }
  } catch (err: any) {
    console.warn("GDELT news fetch skipped or timed out:", err.message || err);
  }

  // 2. Fetch from Alpha Vantage News & Sentiment (Optional key) with 1.5s timeout
  const avKey = process.env.ALPHA_VANTAGE_API_KEY || "demo";
  try {
    const avUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=NVDA,AMD,MU,MSFT,GOOG,META&apikey=${avKey}&limit=10`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(avUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.feed) {
        data.feed.forEach((item: any) => {
          articles.push({
            title: item.title,
            summary: item.summary,
            url: item.url,
            source: item.source || "Alpha Vantage",
            date: item.time_published,
            sentimentScore: item.overall_sentiment_score,
            sentimentLabel: item.overall_sentiment_label,
            type: "alphavantage"
          });
        });
      }
    }
  } catch (err: any) {
    console.warn("Alpha Vantage news fetch skipped or timed out:", err.message || err);
  }

  // 3. Fetch from Marketaux API (Optional key) with 1.5s timeout
  const maKey = process.env.MARKETAUX_API_KEY;
  if (maKey) {
    try {
      const maUrl = `https://api.marketaux.com/v1/news/all?symbols=NVDA,AMD,MU,MSFT,GOOG,META&filter_entities=true&limit=10&api_token=${maKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(maUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.data) {
          data.data.forEach((item: any) => {
            articles.push({
              title: item.title,
              summary: item.description,
              url: item.url,
              source: item.source || "Marketaux",
              date: item.published_at,
              type: "marketaux"
            });
          });
        }
      }
    } catch (err: any) {
      console.warn("Marketaux news fetch skipped or timed out:", err.message || err);
    }
  }

  return articles;
}

// API endpoint to fetch live data
app.get("/api/live-data", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";

  // 1. Serve from cache if not expired
  if (!forceRefresh && liveDataCache && (Date.now() - liveDataCache.timestamp < CACHE_DURATION_MS)) {
    return res.json({ ...liveDataCache.data, cached: true });
  }

  // 2. Check if Gemini API key is missing
  if (!process.env.GEMINI_API_KEY) {
    const fallbackData = getFallbackData();
    liveDataCache = {
      data: fallbackData,
      timestamp: Date.now()
    };
    return res.json({ ...fallbackData, fallback: true, cached: false, info: "API key missing, serving pre-synthesized feed." });
  }

  // 3. Check if circuit breaker is active (cooldown due to 429 / resource exhausted)
  if (Date.now() < apiDisabledUntil) {
    const fallbackData = getFallbackData();
    return res.json({ ...fallbackData, fallback: true, cached: false, info: "API in cooldown, serving pre-synthesized feed." });
  }

  try {
    const newsFeeds = await fetchNewsFeeds();
    
    // Call Gemini to synthesize news and find exact prices
    const prompt = `You are an elite financial analysis AI system specializing in US equities and technology supply chains.
We have collected some live news articles and sentiment indicators from GDELT, Alpha Vantage, and Marketaux:
${JSON.stringify(newsFeeds.slice(0, 25), null, 2)}

Your task is to analyze these feeds, use your Google Search grounding capability to research current market facts, and generate a live comprehensive dataset including:
1. Current real-time stock prices and daily percent changes (reflecting late-June 2026 reality) for the symbols: NVDA, NBIS, DGXX, MU, AMD, META, MSFT, GOOG, CERE, NOW, SUBQ, SNDK, AMPG.
2. Synthesized AI commercial infrastructure contracts (4-6 contracts matching the symbols), including details of client deals, values, duration, and hardware spec, along with an analytical 'geminiImpactSummary' of how this impacts the stock.
3. Synthesized congressional trades (2-3 items) of tech/infra stocks, including the politician, chamber, transactionType, range, date, and 'geminiImpactSummary'.
4. Geopolitical and macroeconomic risk factors (3-4 items) detailing grid issues, embargoes, and Taiwan Strait tension updates, with a clear 'geminiImpactSummary'.
5. Overall market sentiment statement.

Ensure the returned data perfectly fits the provided JSON response schema. Make sure the date variables match modern timelines (mid-2026). Check real-time values for accuracy.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stockPrices: {
              type: Type.OBJECT,
              properties: {
                NVDA: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                NBIS: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                DGXX: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                MU: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                AMD: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                META: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                MSFT: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                GOOG: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                CERE: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                NOW: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                SUBQ: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                SNDK: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] },
                AMPG: { type: Type.OBJECT, properties: { price: { type: Type.NUMBER }, changePct: { type: Type.NUMBER } }, required: ["price", "changePct"] }
              },
              required: ["NVDA", "NBIS", "DGXX", "MU", "AMD", "META", "MSFT", "GOOG", "CERE", "NOW", "SUBQ", "SNDK", "AMPG"]
            },
            contracts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  company: { type: Type.STRING },
                  client: { type: Type.STRING },
                  value: { type: Type.STRING },
                  duration: { type: Type.STRING },
                  hardware: { type: Type.STRING },
                  details: { type: Type.STRING },
                  status: { type: Type.STRING },
                  statusLevel: { type: Type.STRING },
                  dateSigned: { type: Type.STRING },
                  geminiImpactSummary: { type: Type.STRING }
                },
                required: ["id", "company", "client", "value", "duration", "hardware", "details", "status", "statusLevel", "dateSigned", "geminiImpactSummary"]
              }
            },
            congressTrades: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  politician: { type: Type.STRING },
                  chamber: { type: Type.STRING },
                  stockSymbol: { type: Type.STRING },
                  transactionType: { type: Type.STRING },
                  amountRange: { type: Type.STRING },
                  date: { type: Type.STRING },
                  stockPrice: { type: Type.NUMBER },
                  geminiImpactSummary: { type: Type.STRING }
                },
                required: ["id", "politician", "chamber", "stockSymbol", "transactionType", "amountRange", "date", "stockPrice", "geminiImpactSummary"]
              }
            },
            macroRisks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  category: { type: Type.STRING },
                  title: { type: Type.STRING },
                  impactRating: { type: Type.STRING },
                  description: { type: Type.STRING },
                  dateUpdated: { type: Type.STRING },
                  geminiImpactSummary: { type: Type.STRING }
                },
                required: ["id", "category", "title", "impactRating", "description", "dateUpdated", "geminiImpactSummary"]
              }
            },
            marketSentiment: { type: Type.STRING }
          },
          required: ["stockPrices", "contracts", "congressTrades", "macroRisks", "marketSentiment"]
        }
      }
    });

    const textOutput = response.text || "{}";
    const parsedData = JSON.parse(textOutput);

    // Save to Cache
    liveDataCache = {
      data: parsedData,
      timestamp: Date.now()
    };

    return res.json({ ...parsedData, cached: false });
  } catch (err: any) {
    const errMsg = err.message || String(err);
    if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
      console.warn("Gemini Live Data API Rate Limit Exceeded (429/RESOURCE_EXHAUSTED). Engaging circuit breaker for 30 minutes to safeguard system performance.");
      apiDisabledUntil = Date.now() + COOLDOWN_DURATION_MS;
    } else {
      console.error("Gemini Live Data Compilation failed:", errMsg);
    }
    
    // Serve high-fidelity pre-synthesized data as fallbacks safely and cleanly
    const fallbackData = getFallbackData();
    liveDataCache = {
      data: fallbackData,
      timestamp: Date.now()
    };
    return res.json({ ...fallbackData, fallback: true, cached: false });
  }
});

// Configure Vite or Static Asset Serving
async function setupViteAndStatic() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

setupViteAndStatic();
