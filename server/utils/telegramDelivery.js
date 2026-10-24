export function isTelegramMessageAccepted(responseOk, payload) {
  return responseOk === true
    && payload?.ok === true
    && Number.isSafeInteger(payload?.result?.message_id)
    && payload.result.message_id > 0;
}

export function telegramDeliveryFailure(responseStatus, payload) {
  const detail = typeof payload?.description === 'string'
    ? ' ' + payload.description.slice(0, 240)
    : '';
  const statusText = responseStatus >= 200 && responseStatus < 300
    ? 'Telegram did not confirm an accepted message ID.'
    : 'Telegram API returned HTTP ' + responseStatus + '.';
  return statusText + detail;
}
