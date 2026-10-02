import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { LockKeyhole, Loader2 } from 'lucide-react';
import { authenticateAccessToken, clearAccessToken, getAccessToken } from '../utils/apiAuth';

type Props = { children: ReactNode };

export default function AccessGate({ children }: Props) {
  const [token, setToken] = useState(() => getAccessToken());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (token) return <>{children}</>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      await authenticateAccessToken(value);
      setToken(value);
      setDraft('');
    } catch (err) {
      clearAccessToken();
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-white flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#15181E] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2.5">
            <LockKeyhole className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">AI INFRA WATCH</div>
            <h1 className="text-xl font-semibold mt-1">Private dashboard</h1>
          </div>
        </div>
        <p className="text-xs text-white/45 leading-relaxed mb-5">
          Enter your private access token. It is kept only for this browser session and is sent over HTTPS to protected API routes.
        </p>
        <input
          autoFocus
          type="password"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Access token"
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-emerald-400/40"
        />
        {error && <div className="mt-3 rounded-lg border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-mono font-black uppercase tracking-wider text-black disabled:opacity-40"
        >
          {busy ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</span> : 'Unlock dashboard'}
        </button>
        <div className="mt-4 text-[10px] text-white/25 leading-relaxed">
          If access is not configured, set <span className="font-mono text-white/40">AIW_ACCESS_TOKEN</span> in Vercel before deployment.
        </div>
      </form>
    </div>
  );
}
