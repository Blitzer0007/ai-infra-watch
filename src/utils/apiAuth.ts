const ACCESS_TOKEN_KEY = 'aiw_access_token_v1';

export function getAccessToken(): string {
  try { return sessionStorage.getItem(ACCESS_TOKEN_KEY) || ''; } catch { return ''; }
}

export function setAccessToken(token: string): void {
  try { sessionStorage.setItem(ACCESS_TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearAccessToken(): void {
  try { sessionStorage.removeItem(ACCESS_TOKEN_KEY); } catch { /* ignore */ }
}

export async function authenticateAccessToken(token: string): Promise<void> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Authentication failed');
  setAccessToken(token);
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAccessToken();
  return token ? { ...extra, Authorization: 'Bearer ' + token } : extra;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: authHeaders((init.headers as Record<string, string>) || {}) });
}
