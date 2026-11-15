/** No authoritative broker/history receipt is implemented yet. Claims in a DTO,
 * a model result, a caller flag or an environment variable cannot enable it. */
export function financialNotificationAdmission() {
  return { eligible: false, status: 'authoritative-receipt-unavailable',
    reason: 'Financial-return notifications require an internally verified full-history accounting/source receipt; loaded records alone cannot authorize delivery or state changes.' };
}
