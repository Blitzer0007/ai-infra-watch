export function deliveryEvidence(row) {
  const messageId=Number.isSafeInteger(row.telegram_message_id) && row.telegram_message_id>0 ? String(row.telegram_message_id) : null;
  let state=['accepted','rejected','sending','uncertain'].includes(row.status)?row.status:'unknown';
  let reconciliationRequired=state==='sending'||state==='uncertain'||state==='unknown';
  if (state==='accepted'&&!messageId) { state='uncertain';reconciliationRequired=true; }
  if (state==='uncertain'&&messageId) { state='accepted';reconciliationRequired=true; }
  if ((state==='rejected'||state==='sending')&&messageId) { state='unknown';reconciliationRequired=true; }
  const explanation=state==='accepted' ? reconciliationRequired ? 'A provider message ID records acceptance, but ledger reconciliation is incomplete. Do not resend automatically.' : 'Telegram acceptance is recorded with a message ID. This does not establish that a person read the message or that position state was reconciled.'
    : state==='rejected' ? 'The ledger records rejection. This inbox does not retry delivery.'
    : state==='sending' ? 'A delivery claim is pending. Acceptance is not yet established; this inbox never reclaims or retries it.'
    : state==='uncertain' ? 'Acceptance could not be established. Reconciliation is required before any retry decision.'
    : 'Delivery evidence is missing or conflicting. No successful delivery is inferred.';
  return {deliveryState:state,providerMessageId:messageId,reconciliationRequired,explanation};
}

