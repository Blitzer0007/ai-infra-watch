export async function assertTelegramAccepted(response) {
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const detail = String(result?.description || '').slice(0, 200);
    const status = response.ok
      ? 'API rejected the message (HTTP ' + response.status + ')'
      : 'HTTP ' + response.status;
    throw new Error('Telegram delivery failed: ' + status + (detail ? ': ' + detail : ''));
  }
  return result;
}
