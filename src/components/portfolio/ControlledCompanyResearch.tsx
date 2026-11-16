import {useEffect,useState} from 'react';
import type {LedgerAvailability} from '../../utils/loadedLedgerReview';

/** Manual research follow-ups only. Exact source record is kept by the parent session. */
export default function ControlledCompanyResearch({symbol,holdingsStatus,isHolding,exactSourceContext}:{symbol:string;holdingsStatus:LedgerAvailability;isHolding:boolean;exactSourceContext:boolean}) {
  const [capturedAt,setCapturedAt]=useState<string|null>(null);
  useEffect(()=>setCapturedAt(null),[symbol,exactSourceContext]);
  return <details data-testid="controlled-company-research" className="rounded-xl border border-cyan-200/20 p-4">
    <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Company · Catalyst · Daily Review research checks</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>Research company: {symbol}. This workflow uses existing app-session context; it does not fetch filings, call a model, or poll alerts on its own.</p>
      <button type="button" onClick={()=>setCapturedAt(new Date().toISOString())} className="min-h-11 rounded border border-white/30 px-3">Inspect research coverage</button>
      {capturedAt&&<div data-testid="controlled-research-receipt" className="space-y-2" role="status">
        <p>Assessment: {capturedAt}. No external research or provider verification was performed.</p>
        <p>Company Research: issuer and original financial-statement provenance must be inspected independently. An unconnected dossier is not a verified fundamental source.</p>
        <p>Catalyst Research: {exactSourceContext?'An original opened record is available in this app session, but its publisher, precision, and corroboration remain unverified.':'No original clicked Calendar/Inbox record is available. Do not substitute another event for this company.'}</p>
        <p>Daily Review: {holdingsStatus!=='ready'?'Holdings coverage is unavailable; no portfolio-wide conclusion.':isHolding?'This is a loaded holding, but full trade history, quote freshness and corporate actions are not proven.':'This is not a loaded holding. Position size, P&L and exit actions are unavailable.'}</p>
        <p className="text-amber-100">Source Quality and Bull/Bear/Judge results require separately admitted evidence. No automatic buy, sell, hold, Telegram, or trade instruction is generated.</p>
      </div>}
    </div>
  </details>;
}
