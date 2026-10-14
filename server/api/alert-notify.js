import { requireAccess } from '../../api/_access-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const localDedupe = new Map();

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEvent(input) {
  const type = ['price', 'large-move', 'catalyst'].includes(String(input?.type)) ? String(input.type) : null;
  const severity = ['info', 'medium', 'high', 'critical'].includes(String(input?.severity)) ? String(input.severity) : 'info';
  const symbol = cleanText(input?.symbol, 20).toUpperCase();
  const title = cleanText(input?.title, 160);
  const message = cleanText(input?.message, 1200);
  const dedupeKey = cleanText(input?.dedupeKey, 180).replace(/[^A-Za-z0-9:_-]/g, '_');
  const requestedMinutes = Number(input?.dedupeMinutes);
  const dedupeMinutes = Number.isFinite(requestedMinutes) ? Math.max(1, Math.min(10080, Math.floor(requestedMinutes))) : 1440;

  if (!type || !symbol || !title || !message) return null;
  return { type, severity, symbol, title, message, dedupeKey, dedupeMinutes };
}

function dedupeDbHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase notification dedupe is not configured');
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
}

async function shouldSuppress(event) {
  if (!event.dedupeKey) return false;
  const eventKey = 'notification:' + event.dedupeKey;
  const now = Date.now();
  const memoryAt = localDedupe.get(eventKey);
  if (Number.isFinite(memoryAt) && now - memoryAt < event.dedupeMinutes * 60000) return true;

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const response = await fetch(SUPABASE_URL + '/rest/v1/server_alert_state?event_key=eq.' + encodeURIComponent(eventKey) + '&select=last_triggered_at&limit=1', {
        headers: dedupeDbHeaders(), signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const rows = await response.json();
        const last = Date.parse(rows?.[0]?.last_triggered_at || '');
        if (Number.isFinite(last) && now - last < event.dedupeMinutes * 60000) {
          localDedupe.set(eventKey, last);
          return true;
        }
      }
    } catch { /* Continue with process-local suppression if the database is unavailable. */ }
  }
  return false;
}

async function recordSent(event) {
  if (!event.dedupeKey) return;
  const eventKey = 'notification:' + event.dedupeKey;
  const now = new Date().toISOString();
  localDedupe.set(eventKey, Date.parse(now));
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/server_alert_state?on_conflict=event_key', {
      method: 'POST',
      headers: { ...dedupeDbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        event_key: eventKey,
        active: true,
        last_seen_at: now,
        last_triggered_at: now,
        metadata: { source: 'alert-notify', symbol: event.symbol, title: event.title, dedupe_minutes: event.dedupeMinutes },
      }]),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* Delivery already succeeded; in-memory dedupe still applies for this instance. */ }
}

async function inspectTelegramChat() {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) {
    return { status: 'not_configured', chatId: chatId || null, label: null, message: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in server environment settings.' };
  }
  try {
    const response = await fetch(
      'https://api.telegram.org/bot' + botToken + '/getChat?chat_id=' + encodeURIComponent(chatId),
      { method: 'GET', signal: AbortSignal.timeout(8000) },
    );
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok === true && payload?.result) {
      const chat = payload.result;
      const label = String(chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? '@' + chat.username : '') || '');
      return { status: 'verified', chatId, label: label || null, message: 'Telegram can resolve this chat ID.' };
    }
    const description = String(payload?.description || '');
    if (response.status === 400 && /chat not found|chat_id|chat not accessible/i.test(description)) {
      return { status: 'invalid', chatId, label: null, message: 'Telegram cannot resolve this chat ID. Check TELEGRAM_CHAT_ID and make sure the bot has been started or added to the target group/channel.' };
    }
    return { status: 'unknown', chatId, label: null, message: 'Telegram chat verification could not be completed (HTTP ' + response.status + ').' };
  } catch {
    return { status: 'unknown', chatId, label: null, message: 'Telegram chat verification timed out or the Telegram API is unreachable.' };
  }
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
          body: JSON.stringify({
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
          }),
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
    const botTokenConfigured = Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim());
    const chatIdConfigured = Boolean(String(process.env.TELEGRAM_CHAT_ID || '').trim());
    const telegramChat = await inspectTelegramChat();
    return res.status(200).json({
      ok: true,
      telegram_configured: botTokenConfigured && chatIdConfigured,
      telegram_bot_token_configured: botTokenConfigured,
      telegram_chat_id_configured: chatIdConfigured,
      telegram_chat: telegramChat,
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
  if (!String(process.env.TELEGRAM_BOT_TOKEN || '').trim() || !String(process.env.TELEGRAM_CHAT_ID || '').trim()) {
    return res.status(503).json({ ok: false, configured: false, sent: 0, error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not configured.' });
  }

  const eligible = [];
  let suppressed = 0;
  for (const event of events) {
    if (await shouldSuppress(event)) suppressed += 1;
    else eligible.push(event);
  }
  if (!eligible.length) return res.status(200).json({ ok: true, configured: true, sent: 0, suppressed });

  const delivery = await sendTelegram(eligible);
  if (!delivery.configured) {
    return res.status(503).json({ ok: false, ...delivery, suppressed });
  }
  if (delivery.sent !== eligible.length) {
    return res.status(502).json({ ok: false, ...delivery, suppressed });
  }
  for (const event of eligible) await recordSent(event);

  return res.status(200).json({ ok: true, ...delivery, suppressed });
}
