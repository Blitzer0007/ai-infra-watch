export type AIQualityRegression = {
  passed: boolean;
  regressionCount: number;
  regressions: Array<{ metric: string; current: number; baseline: number; delta: number; allowedDelta: number; status: string }>;
  observed: Array<{ metric: string; current: number | null; baseline: number | null; delta?: number; allowedDelta?: number; status: string }>;
};

export type AIQualityAnalytics = {
  aggregates: Record<string, number | null>;
  latest: AIQualityRun | null;
  previous: AIQualityRun | null;
  regression: AIQualityRegression;
};

export type AIQualityRun = {
  id?: string;
  createdAt: string;
  suite: string;
  target: string;
  status: string;
  qualityScore: number | null;
  faithfulness: number | null;
  relevance: number | null;
  safety: number | null;
  hallucinationRate: number | null;
  citationCoverage: number | null;
  adversarialFailureRate: number | null;
  caseCount: number;
  failures: number;
  summary: string;
  metrics: Record<string, unknown>;
  cases: Array<Record<string, unknown>>;
};

export async function fetchAIQualityRuns(limit = 20): Promise<AIQualityRun[]> {
  const response = await fetch('/api/ai-quality?limit=' + encodeURIComponent(String(limit)), {
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Failed to load AI quality history.');
  return Array.isArray(body?.runs) ? body.runs : [];
}

export async function saveAIQualityRun(run: Omit<AIQualityRun, 'id' | 'createdAt'>): Promise<AIQualityRun> {
  const response = await fetch('/api/ai-quality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Failed to save AI quality run.');
  return body.run as AIQualityRun;
}

export async function fetchAIQualityAnalytics(limit = 20): Promise<AIQualityAnalytics> {
  const response = await fetch('/api/ai-quality?limit=' + encodeURIComponent(String(limit)), {
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Failed to load AI quality analytics.');
  return body?.analytics as AIQualityAnalytics;
}
