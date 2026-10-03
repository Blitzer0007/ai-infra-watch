import { requireAccess } from '../../api/_access-auth.js';

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEvent(input) {
  const type = ['price', 'large-move', 'catalyst'].includes(String(input?.type)) ? String(input.type) : null;
  const severity = ['info', 'medium', 'high', 'critical'].includes(String(input?.severity)) ? String(input.severity) : 'info';
  const symbol = cleanText(input?.symbol, 20).toUpperCase();
  const title = cleanText(input?.title, 160);
  const message = cleanText(input?.message, 1200);

  if (!type || !symbol || !title || !message) return null;
  return { type, severity, symbol, title, message };
}

async function sendTelegram(events) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!botToken || !chatId) {
    return {
      configured: false,
      sent: 0,
      error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not configured.',
    };
  }

  let sent = 0;
  const errors = [];

  for (const event of events) {
    try {
      const response = await fetch(
        'https://api.telegram.org/bot' + botToken + '/sendMessage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            chat_id: chatId,
            text: [
              '🚨 AI Infra Watch · Signal Alert',
              '',
              event.symbol + ' · ' + event.title,
              event.message,
              '',
              'Type: ' + event.type + ' · Severity: ' + event.severity,
              'Source: dashboard signal monitor',
              'Information alert only; no trade instruction is inferred.',
            ].join('\n'),
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = payload?.description ? ' ' + payload.description : '';
        } catch {}
        throw new Error('Telegram API returned HTTP ' + response.status + '.' + detail);
      }
      sent += 1;
    } catch (error) {
      errors.push(event.symbol + ': ' + String(error?.message || error));
    }
  }

  return { configured: true, sent, error: errors.length ? errors.join(' · ') : null };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      telegram_configured: Boolean(
        String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
        && String(process.env.TELEGRAM_CHAT_ID || '').trim()
      ),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rawEvents = Array.isArray(req.body?.events)
    ? req.body.events
    : req.body?.event
      ? [req.body.event]
      : [];

  const events = rawEvents.map(normalizeEvent).filter(Boolean).slice(0, 10);
  if (!events.length) {
    return res.status(400).json({ ok: false, error: 'At least one valid alert event is required.' });
  }

  const delivery = await sendTelegram(events);
  if (!delivery.configured) {
    return res.status(503).json({ ok: false, ...delivery });
  }
  if (delivery.sent !== events.length) {
    return res.status(502).json({ ok: false, ...delivery });
  }

  return res.status(200).json({ ok: true, ...delivery });
}
